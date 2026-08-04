import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ts, x-nonce, x-sig, x-build-id, x-gateway-ts, x-gateway-nonce, x-gateway-ip, x-gateway-body-sha256, x-gateway-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const inputSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^(SUNNY|FAKELAG)-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i, "INVALID_KEY_FORMAT"),
  device: z.string().trim().min(1).max(128),
  // Optional friendly label for display in admin panel only.
  // IMPORTANT: device limit/enforcement MUST rely on `device` (stable id) only.
  device_name: z.string().trim().min(1).max(128).optional(),
  build_id: z.string().trim().min(1).max(80).optional(),
  product_id: z.string().trim().min(1).max(80).optional(),
  device_public_key: z.string().trim().min(40).max(2048).optional(),
  device_proof: z.string().trim().min(40).max(2048).optional(),
  device_proof_alg: z.literal("SHA256withECDSA").optional(),
});

const REQUIRED_BUILD_ID = (Deno.env.get("VERIFY_REQUIRED_BUILD_ID") ?? "sunny-v34-ac-20260721").trim();
const PRODUCT_ID = (Deno.env.get("VERIFY_PRODUCT_ID") ?? "sunny-free-fire").trim();
const SERVER_SIG_ALG = "ECDSA-P256-SHA256-V3";
const SERVER_KEY_ID = (
  Deno.env.get("VERIFY_RESPONSE_ECDSA_KEY_ID") ??
  "sunny-p256-2026-07-b"
).trim();
const VERIFY_REQUIRE_GATEWAY = (Deno.env.get("VERIFY_REQUIRE_GATEWAY") ?? "1").trim() !== "0";
const VERIFY_REQUIRE_DEVICE_KEY = (Deno.env.get("VERIFY_REQUIRE_DEVICE_KEY") ?? "0").trim() === "1";

function envInt(name: string, fallback: number, min = 1, max = 100000) {
  const raw = (Deno.env.get(name) ?? "").trim();
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

// Tunable from Supabase Edge Function secrets. Defaults are lenient enough for testing,
// but still stop render-loop spam.
const VERIFY_IP_RATE_LIMIT = envInt("VERIFY_IP_RATE_LIMIT", 300, 30, 5000);
const VERIFY_IP_RATE_WINDOW_SECONDS = envInt("VERIFY_IP_RATE_WINDOW_SECONDS", 60, 10, 3600);
const VERIFY_KEY_RATE_LIMIT = envInt("VERIFY_KEY_RATE_LIMIT", 60, 5, 1000);
const VERIFY_KEY_RATE_WINDOW_SECONDS = envInt("VERIFY_KEY_RATE_WINDOW_SECONDS", 300, 60, 3600);
const VERIFY_NEW_DEVICE_LIMIT = envInt("VERIFY_NEW_DEVICE_LIMIT", 20, 1, 200);
const VERIFY_NEW_DEVICE_WINDOW_SECONDS = envInt("VERIFY_NEW_DEVICE_WINDOW_SECONDS", 3600, 60, 86400);
const VERIFY_ENUM_FAILURE_5M_LIMIT = envInt("VERIFY_ENUM_FAILURE_5M_LIMIT", 80, 10, 10000);
const VERIFY_ENUM_DISTINCT_10M_LIMIT = envInt("VERIFY_ENUM_DISTINCT_10M_LIMIT", 100, 10, 10000);
const VERIFY_ENUM_BLOCK_MINUTES = envInt("VERIFY_ENUM_BLOCK_MINUTES", 15, 1, 1440);
// Client polls every 12 minutes and rejects sessions longer than 30 minutes.
const VERIFY_SESSION_TTL_SECONDS = envInt("VERIFY_SESSION_TTL_SECONDS", 900, 180, 1800);
const VERIFY_MAX_BODY_BYTES = envInt("VERIFY_MAX_BODY_BYTES", 8192, 1024, 65536);

function isUnstableDeviceId(value: string) {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "unknown_device" ||
    normalized === "unknown" ||
    normalized === "null" ||
    normalized === "undefined" ||
    normalized === "9774d56d682e549c"
  ) {
    return true;
  }
  return false;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}

class PayloadTooLargeError extends Error {
  constructor() {
    super("PAYLOAD_TOO_LARGE");
    this.name = "PayloadTooLargeError";
  }
}

async function readTextBodyWithLimit(req: Request, maxBytes: number) {
  const rawLength = (req.headers.get("content-length") ?? "").trim();
  if (rawLength) {
    const declaredLength = Number(rawLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0 || declaredLength > maxBytes) {
      throw new PayloadTooLargeError();
    }
  }
  if (!req.body) return "";

  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel("PAYLOAD_TOO_LARGE");
      throw new PayloadTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function toHex(bytes: ArrayBuffer | Uint8Array) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(data)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary);
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return toHex(sig);
}

function normalizePem(raw: string) {
  return raw.trim().replace(/\\n/g, "\n");
}

