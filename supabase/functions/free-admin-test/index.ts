import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { assertAdmin } from "../_shared/admin.ts";

const KNOWN_HOSTS = new Set(["mityangho.id.vn", "www.mityangho.id.vn", "sunnypanel.lovable.app"]);

function isAllowedOrigin(origin: string, publicBaseUrl: string) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    const host = u.hostname;
    if (KNOWN_HOSTS.has(host)) return true;
    if (host === "lovable.dev" || host.endsWith(".lovable.dev") || host.endsWith(".lovable.app")) return true;
    if (publicBaseUrl) {
      const pb = new URL(publicBaseUrl);
      const pbHost = pb.hostname;
      return host === pbHost || host.endsWith(`.${pbHost}`);
    }
    return false;
  } catch {
    return false;
  }
}

function resolveCorsOrigin(origin: string, publicBaseUrl: string) {
  if (isAllowedOrigin(origin, publicBaseUrl)) return origin;
  if (publicBaseUrl && isAllowedOrigin(publicBaseUrl, publicBaseUrl)) return publicBaseUrl;
  return "https://mityangho.id.vn";
}

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

function randomChunk(len = 4) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function makeKey() {
  return `SUNNY-${randomChunk(4)}-${randomChunk(4)}-${randomChunk(4)}`;
}

function maskKey(key: string) {
  if (key.length <= 10) return "***";
  return `${key.slice(0, 9)}…${key.slice(-4)}`;
}

function getClientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "127.0.0.1";
}

const BodySchema = z.object({
  key_type_code: z.string().min(2).max(8),
  dry_run: z.boolean().optional().default(false),
});

Deno.serve(async (req) => {
  const PUBLIC_BASE_URL = Deno.env.get("PUBLIC_BASE_URL") ?? "";
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = resolveCorsOrigin(origin, PUBLIC_BASE_URL);
  const cors = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ ok: false, message: "METHOD_NOT_ALLOWED" }, 405);

  const admin = await assertAdmin(req);
  if (!admin.ok) return json(admin.body, admin.status);

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return json({ ok: false, message: "BAD_REQUEST" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) return json({ ok: false, message: "SERVER_MISCONFIG" }, 500);

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const ip = getClientIp(req);
  const ua = req.headers.get("user-agent") ?? "free-admin-test";
  const fpSeed = `admin-test:${Date.now()}:${crypto.randomUUID()}`;

  const ipHash = await sha256Hex(ip);
  const uaHash = await sha256Hex(ua);
  const fpHash = await sha256Hex(fpSeed);

  const keyTypeCode = parsed.data.key_type_code;
  const dryRun = Boolean(parsed.data.dry_run);

  const { data: keyType, error: ktErr } = await sb
    .from("licenses_free_key_types")
    .select("code,label,duration_seconds,enabled")
    .eq("code", keyTypeCode)
    .maybeSingle();
  if (ktErr || !keyType || !keyType.enabled) {
    return json({ ok: false, message: "KEY_TYPE_DISABLED", ip_hash: ipHash, fp_hash: fpHash });
  }

  const banned = await sb
    .from("licenses_free_blocklist")
    .select("id")
    .eq("enabled", true)
    .or(`fingerprint_hash.eq.${fpHash},ip_hash.eq.${ipHash}`)
    .maybeSingle();
  if (banned.data?.id) {
    return json({ ok: false, message: "BLOCKED", ip_hash: ipHash, fp_hash: fpHash });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  const sessionInsert = await sb
    .from("licenses_free_sessions")
    .insert({
      status: "gate_ok",
      reveal_count: dryRun ? 0 : 1,
      ip_hash: ipHash,
      ua_hash: uaHash,
      fingerprint_hash: fpHash,
      key_type_code: keyType.code,
      duration_seconds: Number(keyType.duration_seconds ?? 3600),
      started_at: now.toISOString(),
      gate_ok_at: now.toISOString(),
      revealed_at: dryRun ? null : now.toISOString(),
      expires_at: expiresAt,
      last_error: dryRun ? "ADMIN_DRY_RUN" : null,
    })
    .select("session_id")
    .single();

  if (sessionInsert.error || !sessionInsert.data?.session_id) {
    return json({ ok: false, message: "SESSION_INSERT_FAILED", ip_hash: ipHash, fp_hash: fpHash }, 500);
  }

  const sessionId = sessionInsert.data.session_id;

  if (dryRun) {
    return json({
      ok: true,
      message: "DRY_RUN_OK",
      key: null,
      expires_at: new Date(now.getTime() + Number(keyType.duration_seconds ?? 3600) * 1000).toISOString(),
      ip_hash: ipHash,
      fp_hash: fpHash,
      session_id: sessionId,
    });
  }

  const key = makeKey();
  const keyExpiresAt = new Date(now.getTime() + Number(keyType.duration_seconds ?? 3600) * 1000).toISOString();

  const licenseIns = await sb
    .from("licenses")
    .insert({
      key,
      is_active: true,
      max_devices: 1,
      expires_at: keyExpiresAt,
      start_on_first_use: false,
      starts_on_first_use: false,
      duration_days: null,
      duration_seconds: Number(keyType.duration_seconds ?? 3600),
      activated_at: null,
      first_used_at: null,
      note: `FREE_ADMIN_TEST_${String(keyType.code).toUpperCase()}`,
    })
    .select("id")
    .single();

  if (licenseIns.error || !licenseIns.data?.id) {
    await sb.from("licenses_free_sessions").update({ status: "start_error", last_error: "ADMIN_TEST_INSERT_FAILED" }).eq("session_id", sessionId);
    return json({ ok: false, message: "LICENSE_INSERT_FAILED", ip_hash: ipHash, fp_hash: fpHash, session_id: sessionId }, 500);
  }

  await sb.from("licenses_free_issues").insert({
    license_id: licenseIns.data.id,
    key_mask: maskKey(key),
    created_at: now.toISOString(),
    expires_at: keyExpiresAt,
    session_id: sessionId,
    ip_hash: ipHash,
    fingerprint_hash: fpHash,
    ua_hash: uaHash,
  });

  await sb.from("licenses_free_sessions").update({ status: "revealed", reveal_count: 1, revealed_at: now.toISOString() }).eq("session_id", sessionId);

  return json({
    ok: true,
    key,
    expires_at: keyExpiresAt,
    ip_hash: ipHash,
    fp_hash: fpHash,
    session_id: sessionId,
    message: "ADMIN_TEST_OK",
  });
});
