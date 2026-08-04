import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders, handleOptions } from "../_shared/cors.ts";

type JsonRecord = Record<string, unknown>;

function env(name: string, fallback = "") {
  return Deno.env.get(name) ?? fallback;
}

function adminDb() {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SERVER_MISCONFIG");
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "sunnypanel-reset-key" } },
  });
}

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

function normalizeKey(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function appCodeFromKey(key: string) {
  if (key.startsWith("AI-SUNNY-") || key.startsWith("AI-")) return "ai-coding";
  if (key.startsWith("FAKELAG-")) return "fake-lag";
  if (key.startsWith("FND-") || key.startsWith("FD-")) return "find-dumps";
  if (key.startsWith("SUNNY-")) return "free-fire";
  return "unknown";
}

function clampPercent(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function secondsBetween(from: Date, toIso: string | null | undefined) {
  if (!toIso) return null;
  const to = new Date(toIso);
  if (!Number.isFinite(to.getTime())) return null;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
}

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + Math.max(0, Math.floor(seconds)) * 1000).toISOString();
}

function effectiveTiming(lic: any, now: Date) {
  const startsOnFirstUse = Boolean(lic?.start_on_first_use || lic?.starts_on_first_use);
  const firstUsedAt = lic?.first_used_at ?? lic?.activated_at ?? null;
  const seconds = Number(lic?.duration_seconds ?? 0);
  const days = Number(lic?.duration_days ?? 0);
  const durationSeconds = seconds > 0 ? seconds : days > 0 ? days * 86400 : null;
  let expiresAt: string | null = lic?.expires_at ?? null;
  if (!expiresAt && startsOnFirstUse && firstUsedAt && durationSeconds) {
    const firstMs = new Date(firstUsedAt).getTime();
    if (Number.isFinite(firstMs)) expiresAt = new Date(firstMs + durationSeconds * 1000).toISOString();
  }
  const remainingSeconds = expiresAt
    ? secondsBetween(now, expiresAt)
    : startsOnFirstUse && !firstUsedAt && durationSeconds
      ? Math.max(0, Math.floor(durationSeconds))
      : null;
  return { startsOnFirstUse, firstUsedAt, durationSeconds, expiresAt, remainingSeconds };
}

function response(req: Request, status: number, body: JsonRecord) {
  const publicBaseUrl = env("PUBLIC_BASE_URL", "https://mityangho.id.vn");
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...buildCorsHeaders(req, publicBaseUrl, "GET,POST,OPTIONS"),
      "content-type": "application/json; charset=utf-8",
    },
  });
}

async function readJsonBody(req: Request, maxBytes = 8192) {
  const declared = Number(req.headers.get("content-length") || 0);
  if (!Number.isFinite(declared) || declared < 0 || declared > maxBytes) throw new Error("PAYLOAD_TOO_LARGE");
  if (!req.body) return {};
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("PAYLOAD_TOO_LARGE");
      throw new Error("PAYLOAD_TOO_LARGE");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text ? JSON.parse(text) : {};
}