function pemToDer(pem: string, expectedLabel: string) {
  const normalized = normalizePem(pem);
  const begin = `-----BEGIN ${expectedLabel}-----`;
  const end = `-----END ${expectedLabel}-----`;
  if (!normalized.includes(begin) || !normalized.includes(end)) {
    throw new Error(`BAD_PEM_${expectedLabel.replace(/ /g, "_")}`);
  }
  const body = normalized
    .replace(begin, "")
    .replace(end, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function derInteger(raw: Uint8Array) {
  let first = 0;
  while (first < raw.length - 1 && raw[first] === 0) first++;
  let value = raw.slice(first);
  if ((value[0] & 0x80) !== 0) {
    const padded = new Uint8Array(value.length + 1);
    padded[0] = 0;
    padded.set(value, 1);
    value = padded;
  }
  const out = new Uint8Array(2 + value.length);
  out[0] = 0x02;
  out[1] = value.length;
  out.set(value, 2);
  return out;
}

// WebCrypto returns an IEEE-P1363 r||s signature on Deno/Node. OpenSSL's
// ECDSA_verify in the native client expects ASN.1 DER, so convert it here.
function p1363ToDer(signature: Uint8Array) {
  if (signature.length !== 64) return signature;
  const r = derInteger(signature.slice(0, 32));
  const s = derInteger(signature.slice(32, 64));
  const out = new Uint8Array(2 + r.length + s.length);
  out[0] = 0x30;
  out[1] = r.length + s.length;
  out.set(r, 2);
  out.set(s, 2 + r.length);
  return out;
}

let signingKeyPromise: Promise<CryptoKey> | null = null;

function getSigningKey() {
  if (signingKeyPromise) return signingKeyPromise;
  signingKeyPromise = (async () => {
    const privatePem = (Deno.env.get("VERIFY_RESPONSE_ECDSA_PRIVATE_KEY_PEM") ?? "").trim();
    if (!privatePem) throw new Error("ECDSA_PRIVATE_KEY_MISSING");
    const pkcs8 = pemToDer(privatePem, "PRIVATE KEY");
    return await crypto.subtle.importKey(
      "pkcs8",
      pkcs8,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
  })();
  return signingKeyPromise;
}

async function ecdsaP256SignDerBase64(message: string) {
  const key = await getSigningKey();
  const raw = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(message),
  ));
  return bytesToBase64(p1363ToDer(raw));
}

function randomHex(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

function signedResponseCanonicalV3(args: {
  nonce: string;
  request_body_hash: string;
  key_hash: string;
  device_hash: string;
  build_id: string;
  product_id: string;
  remaining_seconds: number;
  expires_at: string | null;
  max_devices: number;
  started: boolean;
  server_time: string;
  session_id: string;
  session_expires_at: string;
  session_generation: string;
  exp_generation: string;
  build_not_before: string;
  build_expires_at: string;
  capability_nonce: string;
  capability_expires_at: string;
  feature_seed: string;
  device_key_bound: boolean;
}) {
  return [
    "v3",
    args.nonce,
    args.request_body_hash,
    args.key_hash,
    args.device_hash,
    args.build_id,
    args.product_id,
    "true",
    String(args.remaining_seconds),
    args.expires_at ?? "",
    String(args.max_devices),
    args.started ? "true" : "false",
    args.server_time,
    args.session_id,
    args.session_expires_at,
    args.session_generation,
    args.exp_generation,
    args.build_not_before,
    args.build_expires_at,
    args.capability_nonce,
    args.capability_expires_at,
    args.feature_seed,
    args.device_key_bound ? "true" : "false",
  ].join("\n");
}

async function importP256PublicKey(spkiBase64: string) {
  const binary = atob(spkiBase64);
  const der = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) der[i] = binary.charCodeAt(i);
  return await crypto.subtle.importKey(
    "spki",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}

function derEcdsaToP1363(der: Uint8Array) {
  if (der.length < 8 || der[0] !== 0x30 || der[1] !== der.length - 2) return null;
  let offset = 2;
  const readInteger = () => {
    if (offset + 2 > der.length || der[offset++] !== 0x02) return null;
    const length = der[offset++];
    if (length < 1 || offset + length > der.length) return null;
    let value = der.slice(offset, offset + length);
    offset += length;
    while (value.length > 32 && value[0] === 0) value = value.slice(1);
    if (value.length > 32) return null;
    const output = new Uint8Array(32);
    output.set(value, 32 - value.length);
    return output;
  };
  const r = readInteger();
  const ss = readInteger();
  if (!r || !ss || offset !== der.length) return null;
  const output = new Uint8Array(64);
  output.set(r, 0);
  output.set(ss, 32);
  return output;
}

async function verifyDeviceProof(
  publicKeySpkiBase64: string,
  payload: string,
  signatureDerBase64: string,
) {
  try {
    const key = await importP256PublicKey(publicKeySpkiBase64);
    const binary = atob(signatureDerBase64);
    const der = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) der[i] = binary.charCodeAt(i);
    const p1363 = derEcdsaToP1363(der);
    if (!p1363) return false;
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      p1363,
      new TextEncoder().encode(payload),
    );
  } catch {
    return false;
  }
}

async function verifyGateway(req: Request, rawBody: string) {
  const gatewaySecret = (Deno.env.get("VERIFY_GATEWAY_SHARED_SECRET") ?? "").trim();
  if (!gatewaySecret) {
    return VERIFY_REQUIRE_GATEWAY
      ? { ok: false, reason: "GATEWAY_SECRET_MISSING", ip: "" }
      : { ok: true, reason: "GATEWAY_DISABLED", ip: getClientIp(req) };
  }

  const ts = (req.headers.get("x-gateway-ts") ?? "").trim();
  const nonce = (req.headers.get("x-gateway-nonce") ?? "").trim();
  const ip = (req.headers.get("x-gateway-ip") ?? "").trim();
  const bodyHash = (req.headers.get("x-gateway-body-sha256") ?? "").trim().toLowerCase();
  const signature = (req.headers.get("x-gateway-signature") ?? "").trim().toLowerCase();
  if (!isValidTs(ts) || !isValidNonce(nonce) || !ip || !isValidSigHex(bodyHash) || !isValidSigHex(signature)) {
    return { ok: false, reason: "GATEWAY_HEADERS_BAD", ip: "" };
  }

  const nowUnix = Math.floor(Date.now() / 1000);
  const tsNumber = Number(ts);
  if (!Number.isFinite(tsNumber) || Math.abs(nowUnix - tsNumber) > 120) {
    return { ok: false, reason: "GATEWAY_TS_WINDOW", ip: "" };
  }

  const expectedBodyHash = await sha256Hex(rawBody);
  if (!timingSafeEqualHex(expectedBodyHash, bodyHash)) {
    return { ok: false, reason: "GATEWAY_BODY_HASH_BAD", ip: "" };
  }

  const canonical = ["v1", req.method.toUpperCase(), "verify-key", ts, nonce, ip, bodyHash].join("\n");
  const expected = await hmacSha256Hex(gatewaySecret, canonical);
  if (!timingSafeEqualHex(expected, signature)) {
    return { ok: false, reason: "GATEWAY_SIGNATURE_BAD", ip: "" };
  }
  return { ok: true, reason: "OK", ip };
}

