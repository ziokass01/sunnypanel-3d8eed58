import { createClient } from "npm:@supabase/supabase-js@2";
import { createAdminClient, json } from "../_shared/admin.ts";

function dayKeyVN(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "00";
  const d = parts.find((p) => p.type === "day")?.value ?? "00";
  return `${y}-${m}-${d}`;
}

function normalizeCode(value: string) {
  return String(value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

function parseTextArray(value: unknown) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value ?? "")
    .split(/[\n,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getIp(req: Request) {
  return req.headers.get("cf-connecting-ip")
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

async function getUser(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : authHeader.trim();
  if (!supabaseUrl || !anonKey || !token) return { user: null, token: "" };

  const authed = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await authed.auth.getUser(token);
  if (error || !data?.user) return { user: null, token };
  return { user: data.user, token };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return json(200, { ok: true }, origin);
  if (req.method !== "POST") return json(405, { ok: false, code: "METHOD_NOT_ALLOWED" }, origin);

  const db = createAdminClient();
  const { user } = await getUser(req);
  if (!user) return json(401, { ok: false, code: "LOGIN_REQUIRED", msg: "Bạn cần đăng nhập để nhập key AI." }, origin);

  const body = await req.json().catch(() => ({}));
  const code = normalizeCode(String(body?.code ?? ""));
  if (code.length < 6) return json(400, { ok: false, code: "CODE_MISSING", msg: "Vui lòng nhập key AI hợp lệ." }, origin);

  const pepper = Deno.env.get("AI_SUNNY_KEY_PEPPER") ?? Deno.env.get("AI_SUNNY_HASH_PEPPER") ?? "sunny-ai";
  const codeHash = await sha256Hex(`${pepper}:${code}`);

  const ip = getIp(req);
  const ua = req.headers.get("user-agent") ?? "";
  const deviceRaw = String(body?.device_id ?? req.headers.get("x-ai-device") ?? "").trim();
  const ipHash = await sha256Hex(`ip:${ip}:${pepper}`);
  const uaHash = await sha256Hex(`ua:${ua}:${pepper}`);
  const deviceHash = deviceRaw ? await sha256Hex(`device:${deviceRaw}:${pepper}`) : null;
  const dayKey = dayKeyVN();
  const email = String(user.email ?? "").toLowerCase();

  const { data: keyRow, error: keyErr } = await db
    .from("ai_sunny_redeem_keys")
    .select("*")
    .eq("code_hash", codeHash)
    .maybeSingle();

  if (keyErr) return json(500, { ok: false, code: "DB_ERROR", msg: keyErr.message }, origin);
  if (!keyRow) return json(404, { ok: false, code: "KEY_NOT_FOUND", msg: "Key AI không tồn tại hoặc đã sai." }, origin);
  if (keyRow.status !== "active") return json(403, { ok: false, code: "KEY_DISABLED", msg: "Key AI này đã bị tắt." }, origin);
  if (keyRow.expires_at && new Date(keyRow.expires_at).getTime() < Date.now()) {
    await db.from("ai_sunny_redeem_keys").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", keyRow.id);
    return json(403, { ok: false, code: "KEY_EXPIRED", msg: "Key AI đã hết hạn." }, origin);
  }
  if (Number(keyRow.max_uses_total ?? 0) > 0 && Number(keyRow.used_count ?? 0) >= Number(keyRow.max_uses_total)) {
    return json(429, { ok: false, code: "KEY_USED_OUT", msg: "Key AI đã hết lượt dùng." }, origin);
  }
  if (keyRow.require_device_id && !deviceHash) {
    return json(400, { ok: false, code: "DEVICE_REQUIRED", msg: "Thiếu mã thiết bị để nhập key AI." }, origin);
  }

  const { data: logs } = await db
    .from("ai_sunny_redeem_logs")
    .select("id,user_id,day_key,ip_hash,device_hash")
    .eq("redeem_key_id", keyRow.id);

  const allLogs = logs ?? [];
  if (keyRow.per_user_once && allLogs.some((r: any) => r.user_id === user.id)) {
    return json(409, { ok: false, code: "USER_ALREADY_USED", msg: "Tài khoản này đã dùng key AI này rồi." }, origin);
  }

  const todayLogs = allLogs.filter((r: any) => r.day_key === dayKey);
  if (Number(keyRow.max_uses_per_day ?? 0) > 0 && todayLogs.length >= Number(keyRow.max_uses_per_day)) {
    return json(429, { ok: false, code: "KEY_DAILY_LIMIT", msg: "Key AI đã hết lượt dùng trong ngày." }, origin);
  }
  if (Number(keyRow.daily_ip_limit ?? 0) > 0 && todayLogs.filter((r: any) => r.ip_hash === ipHash).length >= Number(keyRow.daily_ip_limit)) {
    return json(429, { ok: false, code: "IP_DAILY_LIMIT", msg: "IP này đã dùng key AI quá giới hạn hôm nay." }, origin);
  }
  if (Number(keyRow.daily_device_limit ?? 0) > 0 && deviceHash && todayLogs.filter((r: any) => r.device_hash === deviceHash).length >= Number(keyRow.daily_device_limit)) {
    return json(429, { ok: false, code: "DEVICE_DAILY_LIMIT", msg: "Thiết bị này đã dùng key AI quá giới hạn hôm nay." }, origin);
  }

  const expiresAt = new Date(Date.now() + Math.max(1, Number(keyRow.grant_hours ?? 24)) * 60 * 60 * 1000).toISOString();
  const dailyTokenOverride = Math.max(0, Number(keyRow.bonus_daily_tokens ?? 0));
  const dailyMessageOverride = Math.max(0, Number(keyRow.bonus_daily_messages ?? 0));
  const allowedModelsOverride = parseTextArray(keyRow.allowed_models);

  const upsertAccess = await db
    .from("ai_sunny_user_access")
    .upsert({
      user_id: user.id,
      email,
      plan_code: keyRow.plan_code_to_grant,
      status: "active",
      daily_token_limit_override: dailyTokenOverride || null,
      daily_message_limit_override: dailyMessageOverride || null,
      daily_ip_limit_override: null,
      daily_device_limit_override: null,
      expires_at: expiresAt,
      source: "redeem-key",
      note: `Redeemed ${keyRow.code_mask}`,
      metadata: {
        source_redeem_key_id: keyRow.id,
        source_code_mask: keyRow.code_mask,
        redeemed_at: new Date().toISOString(),
        allowed_models_override: allowedModelsOverride,
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })
    .select("*")
    .single();

  if (upsertAccess.error) return json(500, { ok: false, code: "ACCESS_UPSERT_FAILED", msg: upsertAccess.error.message }, origin);

  const logRes = await db.from("ai_sunny_redeem_logs").insert({
    redeem_key_id: keyRow.id,
    user_id: user.id,
    email,
    day_key: dayKey,
    ip_hash: ipHash,
    device_hash: deviceHash,
    ua_hash: uaHash,
    bonus_daily_tokens: dailyTokenOverride,
    bonus_daily_messages: dailyMessageOverride,
    granted_plan_code: keyRow.plan_code_to_grant,
  });

  if (logRes.error) return json(500, { ok: false, code: "REDEEM_LOG_FAILED", msg: logRes.error.message }, origin);

  await db.from("ai_sunny_redeem_keys").update({
    used_count: Number(keyRow.used_count ?? 0) + 1,
    updated_at: new Date().toISOString(),
  }).eq("id", keyRow.id);

  return json(200, {
    ok: true,
    msg: "Đã mở gói AI thành công.",
    plan_code: keyRow.plan_code_to_grant,
    expires_at: expiresAt,
    daily_token_limit: dailyTokenOverride,
    daily_message_limit: dailyMessageOverride,
    allowed_models: allowedModelsOverride,
  }, origin);
});