async function verifyTurnstile(token: string | undefined | null, req: Request) {
  const secret = env("TURNSTILE_SECRET_KEY") || env("CLOUDFLARE_TURNSTILE_SECRET");
  if (!secret) return false;
  if (!token) return false;
  try {
    const form = new FormData();
    form.append("secret", secret);
    form.append("response", token);
    const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (ip) form.append("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const json = await res.json().catch(() => ({}));
    return Boolean(json?.success);
  } catch {
    return false;
  }
}

async function getResetSettings(db: any) {
  const { data } = await db.from("license_reset_settings").select("*").eq("id", 1).maybeSingle();
  return data ?? {
    enabled: true,
    require_turnstile: false,
    free_first_penalty_pct: 0,
    free_next_penalty_pct: 20,
    free_next_step_penalty_pct: 20,
    paid_first_penalty_pct: 0,
    paid_next_penalty_pct: 20,
    paid_next_step_penalty_pct: 20,
    public_reset_cancel_after_count: 0,
    disabled_message: "Reset key đang tạm tắt.",
  };
}

async function getKeyKind(db: any, licenseId: string) {
  const { data, error } = await db.from("licenses_free_issues").select("issue_id").eq("license_id", licenseId).limit(1);
  if (!error && Array.isArray(data) && data.length > 0) return "free";
  return "admin";
}

async function countRows(db: any, table: string, filters: (q: any) => any) {
  const q = filters(db.from(table).select("id", { count: "exact", head: true }));
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

function computePenaltyPct(settings: any, keyKind: string, priorResetCount: number) {
  if (keyKind === "free") {
    return priorResetCount <= 0
      ? clampPercent(settings?.free_first_penalty_pct)
      : clampPercent(settings?.free_next_penalty_pct ?? settings?.free_next_step_penalty_pct);
  }
  return priorResetCount <= 0
    ? clampPercent(settings?.paid_first_penalty_pct)
    : clampPercent(settings?.paid_next_penalty_pct ?? settings?.paid_next_step_penalty_pct);
}

function buildSnapshot(args: {
  lic: any;
  settings: any;
  keyKind: string;
  appCode: string;
  deviceCount: number;
  ipCount?: number;
  publicResetCount: number;
  penaltyPct?: number;
  penaltySeconds?: number;
  devicesRemoved?: number;
  msg?: string;
}) {
  const now = new Date();
  const timing = effectiveTiming(args.lic, now);
  const remainingSeconds = timing.remainingSeconds;
  const nextPenaltyPct = computePenaltyPct(args.settings, args.keyKind, args.publicResetCount);
  const nextPenaltySeconds = remainingSeconds == null ? 0 : Math.floor(remainingSeconds * nextPenaltyPct / 100);
  const status = !args.lic?.is_active
    ? "blocked"
    : args.lic?.deleted_at
      ? "deleted"
    : timing.expiresAt && remainingSeconds === 0
        ? "expired"
        : timing.startsOnFirstUse && !timing.firstUsedAt
          ? "not_started"
        : "active";
  return {
    ok: true,
    msg: args.msg ?? "OK",
    key: args.lic?.key,
    key_kind: args.keyKind,
    app_code: args.appCode,
    created_at: args.lic?.created_at ?? null,
    expires_at: timing.expiresAt,
    remaining_seconds: remainingSeconds,
    status,
    device_count: args.deviceCount,
    max_devices: args.lic?.max_devices ?? 1,
    ip_count: args.ipCount ?? 0,
    max_ips: args.lic?.max_ips ?? 1,
    verify_count: args.lic?.verify_count ?? 0,
    max_verify: args.lic?.max_verify ?? 1,
    public_reset_count: args.publicResetCount,
    penalty_pct: args.penaltyPct,
    penalty_seconds: args.penaltySeconds,
    devices_removed: args.devicesRemoved,
    reset_enabled: Boolean(args.settings?.enabled ?? true),
    disabled_message: args.settings?.disabled_message ?? null,
    public_reset_disabled: Boolean(args.lic?.public_reset_disabled),
    next_reset_penalty_pct: nextPenaltyPct,
    next_reset_will_expire: remainingSeconds != null && nextPenaltySeconds >= remainingSeconds && nextPenaltyPct > 0,
    public_reset_cancel_after_count: args.settings?.public_reset_cancel_after_count ?? null,
  };
}

async function aiKeyHash(key: string) {
  const pepper = env("AI_SUNNY_KEY_PEPPER") || env("AI_SUNNY_HASH_PEPPER") || "sunny-ai";
  return await sha256Hex(`${pepper}:${key}`);
}

async function findAiKey(db: any, key: string) {
  const codeHash = await aiKeyHash(key);
  const { data, error } = await db
    .from("ai_sunny_redeem_keys")
    .select("id,code_mask,title,status,created_at,updated_at,expires_at,grant_hours,max_uses_total,max_uses_per_day,used_count,daily_ip_limit,daily_device_limit")
    .eq("code_hash", codeHash)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

function buildAiLicenseShape(key: string, row: any) {
  const active = String(row?.status ?? "").toLowerCase() === "active";
  return {
    id: row?.id,
    key,
    created_at: row?.created_at ?? null,
    expires_at: row?.expires_at ?? null,
    is_active: active,
    deleted_at: null,
    max_devices: row?.daily_device_limit ?? 1,
    public_reset_disabled: false,
  };
}

async function handleAiCheck(req: Request, db: any, key: string) {
  const row = await findAiKey(db, key);
  if (!row) return response(req, 404, { ok: false, msg: "KEY_UNAVAILABLE" });
  const [settings, deviceCount, publicResetCount] = await Promise.all([
    getResetSettings(db),
    countRows(db, "ai_sunny_redeem_logs", (q) => q.eq("redeem_key_id", row.id)),
    countRows(db, "audit_logs", (q) => q.eq("license_key", key).eq("action", "PUBLIC_RESET")),
  ]);
  return response(req, 200, buildSnapshot({
    lic: buildAiLicenseShape(key, row),
    settings,
    keyKind: "free",
    appCode: "ai-coding",
    deviceCount,
    publicResetCount,
  }));
}

async function handleAiReset(req: Request, db: any, body: any, key: string) {
  const row = await findAiKey(db, key);
  if (!row || String(row.status ?? "") !== "active") return response(req, 404, { ok: false, msg: "KEY_UNAVAILABLE" });
  const settings = await getResetSettings(db);
  if (!Boolean(settings?.enabled ?? true)) return response(req, 403, { ok: false, msg: "RESET_DISABLED", disabled_message: settings?.disabled_message ?? null });
  if (Boolean(settings?.require_turnstile)) {
    const ok = await verifyTurnstile(body?.turnstile_token, req);
    if (!ok) return response(req, 403, { ok: false, msg: "TURNSTILE_FAILED" });
  }

  const now = new Date();
  const [deviceCount, priorPublicResetCount] = await Promise.all([
    countRows(db, "ai_sunny_redeem_logs", (q) => q.eq("redeem_key_id", row.id)),
    countRows(db, "audit_logs", (q) => q.eq("license_key", key).eq("action", "PUBLIC_RESET")),
  ]);
  const penaltyPct = computePenaltyPct(settings, "free", priorPublicResetCount);
  const remainingSeconds = secondsBetween(now, row.expires_at);
  const penaltySeconds = remainingSeconds == null ? 0 : Math.floor(remainingSeconds * penaltyPct / 100);
  const newExpiresAt = remainingSeconds == null || penaltySeconds <= 0 ? row.expires_at : addSeconds(now, Math.max(0, remainingSeconds - penaltySeconds));

  await db.from("ai_sunny_redeem_logs").delete().eq("redeem_key_id", row.id);
  await db.from("ai_sunny_redeem_keys").update({
    used_count: 0,
    status: newExpiresAt && new Date(newExpiresAt).getTime() <= now.getTime() ? "expired" : "active",
    expires_at: newExpiresAt ?? null,
    updated_at: new Date().toISOString(),
  }).eq("id", row.id);

  await db.from("audit_logs").insert({
    action: "PUBLIC_RESET",
    license_key: key,
    detail: {
      ai_redeem_key_id: row.id,
      app_code: "ai-coding",
      key_kind: "free",
      devices_removed: deviceCount,
      prior_public_reset_count: priorPublicResetCount,
      penalty_pct: penaltyPct,
      penalty_seconds: penaltySeconds,
      old_expires_at: row.expires_at,
      new_expires_at: newExpiresAt,
      source: "public-ai",
    },
  });

  const refreshed = { ...row, expires_at: newExpiresAt, used_count: 0, status: newExpiresAt && new Date(newExpiresAt).getTime() <= now.getTime() ? "expired" : "active" };
  return response(req, 200, buildSnapshot({
    lic: buildAiLicenseShape(key, refreshed),
    settings,
    keyKind: "free",
    appCode: "ai-coding",
    deviceCount: 0,
    publicResetCount: priorPublicResetCount + 1,
    penaltyPct,
    penaltySeconds,
    devicesRemoved: deviceCount,
    msg: "RESET_OK",
  }));
}

async function handleCheck(req: Request, db: any, key: string) {
  if (appCodeFromKey(key) === "ai-coding") return await handleAiCheck(req, db, key);
  const { data: lic, error } = await db
    .from("licenses")
    .select("id,key,created_at,expires_at,is_active,deleted_at,max_devices,max_ips,max_verify,verify_count,public_reset_disabled,start_on_first_use,starts_on_first_use,duration_seconds,duration_days,first_used_at,activated_at,app_code,public_reset_count,admin_reset_count")
    .eq("key", key)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !lic) return response(req, 404, { ok: false, msg: "KEY_UNAVAILABLE" });
  const [settings, keyKind, deviceCount, ipCount, publicResetCount] = await Promise.all([
    getResetSettings(db),
    getKeyKind(db, lic.id),
    countRows(db, "license_devices", (q) => q.eq("license_id", lic.id)),
    countRows(db, "license_ip_bindings", (q) => q.eq("license_id", lic.id)),
    countRows(db, "audit_logs", (q) => q.eq("license_key", key).eq("action", "PUBLIC_RESET")),
  ]);
  return response(req, 200, buildSnapshot({ lic, settings, keyKind, appCode: appCodeFromKey(key), deviceCount, ipCount, publicResetCount: Math.max(Number(lic.public_reset_count ?? 0), publicResetCount) }));
}

async function handleReset(req: Request, db: any, body: any, key: string) {
  if (appCodeFromKey(key) === "ai-coding") return await handleAiReset(req, db, body, key);
  const { data: lic, error } = await db
    .from("licenses")
    .select("id,key,is_active,deleted_at,public_reset_disabled")
    .eq("key", key)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !lic || !lic.is_active) return response(req, 404, { ok: false, msg: "KEY_UNAVAILABLE" });
  const settings = await getResetSettings(db);
  if (!Boolean(settings?.enabled ?? true)) return response(req, 403, { ok: false, msg: "RESET_DISABLED", disabled_message: settings?.disabled_message ?? null });
  if (Boolean(lic.public_reset_disabled)) return response(req, 403, { ok: false, msg: "KEY_RESET_DISABLED", public_reset_disabled: true });
  if (Boolean(settings?.require_turnstile)) {
    const ok = await verifyTurnstile(body?.turnstile_token, req);
    if (!ok) return response(req, 403, { ok: false, msg: "TURNSTILE_FAILED" });
  }
  const resetResult = await db.rpc("reset_license_key_atomic", { p_key: key });
  if (resetResult.error) return response(req, 500, { ok: false, msg: "SERVER_ERROR" });
  const result = resetResult.data ?? { ok: false, msg: "RESET_INTERNAL_ERROR" };
  const status = result?.ok ? 200 : String(result?.msg || "") === "KEY_RESET_DISABLED" ? 403 : 409;
  if (!result?.ok && String(result?.msg || "") === "RESET_INTERNAL_ERROR") {
    return response(req, status, { ok: false, msg: "RESET_INTERNAL_ERROR" });
  }
  return response(req, status, result);
}

Deno.serve(async (req) => {
  const publicBaseUrl = env("PUBLIC_BASE_URL", "https://mityangho.id.vn");
  if (req.method === "OPTIONS") return handleOptions(req, publicBaseUrl, "GET,POST,OPTIONS");
  try {
    const db = adminDb();
    if (req.method === "GET") {
      const settings = await getResetSettings(db);
      return response(req, 200, { ok: true, turnstile_enabled: Boolean(settings?.require_turnstile), configured: Boolean(env("TURNSTILE_SECRET_KEY") || env("CLOUDFLARE_TURNSTILE_SECRET")) });
    }
    if (req.method !== "POST") return response(req, 405, { ok: false, msg: "METHOD_NOT_ALLOWED" });
    let body: any = {};
    try {
      body = await readJsonBody(req);
    } catch (error) {
      return response(req, String((error as Error)?.message) === "PAYLOAD_TOO_LARGE" ? 413 : 400, { ok: false, msg: "INVALID_INPUT" });
    }
    const action = String(body?.action ?? "check").toLowerCase();
    const key = normalizeKey(body?.key);
    if (!/^[A-Z0-9_-]{2,24}-[A-Z0-9]{4,8}-[A-Z0-9]{4,8}-[A-Z0-9]{4,8}$/.test(key)) {
      return response(req, 400, { ok: false, msg: "KEY_UNAVAILABLE" });
    }
    const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const ipLimit = await db.rpc("check_rate_limit", { p_key: `RESET_KEY_${action.toUpperCase()}`, p_ip: ip, p_limit: action === "reset" ? 10 : 60, p_window_seconds: 300 });
    const keyLimit = await db.rpc("check_rate_limit", { p_key: key, p_ip: ip, p_limit: action === "reset" ? 3 : 20, p_window_seconds: action === "reset" ? 600 : 300 });
    if (ipLimit.error || keyLimit.error) return response(req, 503, { ok: false, msg: "SERVER_ERROR" });
    if (!ipLimit.data?.[0]?.allowed || !keyLimit.data?.[0]?.allowed) return response(req, 429, { ok: false, msg: "RATE_LIMIT" });
    if (action === "reset") return await handleReset(req, db, body, key);
    return await handleCheck(req, db, key);
  } catch (e) {
    console.error("reset-key error", e);
    return response(req, 500, { ok: false, msg: "SERVER_ERROR" });
  }
});