function timingSafeEqualHex(a: string, b: string) {
  // Constant-time-ish compare for equal-length hex strings.
  const aa = a.toLowerCase();
  const bb = b.toLowerCase();
  if (aa.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < aa.length; i++) {
    out |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  }
  return out === 0;
}

function isValidTs(ts: string) {
  // Strictly digits; keep it simple as requested.
  return /^[0-9]{1,20}$/.test(ts);
}

function isValidNonce(nonce: string) {
  // Allow common nonce formats; limit length.
  return typeof nonce === "string" && nonce.length >= 1 && nonce.length <= 128;
}

function isValidSigHex(sig: string) {
  return /^[a-f0-9]{64}$/i.test(sig);
}

function getRequestHmacSecret() {
  // `VERIFY_REQUEST_HMAC_SECRET` is the canonical V34 name.  Keep a
  // compatibility fallback to `VERIFY_HMAC_SECRET` because the currently
  // released menu and the existing GitHub deployment secret still use that
  // value.  This does not weaken verification: both names resolve to the same
  // request-HMAC secret and the request still has to pass the exact canonical
  // signature check below.
  const primary = (Deno.env.get("VERIFY_REQUEST_HMAC_SECRET") ?? "").trim();
  if (primary) return primary;
  return (Deno.env.get("VERIFY_HMAC_SECRET") ?? "").trim();
}

function getClientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "0.0.0.0";
}

function windowStartISO(now: Date, minutes: number) {
  const ms = minutes * 60 * 1000;
  const w = Math.floor(now.getTime() / ms) * ms;
  return new Date(w).toISOString();
}

