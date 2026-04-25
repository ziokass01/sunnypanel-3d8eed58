import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function getClientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "0.0.0.0";
}

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(digest);
}
function normalizeKey(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}
function validFakeLagKey(key: string) {
  return /^FAKELAG-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key);
}
function safeText(value: unknown, max = 128) {
  return String(value ?? "").trim().slice(0, max);
}
function asBool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return fallback;
  const raw = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}
function normalizeSha(value: unknown) {
  return safeText(value, 160).replace(/[^0-9a-fA-F]/g, "").toUpperCase();
}
function normalizeLower(value: unknown, max = 128) {
  return safeText(value, max).toLowerCase();
}
function listText(value: unknown) {
  return Array.isArray(value) ? value.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
}
function listLower(value: unknown) {
  return listText(value).map((x) => x.toLowerCase());
}
function listSha(value: unknown) {
  return listText(value).map((x) => normalizeSha(x)).filter(Boolean);
}
function compareVersionText(left: string | null | undefined, right: string | null | undefined) {
  const a = safeText(left, 64);
  const b = safeText(right, 64);
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const ap = a.split(/[^0-9]+/).filter(Boolean).map((x) => Number(x));
  const bp = b.split(/[^0-9]+/).filter(Boolean).map((x) => Number(x));
  const n = Math.max(ap.length, bp.length);
  for (let i = 0; i < n; i += 1) {
    const av = Number.isFinite(ap[i]) ? ap[i] : 0;
    const bv = Number.isFinite(bp[i]) ? bp[i] : 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}
async function readJson(req: Request) {
  try { return await req.json(); } catch { return null; }
}

function base64UrlEncode(input: string) {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function base64UrlDecode(input: string) {
  const pad = "=".repeat((4 - (input.length % 4)) % 4);
  const normalized = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return atob(normalized);
}
async function hmacSha256Base64Url(secret: string, data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64UrlEncode(String.fromCharCode(...new Uint8Array(sig)));
}
function getTokenSecret(serviceRoleKey: string) {
  return (Deno.env.get("FAKE_LAG_TOKEN_SECRET") || serviceRoleKey || "fake-lag-token-secret").trim();
}
async function issueSessionToken(serviceRoleKey: string, payload: Record<string, unknown>, ttlSeconds = 15 * 60) {
  const ttl = Math.max(60, Math.min(24 * 60 * 60, Math.trunc(Number(ttlSeconds) || 15 * 60)));
  const nowSec = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    typ: "fake-lag-session",
    nonce: crypto.randomUUID(),
    iat: nowSec,
    exp: nowSec + ttl,
  };
  const bodyText = JSON.stringify(body);
  const bodyPart = base64UrlEncode(bodyText);
  const sig = await hmacSha256Base64Url(getTokenSecret(serviceRoleKey), bodyPart);
  return { token: `${bodyPart}.${sig}`, expires_at: new Date(Number(body.exp) * 1000).toISOString(), ttl_seconds: ttl };
}
async function verifySessionToken(serviceRoleKey: string, token: string, expected: Record<string, unknown>) {
  const raw = String(token || "").trim();
  const parts = raw.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, msg: "TOKEN_MISSING", payload: null as any };
  const sig = await hmacSha256Base64Url(getTokenSecret(serviceRoleKey), parts[0]);
  if (sig !== parts[1]) return { ok: false, msg: "TOKEN_INVALID", payload: null as any };
  let payload: any = null;
  try { payload = JSON.parse(base64UrlDecode(parts[0])); } catch { return { ok: false, msg: "TOKEN_INVALID", payload: null as any }; }
  const nowSec = Math.floor(Date.now() / 1000);
  if (String(payload?.typ || "") !== "fake-lag-session") return { ok: false, msg: "TOKEN_INVALID", payload };
  if (Number(payload?.exp || 0) <= nowSec) return { ok: false, msg: "TOKEN_EXPIRED", payload };
  const textKeys = ["key", "device", "package_name", "build_id"];
  for (const k of textKeys) {
    const a = String(payload?.[k] ?? "").trim();
    const b = String(expected?.[k] ?? "").trim();
    if (a !== b) return { ok: false, msg: "TOKEN_MISMATCH", payload };
  }
  if (normalizeSha(payload?.signature_sha256) !== normalizeSha(expected?.signature_sha256)) {
    return { ok: false, msg: "TOKEN_MISMATCH", payload };
  }
  return { ok: true, msg: "OK", payload };
}

