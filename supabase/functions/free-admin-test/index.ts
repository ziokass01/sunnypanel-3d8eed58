import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { assertAdmin } from "../_shared/admin.ts";
import { buildCorsHeaders, handleOptions } from "../_shared/cors.ts";

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

function extractErrorMessage(err: unknown) {
  if (!err || typeof err !== "object") return "unknown";
  const anyErr = err as Record<string, unknown>;
  return String(anyErr.message ?? anyErr.details ?? anyErr.hint ?? "unknown");
}

function maskKey(key: string) {
  if (key.length <= 10) return "***";
  return `${key.slice(0, 9)}…${key.slice(-4)}`;
}

function isFreeSchemaMissing(err: unknown) {
  const txt = extractErrorMessage(err).toLowerCase();
  return txt.includes("does not exist") || txt.includes("undefined column") || txt.includes("could not find");
}

function getClientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "127.0.0.1";
}

const BodySchema = z.object({
  key_type_code: z.string().min(2).max(64),
  dry_run: z.boolean().optional().default(false),
});



async function loadFindDumpsRewardPackage(sb: any, packageCode: string) {
  const { data, error } = await sb
    .from("server_app_reward_packages")
    .select("id,package_code,title,description,enabled,reward_mode,plan_code,soft_credit_amount,premium_credit_amount,entitlement_days,entitlement_seconds,device_limit_override,account_limit_override")
    .eq("app_code", "find-dumps")
    .eq("package_code", packageCode)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function mintFindDumpsRuntimeKey(sb: any, sessionId: string, traceId: string, keyType: any, nowIso: string) {
  const selectionMode = String((keyType as any).free_selection_mode ?? "").trim().toLowerCase();
  const packageCode = selectionMode === "credit"
    ? String((keyType as any).default_credit_code ?? "credit-normal").trim() || "credit-normal"
    : String((keyType as any).default_package_code ?? "classic").trim() || "classic";
  const rewardPkg = await loadFindDumpsRewardPackage(sb, packageCode);
  if (!rewardPkg || rewardPkg.enabled === false) {
    throw new Error(`FIND_DUMPS_REWARD_PACKAGE_NOT_FOUND:${packageCode}`);
  }
  const redeemKey = makeKey();
  const durationSeconds = Number((keyType as any).duration_seconds ?? 0) || 0;
  const expiresAt = durationSeconds > 0 ? new Date(Date.now() + durationSeconds * 1000).toISOString() : null;
  const rewardMode = String((rewardPkg as any).reward_mode ?? (selectionMode === "credit" ? "soft_credit" : "plan")).trim() || "plan";
  const { data, error } = await sb
    .from("server_app_redeem_keys")
    .insert({
      app_code: "find-dumps",
      reward_package_id: rewardPkg.id,
      redeem_key: redeemKey,
      title: String((rewardPkg as any).title ?? (keyType as any).label ?? "Find Dumps key"),
      description: String((rewardPkg as any).description ?? "Admin test key for Find Dumps"),
      enabled: true,
      starts_at: nowIso,
      expires_at: expiresAt,
      max_redemptions: 1,
      redeemed_count: 0,
      reward_mode: rewardMode,
      plan_code: (rewardPkg as any).plan_code ?? null,
      soft_credit_amount: Number((rewardPkg as any).soft_credit_amount ?? 0) || 0,
      premium_credit_amount: Number((rewardPkg as any).premium_credit_amount ?? 0) || 0,
      entitlement_days: Number((rewardPkg as any).entitlement_days ?? 0) || 0,
      entitlement_seconds: Number((rewardPkg as any).entitlement_seconds ?? durationSeconds) || 0,
      device_limit_override: (rewardPkg as any).device_limit_override ?? null,
      account_limit_override: (rewardPkg as any).account_limit_override ?? null,
      trace_id: traceId,
      source_free_session_id: sessionId,
      metadata: { source: "admin-test", free_session_id: sessionId, trace_id: traceId, key_type_code: keyType.code, package_code: packageCode },
      notes: `ADMIN_TEST_FIND_DUMPS:${String(keyType.code || '').toUpperCase()}`
    })
    .select("id,redeem_key")
    .single();
  if (error || !data?.id) throw error ?? new Error("SERVER_REDEEM_KEY_INSERT_FAILED");
  return { id: String(data.id), redeem_key: String(data.redeem_key), expires_at: expiresAt };
}

Deno.serve(async (req) => {
  const PUBLIC_BASE_URL = Deno.env.get("PUBLIC_BASE_URL") ?? "";
  const cors = buildCorsHeaders(req, PUBLIC_BASE_URL, "POST,OPTIONS");
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });

  if (req.method === "OPTIONS") return handleOptions(req, PUBLIC_BASE_URL, "POST,OPTIONS");
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
    .select("code,label,duration_seconds,enabled,app_code,free_selection_mode,default_package_code,default_credit_code,default_wallet_kind")
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
  const traceId = crypto.randomUUID();
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
      trace_id: traceId,
    })
    .select("session_id")
    .single();

  if (sessionInsert.error || !sessionInsert.data?.session_id) {
    return json({ ok: false, message: "SESSION_INSERT_FAILED", ip_hash: ipHash, fp_hash: fpHash, detail: isFreeSchemaMissing(sessionInsert.error) ? "Thiếu migration: 20260206150000_free_schema_runtime_fix.sql" : undefined }, 500);
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

  const isFindDumpsRuntime = String((keyType as any).app_code ?? "").trim().toLowerCase() === "find-dumps";
  if (isFindDumpsRuntime) {
    try {
      const minted = await mintFindDumpsRuntimeKey(sb, sessionId, traceId, keyType, now.toISOString());
      await sb.from("licenses_free_sessions").update({
        status: "revealed",
        reveal_count: 1,
        revealed_at: now.toISOString(),
        app_code: "find-dumps",
        issued_server_redeem_key_id: minted.id,
      }).eq("session_id", sessionId);
      await sb.from("licenses_free_issues").insert({
        license_id: null,
        key_mask: minted.redeem_key,
        created_at: now.toISOString(),
        expires_at: minted.expires_at,
        session_id: sessionId,
        ip_hash: ipHash,
        fingerprint_hash: fpHash,
        ua_hash: uaHash,
        app_code: "find-dumps",
        key_signature: "FD",
        server_redeem_key_id: minted.id,
      });
      return json({
        ok: true,
        key: minted.redeem_key,
        expires_at: minted.expires_at,
        ip_hash: ipHash,
        fp_hash: fpHash,
        session_id: sessionId,
        message: "ADMIN_TEST_OK",
      });
    } catch (e) {
      await sb.from("licenses_free_sessions").update({ status: "start_error", last_error: "SERVER_REDEEM_KEY_INSERT_FAILED" }).eq("session_id", sessionId);
      return json({ ok: false, message: "SERVER_REDEEM_KEY_INSERT_FAILED", session_id: sessionId, detail: extractErrorMessage(e) }, 500);
    }
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
    return json({ ok: false, message: "LICENSE_INSERT_FAILED", ip_hash: ipHash, fp_hash: fpHash, session_id: sessionId, detail: isFreeSchemaMissing(licenseIns.error) ? "Thiếu migration: 20260206150000_free_schema_runtime_fix.sql" : undefined }, 500);
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
