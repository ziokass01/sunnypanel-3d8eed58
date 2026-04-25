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

function normalizeKey(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function appCodeFromKey(key: string) {
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

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
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
  const { data, error } = await db
    .from("licenses_free_issues")
    .select("issue_id")
    .eq("license_id", licenseId)
    .limit(1);
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
  publicResetCount: number;
  penaltyPct?: number;
  penaltySeconds?: number;
  devicesRemoved?: number;
  msg?: string;
}) {
  const now = new Date();
  const remainingSeconds = secondsBetween(now, args.lic?.expires_at);
  const nextPenaltyPct = computePenaltyPct(args.settings, args.keyKind, args.publicResetCount);
  const nextPenaltySeconds = remainingSeconds == null ? 0 : Math.floor(remainingSeconds * nextPenaltyPct / 100);

  const status = !args.lic?.is_active
    ? "blocked"
    : args.lic?.deleted_at
      ? "deleted"
      : args.lic?.expires_at && remainingSeconds === 0
        ? "expired"
        : "active";

  return {
    ok: true,
    msg: args.msg ?? "OK",
    key: args.lic?.key,
    key_kind: args.keyKind,
    app_code: args.appCode,
    created_at: args.lic?.created_at ?? null,
    expires_at: args.lic?.expires_at ?? null,
    remaining_seconds: remainingSeconds,
    status,
    device_count: args.deviceCount,
    max_devices: args.lic?.max_devices ?? 1,
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

async function handleCheck(req: Request, db: any, key: string) {
  const { data: lic, error } = await db
    .from("licenses")
    .select("id,key,created_at,expires_at,is_active,deleted_at,max_devices,public_reset_disabled")
    .eq("key", key)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !lic) return response(req, 404, { ok: false, msg: "KEY_UNAVAILABLE" });

  const [settings, keyKind, deviceCount, publicResetCount] = await Promise.all([
    getResetSettings(db),
    getKeyKind(db, lic.id),
    countRows(db, "license_devices", (q) => q.eq("license_id", lic.id)),
    countRows(db, "audit_logs", (q) => q.eq("license_key", key).eq("action", "PUBLIC_RESET")),
  ]);

  return response(req, 200, buildSnapshot({
    lic,
    settings,
    keyKind,
    appCode: appCodeFromKey(key),
    deviceCount,
    publicResetCount,
  }));
}

async function handleReset(req: Request, db: any, body: any, key: string) {
  const { data: lic, error } = await db
    .from("licenses")
    .select("id,key,created_at,expires_at,is_active,deleted_at,max_devices,public_reset_disabled")
    .eq("key", key)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !lic || !lic.is_active) return response(req, 404, { ok: false, msg: "KEY_UNAVAILABLE" });

  const settings = await getResetSettings(db);
  if (!Boolean(settings?.enabled ?? true)) {
    return response(req, 403, { ok: false, msg: "RESET_DISABLED", disabled_message: settings?.disabled_message ?? null });
  }
  if (Boolean(lic.public_reset_disabled)) {
    return response(req, 403, { ok: false, msg: "KEY_RESET_DISABLED", public_reset_disabled: true });
  }
  if (Boolean(settings?.require_turnstile)) {
    const ok = await verifyTurnstile(body?.turnstile_token, req);
    if (!ok) return response(req, 403, { ok: false, msg: "TURNSTILE_FAILED" });
  }

  const now = new Date();
  const [keyKind, deviceCount, priorPublicResetCount] = await Promise.all([
    getKeyKind(db, lic.id),
    countRows(db, "license_devices", (q) => q.eq("license_id", lic.id)),
    countRows(db, "audit_logs", (q) => q.eq("license_key", key).eq("action", "PUBLIC_RESET")),
  ]);
  const appCode = appCodeFromKey(key);
  const penaltyPct = computePenaltyPct(settings, keyKind, priorPublicResetCount);
  const remainingSeconds = secondsBetween(now, lic.expires_at);
  const penaltySeconds = remainingSeconds == null ? 0 : Math.floor(remainingSeconds * penaltyPct / 100);
  const newExpiresAt = remainingSeconds == null || penaltySeconds <= 0
    ? lic.expires_at
    : addSeconds(now, Math.max(0, remainingSeconds - penaltySeconds));

  await db.from("license_devices").delete().eq("license_id", lic.id);

  if (newExpiresAt !== lic.expires_at) {
    await db.from("licenses").update({
      expires_at: newExpiresAt,
      is_active: new Date(newExpiresAt).getTime() > now.getTime(),
    }).eq("id", lic.id);
  }

  await db.from("audit_logs").insert({
    action: "PUBLIC_RESET",
    license_key: key,
    detail: {
      license_id: lic.id,
      app_code: appCode,
      key_kind: keyKind,
      devices_removed: deviceCount,
      prior_public_reset_count: priorPublicResetCount,
      penalty_pct: penaltyPct,
      penalty_seconds: penaltySeconds,
      old_expires_at: lic.expires_at,
      new_expires_at: newExpiresAt,
      source: "public",
    },
  });

  const refreshed = { ...lic, expires_at: newExpiresAt, is_active: !newExpiresAt || new Date(newExpiresAt).getTime() > now.getTime() };
  return response(req, 200, buildSnapshot({
    lic: refreshed,
    settings,
    keyKind,
    appCode,
    deviceCount: 0,
    publicResetCount: priorPublicResetCount + 1,
    penaltyPct,
    penaltySeconds,
    devicesRemoved: deviceCount,
    msg: "RESET_OK",
  }));
}

Deno.serve(async (req) => {
  const publicBaseUrl = env("PUBLIC_BASE_URL", "https://mityangho.id.vn");
  if (req.method === "OPTIONS") return handleOptions(req, publicBaseUrl, "GET,POST,OPTIONS");

  try {
    const db = adminDb();

    if (req.method === "GET") {
      const settings = await getResetSettings(db);
      return response(req, 200, {
        ok: true,
        turnstile_enabled: Boolean(settings?.require_turnstile),
        configured: Boolean(env("TURNSTILE_SECRET_KEY") || env("CLOUDFLARE_TURNSTILE_SECRET")),
      });
    }

    if (req.method !== "POST") return response(req, 405, { ok: false, msg: "METHOD_NOT_ALLOWED" });

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "check").toLowerCase();
    const key = normalizeKey(body?.key);
    if (!/^[A-Z0-9]{2,16}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key)) {
      return response(req, 400, { ok: false, msg: "KEY_UNAVAILABLE" });
    }

    if (action === "reset") return await handleReset(req, db, body, key);
    return await handleCheck(req, db, key);
  } catch (e) {
    console.error("reset-key error", e);
    return response(req, 500, { ok: false, msg: "SERVER_ERROR" });
  }
});