function fnvMix32(value: unknown, seed: number) {
  let h = (seed || 2166136261) >>> 0;
  const text = String(value ?? "").slice(0, 512);
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i) & 0xff;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= h >>> 13;
    h >>>= 0;
  }
  return h >>> 0;
}
function hex32(value: number) {
  return (value >>> 0).toString(16).padStart(8, "0");
}
function challengeResponseV2(args: { key: string; device: string; packageName: string; buildId: string; signatureSha256: string; challenge: string; mode: string }) {
  let h = 0x8F3D9B7B >>> 0;
  h = fnvMix32(args.key, h);
  h = fnvMix32(args.device, h ^ 0xA5A5A5A5);
  h = fnvMix32(args.packageName, h ^ 0x9E3779B9);
  h = fnvMix32(args.buildId, h ^ 0x85EBCA6B);
  h = fnvMix32(normalizeSha(args.signatureSha256), h ^ 0xC2B2AE35);
  h = fnvMix32(args.challenge, h ^ 0x27D4EB2F);
  h = fnvMix32(args.mode, h ^ 0x165667B1);
  h = fnvMix32("sunny-v28-dynamic-challenge-20260425", h ^ 0xD3A2646C);
  return hex32(h);
}
async function makeServerChallenge(args: { key: string; device: string; signatureSha256: string; buildId: string; mode: string }) {
  const seed = `${args.key}|${args.device}|${normalizeSha(args.signatureSha256)}|${args.buildId}|${args.mode}|${crypto.randomUUID()}|${Date.now()}`;
  return `c2.${(await sha256Hex(seed)).slice(0, 40)}`;
}
async function makeServerWatermark(args: { key: string; device: string; signatureSha256: string; buildId: string }) {
  const seed = `${args.key}|${args.device}|${normalizeSha(args.signatureSha256)}|${args.buildId}|fake-lag-watermark-v28`;
  return `wm.${(await sha256Hex(seed)).slice(0, 24)}`;
}
async function makeEngineGrant(serviceRoleKey: string, args: { key: string; device: string; signatureSha256: string; buildId: string; challenge: string; exp: string }) {
  const data = `grant|${args.key}|${args.device}|${normalizeSha(args.signatureSha256)}|${args.buildId}|${args.challenge}|${args.exp}`;
  return (await hmacSha256Base64Url(getTokenSecret(serviceRoleKey), data)).slice(0, 43);
}
function firstText(value: unknown) {
  const list = listText(value);
  return list.length ? list[0] : "";
}
function listDex(value: unknown) {
  return listText(value).map((x) => x.replace(/[^0-9a-fA-F]/g, "").toUpperCase()).filter(Boolean);
}