async function maybeInsertEnumerationAlert(
  db: any,
  ip: string,
  key?: string,
) {
  const metrics = await db.rpc(
    "security_metrics_for_ip" as any,
    { p_ip: ip } as any,
  );
  if (metrics.error) return;
  const row: any = metrics.data?.[0];
  if (!row) return;

  const failure5m = Number(row.failure_5m ?? 0);
  const distinct10m = Number(row.distinct_keys_10m ?? 0);

  if (failure5m <= VERIFY_ENUM_FAILURE_5M_LIMIT && distinct10m <= VERIFY_ENUM_DISTINCT_10M_LIMIT) return;

  await db.from("security_alerts").insert({
    kind: "ENUMERATION",
    ip,
    key_prefix: typeof key === "string" ? key.slice(0, 10) : null,
    meta: {
      failure_5m: failure5m,
      distinct_keys_10m: distinct10m,
      thresholds: { failure_5m: VERIFY_ENUM_FAILURE_5M_LIMIT, distinct_keys_10m: VERIFY_ENUM_DISTINCT_10M_LIMIT },
    },
  });

  // Auto-block IP temporarily when enumeration looks high.
  // Response contract remains unchanged; callers will see RATE_LIMIT.
  try {
    const now = new Date();
    const blockMinutes = VERIFY_ENUM_BLOCK_MINUTES;
    const newUntil = new Date(now.getTime() + blockMinutes * 60 * 1000).toISOString();

    const existing = await db
      .from("blocked_ips")
      .select("blocked_until")
      .eq("ip", ip)
      .maybeSingle();

    const prevUntil = existing.data?.blocked_until ? new Date(existing.data.blocked_until).getTime() : 0;
    const nextUntilMs = Math.max(prevUntil, new Date(newUntil).getTime());

    await db
      .from("blocked_ips")
      .upsert(
        {
          ip,
          blocked_until: new Date(nextUntilMs).toISOString(),
          reason: "ENUMERATION",
          meta: {
            failure_5m: failure5m,
            distinct_keys_10m: distinct10m,
            block_minutes: blockMinutes,
          },
          updated_at: now.toISOString(),
        },
        { onConflict: "ip" },
      );
  } catch {
    // Best-effort only.
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, msg: "METHOD_NOT_ALLOWED" }, 405);

  let rawBody = "";
  try {
    rawBody = await readTextBodyWithLimit(req, VERIFY_MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return json({ ok: false, msg: "INVALID_INPUT" }, 413);
    return json({ ok: false, msg: "INVALID_INPUT" }, 400);
  }
  const gateway = await verifyGateway(req, rawBody);
  if (!gateway.ok) {
    return json({ ok: false, msg: "GATEWAY_REQUIRED" }, 403);
  }
  const ip = gateway.ip;
  const now = new Date();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // --- Early blocklist check (auto-blocked IPs) ---
  // Keep contract unchanged: return RATE_LIMIT.
  const blk = await db
    .from("blocked_ips")
    .select("blocked_until")
    .eq("ip", ip)
    .maybeSingle();

  if (blk.error) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: "",
      detail: { ip, ok: false, msg: "SERVER_ERROR", reason: "BLOCKLIST_LOOKUP_FAILED" },
    });
    return json({ ok: false, msg: "SERVER_ERROR" }, 503);
  }

  const untilIso = blk.data?.blocked_until ?? null;
  const untilMs = untilIso ? new Date(untilIso).getTime() : 0;
  if (untilMs && untilMs > now.getTime()) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: "",
      detail: { ip, ok: false, msg: "RATE_LIMIT", reason: "IP_BLOCKED" },
    });
    return json({ ok: false, msg: "RATE_LIMIT", retry_after_seconds: Math.max(1, Math.ceil((untilMs - now.getTime()) / 1000)) }, 429);
  }

  // --- HMAC-signed requests (anti-enumeration) ---
  // Require x-ts, x-nonce, x-sig.
  // Canonical: `${x-ts}.${x-nonce}.${sha256_hex(raw_body)}`
  // Sig: HMAC_SHA256_HEX(VERIFY_HMAC_SECRET, canonical)
  const requestBodyHash = await sha256Hex(rawBody);

  const ts = req.headers.get("x-ts") ?? "";
  const nonce = req.headers.get("x-nonce") ?? "";
  const sig = req.headers.get("x-sig") ?? "";

  if (!isValidTs(ts) || !isValidNonce(nonce) || !isValidSigHex(sig)) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: "",
      detail: { ip, ok: false, msg: "UNAUTHORIZED", reason: "BAD_HEADERS" },
    });
    // Don't leak key status; keep HTTP 200 as requested.
    return json({ ok: false, msg: "UNAUTHORIZED" }, 200);
  }

  // Request HMAC is anti-spam/anti-enumeration only. It is not a trusted
  // device identity because its secret exists in the client process.
  const secret = getRequestHmacSecret();
  if (!secret) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: "",
      detail: { ip, ok: false, msg: "UNAUTHORIZED", reason: "MISCONFIGURED" },
    });
    // Misconfigured backend; still don't leak any key status.
    return json({ ok: false, msg: "UNAUTHORIZED" }, 200);
  }

  const canonical = `${ts}.${nonce}.${requestBodyHash}`;
  const expected = await hmacSha256Hex(secret, canonical);
  if (!timingSafeEqualHex(expected, sig)) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: "",
      detail: { ip, ok: false, msg: "UNAUTHORIZED", reason: "BAD_SIG" },
    });
    return json({ ok: false, msg: "UNAUTHORIZED" }, 200);
  }

  // --- Anti-replay ---
  // Enforce timestamp window: abs(now_unix_seconds - x-ts) <= 300
  const nowUnix = Math.floor(now.getTime() / 1000);
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(nowUnix - tsNum) > 300) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: "",
      detail: { ip, ok: false, msg: "UNAUTHORIZED", reason: "TS_WINDOW" },
    });
    return json({ ok: false, msg: "UNAUTHORIZED" }, 200);
  }

  // Store nonce with TTL 10 minutes; reject replays on conflict.
  const nonceExpiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  const nonceInsert = await db.from("request_nonces").insert({
    nonce,
    ts: Math.trunc(tsNum),
    expires_at: nonceExpiresAt,
  });
  if (nonceInsert.error) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: "",
      detail: { ip, ok: false, msg: "UNAUTHORIZED", reason: "NONCE_REPLAY" },
    });
    // Conflict (duplicate nonce) or any DB error: fail closed but generic.
    return json({ ok: false, msg: "UNAUTHORIZED" }, 200);
  }

  // Lightweight cleanup (best-effort)
  if (Math.random() < 0.02) {
    await db.from("request_nonces").delete().lt("expires_at", now.toISOString());
  }

  let body: unknown;
  try {
    body = rawBody.length ? JSON.parse(rawBody) : {};
  } catch {
    return json({ ok: false, msg: "INVALID_JSON" }, 400);
  }

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, msg: "INVALID_INPUT" }, 400);
  }

  // Normalize key before querying
  const key = parsed.data.key.trim().toUpperCase();
  const device = parsed.data.device;
  const deviceName = parsed.data.device_name;
  if (isUnstableDeviceId(device)) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: key,
      detail: {
        ip,
        ok: false,
        msg: "DEVICE_ID_UNSTABLE",
        reason: "PLACEHOLDER_DEVICE_ID",
      },
    });
    return json({ ok: false, msg: "DEVICE_ID_UNSTABLE" }, 200);
  }
  const bodyBuildId = (parsed.data.build_id ?? "").trim();
  const headerBuildId = (req.headers.get("x-build-id") ?? "").trim();
  const buildId = bodyBuildId;
  const productId = (parsed.data.product_id ?? "").trim();
  const reqNonce = req.headers.get("x-nonce") ?? "";

  // Bind the authenticated request body and gateway header to the exact same build.
  // This still works in virtual spaces because it does not rely on APK signatures.
  if (!bodyBuildId || !headerBuildId || bodyBuildId !== headerBuildId || bodyBuildId !== REQUIRED_BUILD_ID || productId !== PRODUCT_ID) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: key,
      detail: { ip, device, ok: false, msg: "APP_UPDATE_REQUIRED", reason: "BAD_BUILD_ID", build_id: buildId },
    });
    return json({ ok: false, msg: "APP_UPDATE_REQUIRED" }, 200);
  }

  const buildRow = await db
    .from("security_client_builds")
    .select("build_id,product_id,is_active,not_before,expires_at,exp_generation")
    .eq("build_id", buildId)
    .eq("product_id", productId)
    .maybeSingle();
  if (buildRow.error || !buildRow.data || !buildRow.data.is_active) {
    return json({ ok: false, msg: "APP_UPDATE_REQUIRED" }, 200);
  }
  const buildNotBeforeMs = new Date(buildRow.data.not_before).getTime();
  const buildExpiresAtMs = new Date(buildRow.data.expires_at).getTime();
  if (!Number.isFinite(buildNotBeforeMs) || !Number.isFinite(buildExpiresAtMs) ||
      now.getTime() + 300000 < buildNotBeforeMs || now.getTime() >= buildExpiresAtMs) {
    return json({ ok: false, msg: "APP_UPDATE_REQUIRED" }, 200);
  }

  // 0) IP-only rate limit (in parallel with key+ip)
  // This helps even when attackers rotate keys.
  const IP_RATE_LIMIT = VERIFY_IP_RATE_LIMIT;
  const IP_RATE_WINDOW_SECONDS = VERIFY_IP_RATE_WINDOW_SECONDS;
  const ipRl = await db.rpc("check_ip_rate_limit", {
    p_ip: ip,
    p_limit: IP_RATE_LIMIT,
    p_window_seconds: IP_RATE_WINDOW_SECONDS,
  });
  if (ipRl.error) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: key,
      detail: { ip, device, ok: false, msg: "SERVER_ERROR", reason: "IP_RATE_LIMIT_RPC_FAILED" },
    });
    return json({ ok: false, msg: "SERVER_ERROR" }, 503);
  }
  const ipAllowed = Boolean(ipRl.data?.[0]?.allowed);
  if (!ipAllowed) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: key,
      detail: {
        ip,
        device,
        ok: false,
        msg: "RATE_LIMIT",
        kind: "IP_ONLY",
        current_count: ipRl.data?.[0]?.current_count ?? null,
      },
    });

    await maybeInsertEnumerationAlert(db, ip, key);
    return json({ ok: false, msg: "RATE_LIMIT", retry_after_seconds: IP_RATE_WINDOW_SECONDS }, 429);
  }

  // 1) Rate limit (key + ip) - light
  const RATE_LIMIT = VERIFY_KEY_RATE_LIMIT;
  const RATE_WINDOW_SECONDS = VERIFY_KEY_RATE_WINDOW_SECONDS;
  const rl = await db.rpc("check_rate_limit", {
    p_key: key,
    p_ip: ip,
    p_limit: RATE_LIMIT,
    p_window_seconds: RATE_WINDOW_SECONDS,
  });

  // Security-sensitive endpoint: rate-limit bookkeeping fails closed.
  if (rl.error) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: key,
      detail: { ip, device, ok: false, msg: "SERVER_ERROR", reason: "KEY_RATE_LIMIT_RPC_FAILED" },
    });
    return json({ ok: false, msg: "SERVER_ERROR" }, 503);
  }
  const allowed = Boolean(rl.data?.[0]?.allowed);
  if (!allowed) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: key,
      detail: { ip, device, ok: false, msg: "RATE_LIMIT", current_count: rl.data?.[0]?.current_count ?? null },
    });

    await maybeInsertEnumerationAlert(db, ip, key);
    return json({ ok: false, msg: "RATE_LIMIT", retry_after_seconds: RATE_WINDOW_SECONDS }, 429);
  }

  // 2) Fetch license
  const lic = await db
    .from("licenses")
    .select(
      "id,key,is_active,expires_at,max_devices,max_ips,max_verify,deleted_at,app_code," +
        // Legacy fields
        "starts_on_first_use,duration_seconds,activated_at," +
        // New fields
        "start_on_first_use,duration_days,first_used_at",
    )
    .eq("key", key)
    .maybeSingle();

  if (lic.error || !lic.data) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: key,
      detail: { ip, device, ok: false, msg: "KEY_NOT_FOUND" },
    });

    await maybeInsertEnumerationAlert(db, ip, key);
    return json({ ok: false, msg: "KEY_NOT_FOUND" });
  }

  // Deno + supabase-js type inference can be noisy here; keep runtime behavior unchanged.
  const licRow: any = lic.data as any;
  const keyPrefix = String(key).split("-")[0].toUpperCase();
  const appCode = String(licRow.app_code || (keyPrefix === "FAKELAG" ? "fake-lag" : "free-fire")).trim().toLowerCase();


  if (licRow.deleted_at) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: key,
      detail: { ip, device, ok: false, msg: "KEY_DELETED" },
    });

    await maybeInsertEnumerationAlert(db, ip, key);
    // Prevent attackers from distinguishing soft-deleted keys from non-existent keys.
    // Keep internal audit detail as KEY_DELETED for operators.
    return json({ ok: false, msg: "KEY_NOT_FOUND" });
  }

  if (!licRow.is_active) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: key,
      detail: { ip, device, ok: false, msg: "KEY_BLOCKED" },
    });

    await maybeInsertEnumerationAlert(db, ip, key);
    return json({ ok: false, msg: "KEY_BLOCKED" });
  }

  // Backward compatible: accept either legacy fields or the new fields.
  // The database has both column families. OR is intentional: some upgraded rows
  // have the new boolean default=false while the legacy flag is still true.
  const startsOnFirstUse = Boolean(licRow.start_on_first_use || licRow.starts_on_first_use);
  const firstUsedAt: string | null = licRow.first_used_at ?? licRow.activated_at ?? null;
  const durationDays: number | null = licRow.duration_days ?? null;
  const durationSeconds: number | null = licRow.duration_seconds ?? null;

  // Duration helper (prefer seconds, fallback days)
  const effectiveDurationSeconds = (() => {
    const dSecs = typeof durationSeconds === "number" && durationSeconds > 0 ? durationSeconds : null;
    const dDays = typeof durationDays === "number" && durationDays > 0 ? durationDays * 86400 : null;
    return dSecs ?? dDays;
  })();

  // Fail-closed expiry: if expires_at exists and is in the past, reject it even
  // when start_on_first_use=true and first_used_at is still NULL.
  // Countdown keys that should start on first use must have expires_at = NULL until activation.
  if (licRow.expires_at) {
    const exp = new Date(licRow.expires_at);
    if (!Number.isFinite(exp.getTime()) || exp.getTime() <= now.getTime()) {
      await db.from("audit_logs").insert({
        action: "VERIFY",
        license_key: key,
        detail: { ip, device, ok: false, msg: "KEY_EXPIRED" },
      });

      await maybeInsertEnumerationAlert(db, ip, key);
      return json({ ok: false, msg: "KEY_EXPIRED" });
    }
  }

  // 3) Device-key proof and device limit logic.
  const submittedPublicKey = (parsed.data.device_public_key ?? "").trim();
  const submittedProof = (parsed.data.device_proof ?? "").trim();
  const submittedProofAlg = (parsed.data.device_proof_alg ?? "").trim();
  const hasProofEnvelope = Boolean(submittedPublicKey && submittedProof && submittedProofAlg === "SHA256withECDSA");
  const deviceProofPayload = [
    "sunny-device-proof-v1",
    ts,
    nonce,
    await sha256Hex(key),
    await sha256Hex(device),
    buildId,
    productId,
  ].join("\n");
  const proofValid = hasProofEnvelope
    ? await verifyDeviceProof(submittedPublicKey, deviceProofPayload, submittedProof)
    : false;
  if ((VERIFY_REQUIRE_DEVICE_KEY && !proofValid) || (hasProofEnvelope && !proofValid)) {
    return json({ ok: false, msg: "DEVICE_KEY_REQUIRED" }, 200);
  }
  const submittedPublicKeyHash = proofValid ? await sha256Hex(submittedPublicKey) : "";

  const existing = await db
    .from("license_devices")
    .select("id,device_public_key_sha256")
    .eq("license_id", licRow.id)
    .eq("device_id", device)
    .maybeSingle();

  if (existing.error) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: key,
      detail: { ip, device, ok: false, msg: "SERVER_ERROR" },
    });

    await maybeInsertEnumerationAlert(db, ip, key);
    return json({ ok: false, msg: "SERVER_ERROR" }, 500);
  }

  const existingDeviceKeyHash = String(existing.data?.device_public_key_sha256 ?? "").trim();
  if (existingDeviceKeyHash && (!proofValid || !timingSafeEqualHex(existingDeviceKeyHash, submittedPublicKeyHash))) {
    return json({ ok: false, msg: "DEVICE_KEY_MISMATCH" }, 200);
  }

  if (!existing.data) {
    // 3.1) Anti "device slot burning": throttle *new* device registrations per key.
    // If this triggers, we return RATE_LIMIT (contract unchanged).
    const NEW_DEVICE_LIMIT = VERIFY_NEW_DEVICE_LIMIT;
    const NEW_DEVICE_WINDOW_SECONDS = VERIFY_NEW_DEVICE_WINDOW_SECONDS;
    const nd = await db.rpc("check_new_device_rate_limit", {
      p_key: key,
      p_limit: NEW_DEVICE_LIMIT,
      p_window_seconds: NEW_DEVICE_WINDOW_SECONDS,
    });
    if (nd.error) {
      await db.from("audit_logs").insert({
        action: "VERIFY",
        license_key: key,
        detail: { ip, device, ok: false, msg: "SERVER_ERROR", reason: "NEW_DEVICE_RATE_LIMIT_RPC_FAILED" },
      });
      return json({ ok: false, msg: "SERVER_ERROR" }, 503);
    }
    const ndAllowed = Boolean(nd.data?.[0]?.allowed);
    if (!ndAllowed) {
      await db.from("audit_logs").insert({
        action: "VERIFY",
        license_key: key,
        detail: {
          ip,
          device,
          ok: false,
          msg: "RATE_LIMIT",
          kind: "NEW_DEVICE",
          current_count: nd.data?.[0]?.current_count ?? null,
        },
      });

      await maybeInsertEnumerationAlert(db, ip, key);
      return json({ ok: false, msg: "RATE_LIMIT", retry_after_seconds: NEW_DEVICE_WINDOW_SECONDS }, 429);
    }

    const count = await db
      .from("license_devices")
      .select("id", { count: "exact", head: true })
      .eq("license_id", licRow.id);

    if (count.error) {
      await db.from("audit_logs").insert({
        action: "VERIFY",
        license_key: key,
        detail: { ip, device, ok: false, msg: "SERVER_ERROR", reason: "DEVICE_COUNT_FAILED" },
      });
      return json({ ok: false, msg: "SERVER_ERROR" }, 503);
    }
    const used = count.count ?? 0;
    if (used >= (licRow.max_devices ?? 1)) {
      const maxDevices = Number(licRow.max_devices ?? 1);
      await db.from("audit_logs").insert({
        action: "VERIFY",
        license_key: key,
        detail: {
          ip,
          device,
          ok: false,
          msg: "DEVICE_LIMIT",
          used_devices: used,
          max_devices: maxDevices,
        },
      });

      await maybeInsertEnumerationAlert(db, ip, key);
      return json({
        ok: false,
        msg: "DEVICE_LIMIT",
        used_devices: used,
        max_devices: maxDevices,
      });
    }
  }

  // 4) Upsert device + update last_seen (+ device_name for display only)
  // If device already exists, this MUST NOT count as a new device.
  const upsertPayload: Record<string, unknown> = {
    license_id: licRow.id,
    device_id: device,
    last_seen: now.toISOString(),
  };
  if (typeof deviceName === "string" && deviceName.trim().length > 0) {
    upsertPayload.device_name = deviceName.trim();
  }
  if (proofValid && !existingDeviceKeyHash) {
    upsertPayload.device_public_key_spki = submittedPublicKey;
    upsertPayload.device_public_key_sha256 = submittedPublicKeyHash;
    upsertPayload.device_key_bound_at = now.toISOString();
  }

  const up = await db
    .from("license_devices")
    .upsert(
      upsertPayload,
      { onConflict: "license_id,device_id" },
    )
    .select("id")
    .maybeSingle();

  if (up.error) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: key,
      detail: { ip, device, ok: false, msg: "SERVER_ERROR" },
    });

    await maybeInsertEnumerationAlert(db, ip, key);
    return json({ ok: false, msg: "SERVER_ERROR" }, 500);
  }

  // 4.4) Extra server-side guard for Fake Lag keys.
  // This is intentionally enforced on server. The app version/prefix stored in APK is not trusted.
  if ((appCode === "fake-lag" || keyPrefix === "FAKELAG") && !existing.data) {
    const ipHash = await sha256Hex(ip);
    const useGuard = await db.rpc("increment_fake_lag_license_use" as any, {
      p_license_id: licRow.id,
      p_app_code: "fake-lag",
      p_ip_hash: ipHash,
    } as any);

    const guardRow: any = Array.isArray(useGuard.data) ? useGuard.data[0] : useGuard.data;
    if (useGuard.error || !guardRow?.ok) {
      const msg = useGuard.error ? "SERVER_ERROR" : String(guardRow?.msg || "FAKE_LAG_RULE_BLOCKED");
      // The device row was inserted just above. Remove it on a rejected quota
      // check so retrying the same device cannot bypass the new-device guard.
      if (!existing.data && up.data?.id) {
        await db.from("license_devices").delete().eq("id", up.data.id).eq("license_id", licRow.id);
      }
      await db.from("audit_logs").insert({
        action: "VERIFY",
        license_key: key,
        detail: { ip, device, ok: false, msg, app_code: appCode },
      });
      await maybeInsertEnumerationAlert(db, ip, key);
      return json({ ok: false, msg }, useGuard.error ? 500 : 200);
    }
  }

  // 4.5) First successful verify activates "start on first use" licenses
  // Activation happens after device checks pass so it doesn't start counting on failures.
  let effectiveExpiresAt: string | null = licRow.expires_at;
  let effectiveFirstUsedAt: string | null = firstUsedAt;
  let started = Boolean(effectiveFirstUsedAt);
  if (startsOnFirstUse) {
    // ✅ Rule A: start-on-first-use must have duration.
    // If countdown key is misconfigured (missing/<=0 duration), do not activate.
    if (!effectiveDurationSeconds || effectiveDurationSeconds <= 0) {
      await db.from("audit_logs").insert({
        action: "VERIFY",
        license_key: key,
        detail: { ip, device, ok: false, msg: "LICENSE_MISCONFIGURED" },
      });

      await maybeInsertEnumerationAlert(db, ip, key);
      return json({ ok: false, msg: "LICENSE_MISCONFIGURED" });
    }

    // ✅ Rule B: if already started but expires_at is NULL, heal it from first_used_at + duration.
    if (firstUsedAt && !licRow.expires_at) {
      const fuMs = new Date(firstUsedAt).getTime();
      if (Number.isFinite(fuMs)) {
        const healedExpiresAt = new Date(fuMs + effectiveDurationSeconds * 1000).toISOString();
        const heal = await db
          .from("licenses")
          .update({ expires_at: healedExpiresAt })
          .eq("id", licRow.id)
          .is("expires_at", null)
          .select("expires_at")
          .maybeSingle();

        // Use healed value regardless of race outcome.
        effectiveExpiresAt = heal.data?.expires_at ?? healedExpiresAt;
      }
    }

    // Activate only if not started yet
    if (!firstUsedAt) {
      const newExpiresAt = new Date(now.getTime() + effectiveDurationSeconds * 1000).toISOString();

      // Activate atomically (win the race) using the new columns; also set legacy activated_at
      // for backward-compat display.
      const activation = await db
        .from("licenses")
        .update({
          first_used_at: now.toISOString(),
          activated_at: now.toISOString(),
          expires_at: newExpiresAt,
        })
        .eq("id", licRow.id)
        .is("first_used_at", null)
        .select("expires_at,first_used_at")
        .maybeSingle();

      // If we won the race, use the updated values. If we lost, re-select to avoid returning started=false.
      if (!activation.error && activation.data?.expires_at && activation.data?.first_used_at) {
        effectiveExpiresAt = activation.data.expires_at;
        effectiveFirstUsedAt = activation.data.first_used_at;
      } else {
        const latest = await db
          .from("licenses")
          .select("expires_at,first_used_at")
          .eq("id", licRow.id)
          .maybeSingle();
        if (!latest.error && latest.data) {
          effectiveExpiresAt = latest.data.expires_at ?? effectiveExpiresAt;
          effectiveFirstUsedAt = latest.data.first_used_at ?? effectiveFirstUsedAt;
        }
      }

      started = Boolean(effectiveFirstUsedAt);
    }
  }

  const remainingSeconds = effectiveExpiresAt
    ? Math.max(0, Math.floor((new Date(effectiveExpiresAt).getTime() - now.getTime()) / 1000))
    : startsOnFirstUse && !started
      ? (() => {
          return typeof effectiveDurationSeconds === "number" ? effectiveDurationSeconds : null;
        })()
      : null;

  const serverEpoch = Math.floor(now.getTime() / 1000);
  const serverTime = String(serverEpoch);
  const sessionExpiresAtValue =
    serverEpoch + VERIFY_SESSION_TTL_SECONDS;
  const sessionExpiresAt = String(sessionExpiresAtValue);
  const signedRemainingSeconds = typeof remainingSeconds === "number" ? remainingSeconds : 0;
  const keyHash = await sha256Hex(key);
  const deviceHash = await sha256Hex(device);
  const sessionId = crypto.randomUUID();
  const featureSeed = randomHex(32);
  const capabilityNonce = randomHex(32);
  const capabilityExpiresAt = sessionExpiresAt;
  const maxDevices = Number(licRow.max_devices ?? 1);
  const deviceKeyBound = Boolean(existingDeviceKeyHash || (proofValid && submittedPublicKeyHash));

  const lease = await db.rpc("issue_sunny_v34_lease", {
    p_license_id: licRow.id,
    p_device_id: device,
    p_build_id: buildId,
    p_product_id: productId,
  });
  const leaseRow: any = Array.isArray(lease.data) ? lease.data[0] : lease.data;
  if (lease.error || !leaseRow) {
    return json({ ok: false, msg: "SERVER_ERROR" }, 503);
  }
  const sessionGenerationValue =
    Number(leaseRow.session_generation);
  const expGenerationValue =
    Number(leaseRow.exp_generation);
  const buildNotBeforeValue =
    Number(leaseRow.build_not_before);
  const buildExpiresAtValue =
    Number(leaseRow.build_expires_at);

  if (
    !Number.isSafeInteger(sessionGenerationValue) ||
    sessionGenerationValue <= 0 ||
    !Number.isSafeInteger(expGenerationValue) ||
    expGenerationValue <= 0 ||
    !Number.isSafeInteger(buildNotBeforeValue) ||
    buildNotBeforeValue <= 0 ||
    !Number.isSafeInteger(buildExpiresAtValue) ||
    buildExpiresAtValue <= 0 ||
    buildExpiresAtValue <= buildNotBeforeValue
  ) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: key,
      detail: {
        ip,
        device,
        ok: false,
        msg: "SERVER_ERROR",
        reason: "LEASE_FIELDS_INVALID",
      },
    });

    return json({
      ok: false,
      msg: "SERVER_ERROR",
    }, 503);
  }

  const sessionGeneration =
    String(sessionGenerationValue);
  const expGeneration =
    String(expGenerationValue);
  const buildNotBefore =
    String(buildNotBeforeValue);
  const buildExpiresAt =
    String(buildExpiresAtValue);

  const okBody: Record<string, unknown> = {
    ok: true,
    msg: "OK",
    expires_at: effectiveExpiresAt,
    max_devices: maxDevices,
    started,
    remaining_seconds: signedRemainingSeconds,
    server_time: serverTime,
    build_id: buildId,
    product_id: productId,
    server_sig_alg: SERVER_SIG_ALG,
    server_key_id: SERVER_KEY_ID,
    key_hash: keyHash,
    device_hash: deviceHash,
    session_id: sessionId,
    session_expires_at: sessionExpiresAtValue,
    session_generation: sessionGenerationValue,
    exp_generation: expGenerationValue,
    build_not_before: buildNotBeforeValue,
    build_expires_at: buildExpiresAtValue,
    capability_nonce: capabilityNonce,
    capability_expires_at: sessionExpiresAtValue,
    feature_seed: featureSeed,
    device_key_bound: deviceKeyBound,
  };

  const responseCanonical = signedResponseCanonicalV3({
    nonce: reqNonce,
    request_body_hash: requestBodyHash,
    key_hash: keyHash,
    device_hash: deviceHash,
    build_id: buildId,
    product_id: productId,
    remaining_seconds: signedRemainingSeconds,
    expires_at: effectiveExpiresAt,
    max_devices: maxDevices,
    started,
    server_time: serverTime,
    session_id: sessionId,
    session_expires_at: sessionExpiresAt,
    session_generation: sessionGeneration,
    exp_generation: expGeneration,
    build_not_before: buildNotBefore,
    build_expires_at: buildExpiresAt,
    capability_nonce: capabilityNonce,
    capability_expires_at: capabilityExpiresAt,
    feature_seed: featureSeed,
    device_key_bound: deviceKeyBound,
  });

  try {
    okBody.server_sig = await ecdsaP256SignDerBase64(responseCanonical);
  } catch (error) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: key,
      detail: {
        ip,
        device,
        ok: false,
        msg: "SERVER_ERROR",
        reason: "ECDSA_SIGN_FAILED",
        error: String(error instanceof Error ? error.message : error),
      },
    });
    return json({ ok: false, msg: "SERVER_ERROR" }, 503);
  }

  // Record success only after a valid server signature was produced.
  await db.from("audit_logs").insert({
    action: "VERIFY",
    license_key: key,
    detail: {
      ip,
      device,
      device_name: deviceName ?? null,
      ok: true,
      license_id: licRow.id,
      device_row: up.data?.id ?? null,
      server_sig_alg: SERVER_SIG_ALG,
      server_key_id: SERVER_KEY_ID,
      session_id_prefix: sessionId.slice(0, 8),
    },
  });

  return json(okBody);
});