async function checkVersionPolicy(db: any, input: any) {
  const appCode = "fake-lag";
  const { data } = await db.from("server_app_version_policies").select("*").eq("app_code", appCode).maybeSingle();
  if (!data) {
    return {
      allowed: true,
      update_required: false,
      hard_blocked: false,
      reason: "NO_POLICY",
      update_url: "https://mityangho.id.vn/free",
      policy: { login_token_ttl_seconds: 15 * 60, engine_token_ttl_seconds: 3 * 60, heartbeat_seconds: 45 },
    };
  }

  const enabled = asBool(data.enabled, true);
  const forceUpdate = asBool(data.force_update_enabled, true);
  const versionCodeRaw = Number(input?.version_code ?? 0);
  const versionCode = Number.isFinite(versionCodeRaw) ? Math.trunc(versionCodeRaw) : 0;
  const versionName = safeText(input?.version_name, 64);
  const buildId = safeText(input?.build_id, 128);
  const packageName = safeText(input?.package_name, 128);
  const packageNameLower = normalizeLower(input?.package_name, 128);
  const signatureSha256 = normalizeSha(input?.signature_sha256);
  const apkSha256 = normalizeSha(input?.apk_sha256);
  const soSha256 = normalizeSha(input?.so_sha256);
  const dexCrc = safeText(input?.dex_crc, 32).replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  const blockedCodes = Array.isArray(data.blocked_version_codes) ? data.blocked_version_codes.map((x: any) => Number(x)) : [];
  const blockedNames = listText(data.blocked_version_names);
  const blockedBuilds = listText(data.blocked_build_ids);
  const allowedPackages = listLower(data.allowed_package_names);
  const allowedSignatures = listSha(data.allowed_signature_sha256);
  const requireIntegrity = asBool((data as any).require_client_integrity, false);
  const allowedApkSha256 = listSha((data as any).allowed_apk_sha256);
  const allowedSoSha256 = listSha((data as any).allowed_so_sha256);
  const allowedDexCrc = listDex((data as any).allowed_dex_crc);
  const minVersionCode = Number(data.min_version_code ?? 0);
  const minVersionName = String(data.min_version_name ?? "").trim();
  const requireSignature = asBool(data.block_unknown_signature, false) || asBool(data.require_signature_match, false);
  const blockMissingIdentity = asBool(data.block_missing_identity, true);

  let hardBlocked = false;
  let updateRequired = false;
  let reason = "OK";

  if (!enabled) { hardBlocked = true; reason = "VERSION_GUARD_DISABLED_BY_ADMIN"; }
  else if (blockedCodes.includes(versionCode)) { updateRequired = true; reason = "VERSION_CODE_BLOCKED"; }
  else if (blockedNames.includes(versionName)) { updateRequired = true; reason = "VERSION_NAME_BLOCKED"; }
  else if (buildId && blockedBuilds.includes(buildId)) { updateRequired = true; reason = "BUILD_ID_BLOCKED"; }
  else if (blockMissingIdentity && !packageName) { hardBlocked = true; reason = "PACKAGE_MISSING"; }
  else if (allowedPackages.length && !allowedPackages.includes(packageNameLower)) { hardBlocked = true; reason = "PACKAGE_NOT_ALLOWED"; }
  else if (requireSignature && blockMissingIdentity && !signatureSha256) { hardBlocked = true; reason = "SIGNATURE_MISSING"; }
  else if (requireSignature && allowedSignatures.length && !allowedSignatures.includes(signatureSha256)) { hardBlocked = true; reason = "SIGNATURE_NOT_ALLOWED"; }
  else if (requireIntegrity && !apkSha256) { hardBlocked = true; reason = "APK_CHECKSUM_MISSING"; }
  else if (requireIntegrity && allowedApkSha256.length && !allowedApkSha256.includes(apkSha256)) { hardBlocked = true; reason = "APK_CHECKSUM_NOT_ALLOWED"; }
  else if (requireIntegrity && allowedSoSha256.length && !allowedSoSha256.includes(soSha256)) { hardBlocked = true; reason = "SO_CHECKSUM_NOT_ALLOWED"; }
  else if (requireIntegrity && allowedDexCrc.length && !allowedDexCrc.includes(dexCrc)) { hardBlocked = true; reason = "DEX_CHECKSUM_NOT_ALLOWED"; }
  else if (forceUpdate && minVersionCode > 0 && versionCode <= 0) { updateRequired = true; reason = "VERSION_CODE_MISSING"; }
  else if (forceUpdate && minVersionCode > 0 && versionCode < minVersionCode) { updateRequired = true; reason = "VERSION_CODE_TOO_OLD"; }
  else if (forceUpdate && minVersionName && versionName && compareVersionText(versionName, minVersionName) < 0) { updateRequired = true; reason = "VERSION_NAME_TOO_OLD"; }

  try {
    await db.from("server_app_version_audit_logs").insert({
      app_code: appCode,
      version_name: versionName || null,
      version_code: Number.isFinite(versionCode) ? versionCode : null,
      build_id: buildId || null,
      package_name: packageName || null,
      signature_sha256: signatureSha256 || null,
      device_id: safeText(input?.device, 128) || null,
      allowed: !(hardBlocked || updateRequired),
      update_required: updateRequired,
      hard_blocked: hardBlocked,
      reason,
      meta: { source: "fake-lag-auth", strict: true, apk_sha256: apkSha256 || null, so_sha256: soSha256 || null, dex_crc: dexCrc || null, integrity_mix: safeText(input?.integrity_mix, 64) || null },
    });
  } catch {}

  return {
    allowed: !(hardBlocked || updateRequired),
    update_required: updateRequired,
    hard_blocked: hardBlocked,
    reason,
    title: data.update_title || "Yêu cầu cập nhật",
    message: data.update_message || "Phiên bản bạn đang dùng đã cũ hoặc đã bị chặn. Vui lòng cập nhật để tiếp tục sử dụng.",
    update_url: data.update_url || "https://mityangho.id.vn/free",
    policy: {
      login_token_ttl_seconds: Math.max(300, Math.min(3600, Number(data.login_token_ttl_seconds ?? 15 * 60) || 15 * 60)),
      engine_token_ttl_seconds: Math.max(60, Math.min(900, Number(data.engine_token_ttl_seconds ?? 3 * 60) || 3 * 60)),
      heartbeat_seconds: Math.max(20, Math.min(180, Number(data.heartbeat_seconds ?? 45) || 45)),
      require_client_integrity: requireIntegrity,
      expected_apk_sha256: firstText((data as any).allowed_apk_sha256),
      expected_so_sha256: firstText((data as any).allowed_so_sha256),
      expected_dex_crc: firstText((data as any).allowed_dex_crc),
    },
  };
}


async function getSecurityPolicy(db: any) {
  try {
    const { data } = await db
      .from("server_app_version_policies")
      .select("risk_auto_block_enabled,risk_auto_block_threshold,risk_auto_block_window_seconds")
      .eq("app_code", "fake-lag")
      .maybeSingle();
    return {
      enabled: asBool((data as any)?.risk_auto_block_enabled, true),
      threshold: Math.max(1, Number((data as any)?.risk_auto_block_threshold ?? 2) || 2),
      windowSeconds: Math.max(60, Number((data as any)?.risk_auto_block_window_seconds ?? 600) || 600),
    };
  } catch {
    return { enabled: true, threshold: 2, windowSeconds: 600 };
  }
}

async function getSecurityBlock(db: any, device: string, ipHash: string) {
  try {
    const { data } = await db
      .from("server_app_security_blocks")
      .select("id,enabled,blocked_until,hit_count,reason")
      .eq("app_code", "fake-lag")
      .or(`device_id.eq.${device},ip_hash.eq.${ipHash}`)
      .eq("enabled", true)
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const until = String((data as any).blocked_until ?? "").trim();
    if (until && Date.parse(until) <= Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

async function recordRiskAndMaybeBlock(db: any, args: {
  key: string;
  device: string;
  ip: string;
  ipHash: string;
  riskFlags: string;
  packageName: string;
  signatureSha256: string;
  buildId: string;
  nativeGuard?: unknown;
  clientWatermark?: string;
}) {
  const policy = await getSecurityPolicy(db);
  const nowIso = new Date().toISOString();
  const blockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const detail = {
    ip: args.ip,
    ip_hash: args.ipHash,
    device: args.device,
    ok: false,
    app_code: "fake-lag",
    risk_flags: args.riskFlags,
    package_name: args.packageName,
    signature_sha256: args.signatureSha256,
    build_id: args.buildId,
    native_guard: args.nativeGuard ?? null,
    client_watermark: args.clientWatermark || null,
    policy,
  };

  try {
    await db.from("audit_logs").insert({
      action: "FAKE_LAG_RUNTIME_RISK",
      license_key: args.key || null,
      detail,
    });
  } catch {}

  if (!policy.enabled) return { blocked: false, hit_count: 1 };

  try {
    const ors = [args.device ? `device_id.eq.${args.device}` : "", args.ipHash ? `ip_hash.eq.${args.ipHash}` : ""].filter(Boolean).join(",");
    let existing: any = null;
    if (ors) {
      const found = await db
        .from("server_app_security_blocks")
        .select("*")
        .eq("app_code", "fake-lag")
        .or(ors)
        .order("last_seen_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      existing = found.data;
    }

    const firstSeenMs = Date.parse(String((existing as any)?.first_seen_at ?? ""));
    const insideWindow = Number.isFinite(firstSeenMs) && Date.now() - firstSeenMs <= policy.windowSeconds * 1000;
    const previousHits = insideWindow ? Math.max(0, Number((existing as any)?.hit_count ?? 0)) : 0;
    const hitCount = previousHits + 1;
    const shouldBlock = hitCount >= policy.threshold;

    const payload = {
      app_code: "fake-lag",
      device_id: args.device || null,
      ip_hash: args.ipHash || null,
      reason: "RUNTIME_RISK",
      enabled: shouldBlock,
      hit_count: hitCount,
      first_seen_at: insideWindow && (existing as any)?.first_seen_at ? (existing as any).first_seen_at : nowIso,
      last_seen_at: nowIso,
      blocked_until: shouldBlock ? blockedUntil : null,
      details: detail,
    };

    if ((existing as any)?.id) {
      await db.from("server_app_security_blocks").update(payload).eq("id", (existing as any).id);
    } else {
      await db.from("server_app_security_blocks").insert(payload);
    }

    return { blocked: shouldBlock, hit_count: hitCount, blocked_until: shouldBlock ? blockedUntil : null };
  } catch {
    return { blocked: false, hit_count: 1 };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, msg: "METHOD_NOT_ALLOWED" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) return json({ ok: false, msg: "SERVER_NOT_READY" }, 503);

  const input = await readJson(req);
  if (!input) return json({ ok: false, msg: "INVALID_JSON" }, 400);

  const key = normalizeKey(input.key);
  const rawMode = safeText(input.mode, 32).toLowerCase();
  const mode = rawMode === "refresh" || rawMode === "engine" || rawMode === "heartbeat" ? rawMode : "login";
  const sessionToken = safeText(input.session_token, 4096);
  const device = safeText(input.device, 128);
  const deviceName = safeText(input.device_name, 128);
  const ip = getClientIp(req);
  const riskFlags = safeText((input as any).risk_flags, 512);
  const now = new Date();

  if (!validFakeLagKey(key)) return json({ ok: false, msg: "INVALID_KEY_FORMAT" }, 200);
  if (!device) return json({ ok: false, msg: "DEVICE_REQUIRED" }, 200);

  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const ipHash = await sha256Hex(ip);
  const packageNameForAudit = safeText(input.package_name, 128);
  const signatureForAudit = normalizeSha(input.signature_sha256);
  const buildIdForAudit = safeText(input.build_id, 128);
  const nativeGuardForAudit = (input as any).native_guard ?? null;
  const clientWatermarkForAudit = safeText((input as any).client_watermark, 128);
  const challengeResponseForAudit = safeText((input as any).challenge_response, 64).toLowerCase();
  const apkShaForAudit = normalizeSha((input as any).apk_sha256);
  const soShaForAudit = normalizeSha((input as any).so_sha256);
  const dexCrcForAudit = safeText((input as any).dex_crc, 32).replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  const integrityMixForAudit = safeText((input as any).integrity_mix, 64);

  const securityBlock = await getSecurityBlock(db, device, ipHash);
  if (securityBlock) {
    await db.from("audit_logs").insert({ action: "FAKE_LAG_SECURITY_BLOCK", license_key: key || null, detail: { ip, ip_hash: ipHash, device, ok: false, app_code: "fake-lag", block: securityBlock, native_guard: nativeGuardForAudit, client_watermark: clientWatermarkForAudit || null } });
    return json({ ok: false, msg: "DEVICE_BLOCKED", hard_blocked: true }, 200);
  }

  const version = await checkVersionPolicy(db, input);
  if (!version.allowed) return json({ ok: false, msg: version.reason || "UPDATE_REQUIRED", ...version }, 200);
  if (/debugger|frida|xposed|substrate|hook|tracerpid|socket|port/i.test(riskFlags)) {
    const riskState = await recordRiskAndMaybeBlock(db, {
      key,
      device,
      ip,
      ipHash,
      riskFlags,
      packageName: packageNameForAudit,
      signatureSha256: signatureForAudit,
      buildId: buildIdForAudit,
      nativeGuard: nativeGuardForAudit,
      clientWatermark: clientWatermarkForAudit,
    });
    return json({ ok: false, msg: riskState.blocked ? "DEVICE_BLOCKED" : "RUNTIME_RISK", hard_blocked: Boolean(riskState.blocked), risk_hit_count: riskState.hit_count, blocked_until: riskState.blocked_until ?? null }, 200);
  }

  const clientIdentity = {
    key,
    device,
    package_name: packageNameForAudit,
    signature_sha256: signatureForAudit,
    build_id: buildIdForAudit,
  };

  if (mode === "engine" || mode === "heartbeat") {
    const tokenState = await verifySessionToken(serviceRoleKey, sessionToken, clientIdentity);
    if (!tokenState.ok) {
      await db.from("audit_logs").insert({ action: mode === "heartbeat" ? "FAKE_LAG_HEARTBEAT_DENY" : "FAKE_LAG_ENGINE_DENY", license_key: key, detail: { ip, device, ok: false, app_code: "fake-lag", msg: tokenState.msg, challenge_response: challengeResponseForAudit || null } });
      return json({ ok: false, msg: tokenState.msg }, 200);
    }
    const tokenChallenge = safeText((tokenState.payload as any)?.challenge, 256);
    const expectedChallengeResponse = challengeResponseV2({ key, device, packageName: packageNameForAudit, buildId: buildIdForAudit, signatureSha256: signatureForAudit, challenge: tokenChallenge, mode });
    if (!tokenChallenge || !challengeResponseForAudit || challengeResponseForAudit !== expectedChallengeResponse) {
      await db.from("audit_logs").insert({ action: mode === "heartbeat" ? "FAKE_LAG_HEARTBEAT_DENY" : "FAKE_LAG_ENGINE_DENY", license_key: key, detail: { ip, device, ok: false, app_code: "fake-lag", msg: "CHALLENGE_FAIL", challenge_present: Boolean(tokenChallenge), challenge_response: challengeResponseForAudit || null, expected: expectedChallengeResponse } });
      return json({ ok: false, msg: "CHALLENGE_FAIL", hard_blocked: true }, 200);
    }
  }

  try {
    const ipRl = await db.rpc("check_ip_rate_limit", { p_ip: ip, p_limit: 180, p_window_seconds: 60 });
    const allowed = ipRl.error ? true : Boolean(ipRl.data?.[0]?.allowed);
    if (!allowed) return json({ ok: false, msg: "RATE_LIMIT" }, 429);
  } catch {}

  const lic = await db
    .from("licenses")
    .select("id,key,is_active,expires_at,max_devices,max_ips,max_verify,verify_count,deleted_at,starts_on_first_use,duration_seconds,activated_at,start_on_first_use,duration_days,first_used_at,app_code")
    .eq("key", key)
    .maybeSingle();

  if (lic.error || !lic.data) {
    await db.from("audit_logs").insert({ action: "VERIFY", license_key: key, detail: { ip, device, ok: false, app_code: "fake-lag", msg: "KEY_NOT_FOUND" } });
    return json({ ok: false, msg: "KEY_NOT_FOUND" }, 200);
  }

  const licRow: any = lic.data;
  const appCode = String(licRow.app_code || "fake-lag").trim().toLowerCase();
  if (appCode !== "fake-lag" && !key.startsWith("FAKELAG-")) return json({ ok: false, msg: "KEY_NOT_FOUND" }, 200);
  if (licRow.deleted_at) {
    await db.from("audit_logs").insert({ action: "VERIFY", license_key: key, detail: { ip, device, ok: false, app_code: "fake-lag", msg: "KEY_DELETED" } });
    return json({ ok: false, msg: "KEY_NOT_FOUND" }, 200);
  }
  if (!licRow.is_active) {
    await db.from("audit_logs").insert({ action: "VERIFY", license_key: key, detail: { ip, device, ok: false, app_code: "fake-lag", msg: "KEY_BLOCKED" } });
    return json({ ok: false, msg: "KEY_BLOCKED" }, 200);
  }

  const startsOnFirstUse = Boolean(licRow.start_on_first_use ?? licRow.starts_on_first_use);
  const firstUsedAt: string | null = licRow.first_used_at ?? licRow.activated_at ?? null;
  const durationSecondsRaw = Number(licRow.duration_seconds ?? 0);
  const durationDaysRaw = Number(licRow.duration_days ?? 0);
  const effectiveDurationSeconds = durationSecondsRaw > 0 ? durationSecondsRaw : durationDaysRaw > 0 ? durationDaysRaw * 86400 : null;
  if (!(startsOnFirstUse && !firstUsedAt) && licRow.expires_at) {
    const expMs = new Date(licRow.expires_at).getTime();
    if (Number.isFinite(expMs) && expMs < now.getTime()) {
      await db.from("audit_logs").insert({ action: "VERIFY", license_key: key, detail: { ip, device, ok: false, app_code: "fake-lag", msg: "KEY_EXPIRED" } });
      return json({ ok: false, msg: "KEY_EXPIRED" }, 200);
    }
  }

  const existingDevice = await db.from("license_devices").select("id").eq("license_id", licRow.id).eq("device_id", device).maybeSingle();
  if (existingDevice.error) return json({ ok: false, msg: "SERVER_ERROR" }, 500);
  // Fake Lag license không giới hạn IP/thiết bị theo từng key.
  // IP/thiết bị chỉ dùng để giới hạn số lần lấy key public ở /free.
  // License chỉ giới hạn theo lượt verify/use.
  const upsertPayload: Record<string, unknown> = { license_id: licRow.id, device_id: device, last_seen: now.toISOString() };
  if (deviceName) upsertPayload.device_name = deviceName;
  let deviceRowId: string | null = null;
  const up = await db.from("license_devices").upsert(upsertPayload, { onConflict: "license_id,device_id" }).select("id").maybeSingle();
  if (up.error) {
    const retryExisting = await db.from("license_devices").select("id").eq("license_id", licRow.id).eq("device_id", device).maybeSingle();
    if (retryExisting.data?.id) {
      deviceRowId = retryExisting.data.id;
    } else {
      const ins = await db.from("license_devices").insert(upsertPayload).select("id").maybeSingle();
      if (ins.error) {
        await db.from("audit_logs").insert({ action: "VERIFY", license_key: key, detail: { ip, device, ok: false, app_code: "fake-lag", msg: "DEVICE_BIND_FAILED", error: up.error.message || ins.error.message } });
        return json({ ok: false, msg: "SERVER_NOT_READY" }, 200);
      }
      deviceRowId = ins.data?.id ?? null;
    }
  } else {
    deviceRowId = up.data?.id ?? null;
  }

  let guardRow: any = { ok: true, msg: "OK", verify_count: licRow.verify_count ?? null, ip_count: null };
  // Chỉ trừ lượt verify khi key được bind vào thiết bị mới.
  // Cùng thiết bị đăng nhập lại/refresh không được làm tụt lượt để tránh rớt session vô lý.
  const shouldCountVerify = mode === "login" && !existingDevice.data;
  if (shouldCountVerify) {
    const useGuard = await db.rpc("increment_fake_lag_license_use", { p_license_id: licRow.id, p_app_code: "fake-lag", p_ip_hash: ipHash });
    guardRow = Array.isArray(useGuard.data) ? useGuard.data[0] : useGuard.data;
    if (useGuard.error) {
      // Fallback cho trường hợp function RPC chưa deploy đúng, tránh đẩy app về SERVER_ERROR.
      const maxVerify = Math.max(1, Number(licRow.max_verify ?? 1));
      const currentVerify = Math.max(0, Number(licRow.verify_count ?? 0));
      if (currentVerify >= maxVerify) {
        await db.from("audit_logs").insert({ action: "VERIFY", license_key: key, detail: { ip, device, ok: false, app_code: "fake-lag", msg: "VERIFY_LIMIT_EXCEEDED", fallback: true } });
        return json({ ok: false, msg: "VERIFY_LIMIT_EXCEEDED" }, 200);
      }
      try {
        await db.from("license_ip_bindings").upsert({ license_id: licRow.id, app_code: "fake-lag", ip_hash: ipHash, last_seen_at: now.toISOString() }, { onConflict: "license_id,ip_hash" });
      } catch { /* best effort */ }
      const upd = await db.from("licenses").update({ verify_count: currentVerify + 1 }).eq("id", licRow.id).select("verify_count").maybeSingle();
      guardRow = { ok: true, msg: "OK", verify_count: upd.data?.verify_count ?? currentVerify + 1, ip_count: null, fallback: true };
    } else if (!guardRow?.ok) {
      const msg = String(guardRow?.msg || "FAKE_LAG_RULE_BLOCKED");
      await db.from("audit_logs").insert({ action: "VERIFY", license_key: key, detail: { ip, device, ok: false, app_code: "fake-lag", msg } });
      return json({ ok: false, msg }, 200);
    }
  }

  let effectiveExpiresAt: string | null = licRow.expires_at;
  let effectiveFirstUsedAt: string | null = firstUsedAt;
  let started = Boolean(effectiveFirstUsedAt);
  if (startsOnFirstUse) {
    if (!effectiveDurationSeconds || effectiveDurationSeconds <= 0) return json({ ok: false, msg: "LICENSE_MISCONFIGURED" }, 200);
    if (firstUsedAt && !licRow.expires_at) {
      const fuMs = new Date(firstUsedAt).getTime();
      if (Number.isFinite(fuMs)) {
        const healedExpiresAt = new Date(fuMs + effectiveDurationSeconds * 1000).toISOString();
        const heal = await db.from("licenses").update({ expires_at: healedExpiresAt }).eq("id", licRow.id).is("expires_at", null).select("expires_at").maybeSingle();
        effectiveExpiresAt = heal.data?.expires_at ?? healedExpiresAt;
      }
    }
    if (!firstUsedAt) {
      const newExpiresAt = new Date(now.getTime() + effectiveDurationSeconds * 1000).toISOString();
      const activation = await db.from("licenses").update({ first_used_at: now.toISOString(), activated_at: now.toISOString(), expires_at: newExpiresAt }).eq("id", licRow.id).is("first_used_at", null).select("expires_at,first_used_at").maybeSingle();
      if (!activation.error && activation.data?.expires_at) {
        effectiveExpiresAt = activation.data.expires_at;
        effectiveFirstUsedAt = activation.data.first_used_at;
      } else {
        const latest = await db.from("licenses").select("expires_at,first_used_at").eq("id", licRow.id).maybeSingle();
        if (!latest.error && latest.data) {
          effectiveExpiresAt = latest.data.expires_at ?? effectiveExpiresAt;
          effectiveFirstUsedAt = latest.data.first_used_at ?? effectiveFirstUsedAt;
        }
      }
      started = Boolean(effectiveFirstUsedAt);
    }
  }

  await db.from("audit_logs").insert({ action: "VERIFY", license_key: key, detail: { ip, device, device_name: deviceName || null, mode, ok: true, app_code: "fake-lag", license_id: licRow.id, device_row: deviceRowId, risk_flags: riskFlags || null, native_guard: nativeGuardForAudit, client_watermark: clientWatermarkForAudit || null, challenge_response: challengeResponseForAudit || null, apk_sha256: apkShaForAudit || null, so_sha256: soShaForAudit || null, dex_crc: dexCrcForAudit || null, integrity_mix: integrityMixForAudit || null } });
  const remainingSeconds = effectiveExpiresAt ? Math.max(0, Math.floor((new Date(effectiveExpiresAt).getTime() - now.getTime()) / 1000)) : startsOnFirstUse && !started && typeof effectiveDurationSeconds === "number" ? effectiveDurationSeconds : null;
  const tokenTtl = mode === "engine" || mode === "heartbeat"
    ? Number(version.policy?.engine_token_ttl_seconds ?? 3 * 60)
    : Number(version.policy?.login_token_ttl_seconds ?? 15 * 60);
  const serverChallenge = await makeServerChallenge({ key, device, signatureSha256: signatureForAudit, buildId: buildIdForAudit, mode });
  const serverWatermark = await makeServerWatermark({ key, device, signatureSha256: signatureForAudit, buildId: buildIdForAudit });
  const grantTtlSeconds = Math.max(45, Math.min(150, Number(version.policy?.heartbeat_seconds ?? 45) + 45));
  const engineGrantExpiresAt = new Date(now.getTime() + grantTtlSeconds * 1000).toISOString();
  const engineGrant = await makeEngineGrant(serviceRoleKey, { key, device, signatureSha256: signatureForAudit, buildId: buildIdForAudit, challenge: serverChallenge, exp: engineGrantExpiresAt });
  const issuedToken = await issueSessionToken(serviceRoleKey, {
    ...clientIdentity,
    app_code: "fake-lag",
    license_id: licRow.id,
    mode,
    challenge: serverChallenge,
    challenge_version: 2,
    server_watermark: serverWatermark,
    apk_sha256: apkShaForAudit || null,
    so_sha256: soShaForAudit || null,
    dex_crc: dexCrcForAudit || null,
    integrity_mix: integrityMixForAudit || null,
    client_watermark: clientWatermarkForAudit || null,
  }, tokenTtl);
  return json({
    ok: true,
    msg: "OK",
    key,
    app_code: "fake-lag",
    expires_at: effectiveExpiresAt,
    remaining_seconds: remainingSeconds,
    verify_count: guardRow?.verify_count ?? null,
    ip_count: guardRow?.ip_count ?? null,
    session_token: issuedToken.token,
    token_expires_at: issuedToken.expires_at,
    token_ttl_seconds: issuedToken.ttl_seconds,
    server_challenge: serverChallenge,
    challenge_version: 2,
    server_watermark: serverWatermark,
    engine_grant: engineGrant,
    engine_grant_expires_at: engineGrantExpiresAt,
    expected_apk_sha256: String(version.policy?.expected_apk_sha256 || ""),
    expected_so_sha256: String(version.policy?.expected_so_sha256 || ""),
    expected_dex_crc: String(version.policy?.expected_dex_crc || ""),
    heartbeat_required: true,
    next_heartbeat_seconds: Number(version.policy?.heartbeat_seconds ?? 45),
    server_time: now.toISOString(),
  }, 200);
});
