import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { buildCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { hashPassword, verifyPassword, signJwt, verifyJwt, randomRentKey, isValidRentKeyFormat, sha256Hex, hmacSha256Hex } from "../_shared/rent.ts";

function inferBaseUrl(req: Request) {
  const origin = req.headers.get("origin");
  if (origin) return origin;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return "https://mityangho.id.vn";
}

function json(req: Request, publicBaseUrl: string, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...buildCorsHeaders(req, publicBaseUrl, "POST,OPTIONS"),
      "Content-Type": "application/json",
    },
  });
}

function getBearer(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice("bearer ".length).trim();
  return "";
}

async function requireSession(sb: any, req: Request) {
  const token = getBearer(req);
  if (!token) return { ok: false as const, status: 401, body: { ok: false, code: "UNAUTHORIZED", msg: "Missing token" } };

  const secret = Deno.env.get("RENT_JWT_SECRET") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!secret) return { ok: false as const, status: 503, body: { ok: false, code: "SERVER_MISCONFIG_MISSING_SECRET", msg: "Missing RENT_JWT_SECRET" } };

  const payload = await verifyJwt(token, secret);
  if (!payload) return { ok: false as const, status: 401, body: { ok: false, code: "UNAUTHORIZED", msg: "Invalid token" } };

  const { data: sess, error: sessErr } = await sb.schema("rent").from("sessions")
    .select("id,account_id,expires_at,revoked_at")
    .eq("id", payload.sid)
    .single();

  if (sessErr || !sess) return { ok: false as const, status: 401, body: { ok: false, code: "UNAUTHORIZED", msg: "Session not found" } };
  if (sess.revoked_at) return { ok: false as const, status: 401, body: { ok: false, code: "UNAUTHORIZED", msg: "Session revoked" } };
  if (new Date(sess.expires_at).getTime() <= Date.now()) {
    return { ok: false as const, status: 401, body: { ok: false, code: "UNAUTHORIZED", msg: "Session expired" } };
  }

  const { data: acc, error: accErr } = await sb.schema("rent").from("accounts")
    .select("id,username,activated_at,expires_at,max_devices,is_disabled,created_at,hmac_secret,hmac_view_password_hash,hmac_view_failed_attempts,hmac_view_locked_until")
    .eq("id", sess.account_id)
    .single();

  if (accErr || !acc) return { ok: false as const, status: 401, body: { ok: false, code: "UNAUTHORIZED", msg: "Account not found" } };
  return { ok: true as const, token, payload, session: sess, account: acc };
}

function requireRentMasterSecret(req: Request, publicBaseUrl: string) {
  const secret = Deno.env.get("RENT_MASTER_HMAC_SECRET") ?? "";
  if (!secret) {
    return json(req, publicBaseUrl, {
      ok: false,
      code: "SERVER_MISCONFIG_MISSING_RENT_MASTER_HMAC_SECRET",
      msg: "Missing RENT_MASTER_HMAC_SECRET",
    }, 503);
  }
  return secret;
}

async function logKeyEvent(sb: any, payload: {
  account_id?: string | null;
  key_id?: string | null;
  action: string;
  result?: string | null;
  device_id?: string | null;
  detail?: Record<string, unknown> | null;
}) {
  try {
    await sb.schema("rent").from("key_audit_logs").insert({
      account_id: payload.account_id ?? null,
      key_id: payload.key_id ?? null,
      action: payload.action,
      result: payload.result ?? null,
      device_id: payload.device_id ?? null,
      detail: payload.detail ?? {},
    });
  } catch {
    // audit must never break main flow
  }
}

function normalizeDurationInput(valueRaw: unknown, unitRaw: unknown) {
  const unit = String(unitRaw ?? "day") === "hour" ? "hour" : "day";
  const value = Math.max(1, Math.min(999999, Number.parseInt(String(valueRaw ?? "0"), 10) || 1));
  const durationMs = unit === "hour" ? value * 3600 * 1000 : value * 86400 * 1000;
  const expiresAtFromNow = new Date(Date.now() + durationMs).toISOString();
  return {
    duration_value: value,
    duration_unit: unit,
    duration_days: unit === "day" ? value : null,
    duration_seconds: unit === "hour" && value <= 596523 ? value * 3600 : null,
    duration_ms: durationMs,
    expires_at_from_now: expiresAtFromNow,
  };
}

Deno.serve(async (req) => {
  const publicBaseUrl = Deno.env.get("PUBLIC_BASE_URL") ?? inferBaseUrl(req);
  if (req.method === "OPTIONS") return handleOptions(req, publicBaseUrl, "POST,OPTIONS");

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !serviceRole) {
    return json(req, publicBaseUrl, { ok: false, code: "SERVER_MISCONFIG_MISSING_SECRET", msg: "Missing backend secrets" }, 503);
  }

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const action = String(body?.action ?? "").trim();

  try {
    if (action === "login") {
      const Schema = z.object({
        action: z.literal("login"),
        username: z.string().min(3).max(64),
        password: z.string().min(6).max(256),
      });
      const parsed = Schema.parse(body);
      const username = parsed.username.trim().toLowerCase();

      const { data: acc, error: accErr } = await sb.schema("rent").from("accounts")
        .select("id,username,password_hash,is_disabled")
        .eq("username", username)
        .single();

      if (accErr || !acc) return json(req, publicBaseUrl, { ok: false, code: "LOGIN_FAILED", msg: "Sai tài khoản hoặc mật khẩu" }, 401);
      if (acc.is_disabled) return json(req, publicBaseUrl, { ok: false, code: "ACCOUNT_DISABLED", msg: "Tài khoản bị khóa" }, 403);

      const ok = await verifyPassword(parsed.password, acc.password_hash);
      if (!ok) return json(req, publicBaseUrl, { ok: false, code: "LOGIN_FAILED", msg: "Sai tài khoản hoặc mật khẩu" }, 401);

      const secret = Deno.env.get("RENT_JWT_SECRET") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (!secret) return json(req, publicBaseUrl, { ok: false, code: "SERVER_MISCONFIG_MISSING_SECRET", msg: "Missing RENT_JWT_SECRET" }, 503);

      const sid = crypto.randomUUID();
      const nowSec = Math.floor(Date.now() / 1000);
      const expSec = nowSec + 30 * 24 * 60 * 60;
      const token = await signJwt({ sid, sub: acc.id, iat: nowSec, exp: expSec }, secret);

      const expires_at = new Date(expSec * 1000).toISOString();
      const { error: sErr } = await sb.schema("rent").from("sessions").insert({
        id: sid,
        account_id: acc.id,
        expires_at,
      });
      if (sErr) throw new Error(sErr.message);

      return json(req, publicBaseUrl, { ok: true, token });
    }

    if (action === "reset_password") {
      const Schema = z.object({
        action: z.literal("reset_password"),
        username: z.string().min(3).max(64),
        code: z.string().min(4).max(128),
        new_password: z.string().min(6).max(256),
      });
      const parsed = Schema.parse(body);
      const username = parsed.username.trim().toLowerCase();

      const { data: acc, error: accErr } = await sb.schema("rent").from("accounts")
        .select("id")
        .eq("username", username)
        .single();

      if (accErr || !acc) return json(req, publicBaseUrl, { ok: false, code: "RESET_FAILED", msg: "Không tìm thấy user" }, 404);

      const code_hash = await sha256Hex(parsed.code.trim());
      const { data: rc, error: rcErr } = await sb.schema("rent").from("reset_codes")
        .select("id,expires_at,used_at")
        .eq("account_id", acc.id)
        .eq("code_hash", code_hash)
        .is("used_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (rcErr || !rc) return json(req, publicBaseUrl, { ok: false, code: "RESET_FAILED", msg: "Code sai hoặc đã dùng" }, 400);
      if (new Date(rc.expires_at).getTime() <= Date.now()) return json(req, publicBaseUrl, { ok: false, code: "RESET_FAILED", msg: "Code đã hết hạn" }, 400);

      const password_hash = await hashPassword(parsed.new_password);
      const { error: uErr } = await sb.schema("rent").from("accounts").update({ password_hash }).eq("id", acc.id);
      if (uErr) throw new Error(uErr.message);

      const { error: markErr } = await sb.schema("rent").from("reset_codes").update({ used_at: new Date().toISOString() }).eq("id", rc.id);
      if (markErr) throw new Error(markErr.message);

      return json(req, publicBaseUrl, { ok: true });
    }

    const sess = await requireSession(sb, req);
    if (!sess.ok) return json(req, publicBaseUrl, sess.body, sess.status);

    if (action === "me") {
      return json(req, publicBaseUrl, {
        ok: true,
        account: {
          id: sess.account.id,
          username: sess.account.username,
          created_at: sess.account.created_at,
          activated_at: sess.account.activated_at,
          expires_at: sess.account.expires_at,
          max_devices: sess.account.max_devices,
          is_disabled: sess.account.is_disabled,
          hmac_secret: null,
          has_hmac_view_password: !!sess.account.hmac_view_password_hash,
          hmac_view_locked_until: sess.account.hmac_view_locked_until,
        },
      });
    }

    if (action === "logout") {
      await sb.schema("rent").from("sessions").update({ revoked_at: new Date().toISOString() }).eq("id", sess.payload.sid);
      return json(req, publicBaseUrl, { ok: true });
    }

    if (action === "activate") {
      const Schema = z.object({
        action: z.literal("activate"),
        code: z.string().min(8).max(64),
      });
      const parsed = Schema.parse(body);
      const code = parsed.code.trim().toUpperCase();
      const masterSecret = requireRentMasterSecret(req, publicBaseUrl);
      if (typeof masterSecret !== "string") return masterSecret;

      const { data: ak, error: akErr } = await sb.schema("rent").from("activation_keys")
        .select("id,code,duration_seconds,duration_days,claimed_by,claimed_at,revoked_at,target_account_id,server_tag")
        .eq("code", code)
        .maybeSingle();

      if (akErr || !ak) return json(req, publicBaseUrl, { ok: false, code: "INVALID_CODE", msg: "Key kích hoạt không tồn tại" }, 404);
      if (ak.revoked_at) return json(req, publicBaseUrl, { ok: false, code: "INVALID_CODE", msg: "Key kích hoạt đã bị thu hồi" }, 400);
      if (ak.claimed_by) return json(req, publicBaseUrl, { ok: false, code: "INVALID_CODE", msg: "Key kích hoạt đã được dùng" }, 400);
      if (ak.target_account_id && ak.target_account_id !== sess.account.id) {
        return json(req, publicBaseUrl, { ok: false, code: "CODE_NOT_FOR_THIS_USER", msg: "Key kích hoạt không thuộc tài khoản này" }, 403);
      }

      const expectedTag = await hmacSha256Hex(masterSecret, `activation|${sess.account.id}|${code}`);
      if (ak.server_tag && ak.server_tag !== expectedTag) {
        return json(req, publicBaseUrl, { ok: false, code: "INVALID_CODE", msg: "Key kích hoạt không hợp lệ" }, 400);
      }

      const now = Date.now();
      const currentExp = sess.account.expires_at ? new Date(sess.account.expires_at).getTime() : 0;
      const base = currentExp > now ? currentExp : now;
      const durationMs = ak.duration_days != null ? Number(ak.duration_days) * 86400 * 1000 : Number(ak.duration_seconds ?? 0) * 1000;
      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return json(req, publicBaseUrl, { ok: false, code: "INVALID_CODE", msg: "Thời hạn key kích hoạt không hợp lệ" }, 400);
      }
      const nextExp = new Date(base + durationMs).toISOString();
      const activated_at = sess.account.activated_at ?? new Date().toISOString();

      const { error: accErr } = await sb.schema("rent").from("accounts").update({
        expires_at: nextExp,
        activated_at,
      }).eq("id", sess.account.id);
      if (accErr) throw new Error(accErr.message);

      const { error: claimErr } = await sb.schema("rent").from("activation_keys").update({
        claimed_by: sess.account.id,
        claimed_at: new Date().toISOString(),
      }).eq("id", ak.id);
      if (claimErr) throw new Error(claimErr.message);

      return json(req, publicBaseUrl, { ok: true, expires_at: nextExp, activated_at });
    }

    const active = !!sess.account.expires_at && new Date(sess.account.expires_at).getTime() > Date.now() && !sess.account.is_disabled;
    if (!active) return json(req, publicBaseUrl, { ok: false, code: "SUBSCRIPTION_REQUIRED", msg: "Chưa kích hoạt hoặc đã hết hạn" }, 403);

    if (action === "list_keys") {
      const { data, error } = await sb.schema("rent").from("keys")
        .select("id,key,created_at,expires_at,is_active,note,starts_on_first_use,duration_days,duration_value,duration_unit,first_used_at")
        .eq("account_id", sess.account.id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return json(req, publicBaseUrl, { ok: true, keys: data ?? [] });
    }

    if (action === "list_key_devices") {
      const Schema = z.object({
        action: z.literal("list_key_devices"),
        key_id: z.string().uuid(),
      });
      const parsed = Schema.parse(body);

      const { data: ownedKey, error: ownErr } = await sb.schema("rent").from("keys")
        .select("id")
        .eq("id", parsed.key_id)
        .eq("account_id", sess.account.id)
        .maybeSingle();
      if (ownErr) throw new Error(ownErr.message);
      if (!ownedKey) return json(req, publicBaseUrl, { ok: false, code: "KEY_NOT_FOUND", msg: "Không tìm thấy key" }, 404);

      const { data, error } = await sb.schema("rent").from("key_devices")
        .select("id,device_id,first_seen,last_seen")
        .eq("key_id", parsed.key_id)
        .order("last_seen", { ascending: false });
      if (error) throw new Error(error.message);
      return json(req, publicBaseUrl, { ok: true, devices: data ?? [] });
    }

    if (action === "list_key_logs") {
      const Schema = z.object({
        action: z.literal("list_key_logs"),
        key_id: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      });
      const parsed = Schema.parse(body);
      const limit = Math.max(1, Math.min(100, Number(parsed.limit ?? 30)));

      let keyId: string | null = null;
      if (parsed.key_id) {
        const { data: ownedKey, error: ownErr } = await sb.schema("rent").from("keys")
          .select("id")
          .eq("id", parsed.key_id)
          .eq("account_id", sess.account.id)
          .maybeSingle();
        if (ownErr) throw new Error(ownErr.message);
        if (!ownedKey) return json(req, publicBaseUrl, { ok: false, code: "KEY_NOT_FOUND", msg: "Không tìm thấy key" }, 404);
        keyId = ownedKey.id;
      }

      let query = sb.schema("rent").from("key_audit_logs")
        .select("id,key_id,action,result,device_id,detail,created_at")
        .eq("account_id", sess.account.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (keyId) query = query.eq("key_id", keyId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return json(req, publicBaseUrl, { ok: true, logs: data ?? [] });
    }

    if (action === "generate_key") {
      const Schema = z.object({
        action: z.literal("generate_key"),
        note: z.string().max(2000).nullable().optional(),
        duration_value: z.number().int().min(1).max(999999).default(30),
        duration_unit: z.enum(["hour", "day"]).default("day"),
        start_mode: z.enum(["immediate", "first_use"]).default("immediate"),
      });
      const parsed = Schema.parse(body);
      const masterSecret = requireRentMasterSecret(req, publicBaseUrl);
      if (typeof masterSecret !== "string") return masterSecret;

      let key = "";
      for (let i = 0; i < 30; i++) {
        const candidate = randomRentKey();
        const { data: exists, error: existsErr } = await sb.schema("rent").from("keys").select("id").eq("key", candidate).maybeSingle();
        if (existsErr) throw existsErr;
        if (!exists) {
          key = candidate;
          break;
        }
      }
      if (!key) throw new Error("FAILED_TO_GENERATE_UNIQUE_KEY");

      const duration = normalizeDurationInput(parsed.duration_value, parsed.duration_unit);
      const starts_on_first_use = parsed.start_mode === "first_use";
      const expires_at = starts_on_first_use ? null : duration.expires_at_from_now;
      const server_tag = await hmacSha256Hex(masterSecret, `rent-key|${key}`);
      const { data, error } = await sb.schema("rent").from("keys").insert({
        account_id: sess.account.id,
        key,
        note: parsed.note ?? null,
        server_tag,
        duration_days: duration.duration_days,
        duration_seconds: duration.duration_seconds,
        duration_value: duration.duration_value,
        duration_unit: duration.duration_unit,
        starts_on_first_use,
        first_used_at: null,
        expires_at,
      }).select("id,key,created_at,expires_at,is_active,note,starts_on_first_use,duration_days,duration_value,duration_unit,first_used_at").single();

      if (error) throw new Error(error.message);
      await logKeyEvent(sb, {
        account_id: sess.account.id,
        key_id: data?.id ?? null,
        action: "create_key_random",
        result: "ok",
        detail: { note: parsed.note ?? null, duration_value: duration.duration_value, duration_unit: duration.duration_unit, start_mode: parsed.start_mode },
      });
      return json(req, publicBaseUrl, { ok: true, key: data });
    }

    if (action === "create_key") {
      const Schema = z.object({
        action: z.literal("create_key"),
        key: z.string().min(8).max(64),
        note: z.string().max(2000).nullable().optional(),
        duration_value: z.number().int().min(1).max(999999).default(30),
        duration_unit: z.enum(["hour", "day"]).default("day"),
        start_mode: z.enum(["immediate", "first_use"]).default("immediate"),
      });
      const parsed = Schema.parse(body);
      const key = parsed.key.trim().toUpperCase();
      if (!isValidRentKeyFormat(key)) {
        return json(req, publicBaseUrl, { ok: false, code: "INVALID_KEY_FORMAT", msg: "Key phải dạng XXXX-XXXX-XXXX-XXXX" }, 400);
      }
      const masterSecret = requireRentMasterSecret(req, publicBaseUrl);
      if (typeof masterSecret !== "string") return masterSecret;

      const duration = normalizeDurationInput(parsed.duration_value, parsed.duration_unit);
      const starts_on_first_use = parsed.start_mode === "first_use";
      const expires_at = starts_on_first_use ? null : duration.expires_at_from_now;
      const server_tag = await hmacSha256Hex(masterSecret, `rent-key|${key}`);
      const { data, error } = await sb.schema("rent").from("keys").insert({
        account_id: sess.account.id,
        key,
        note: parsed.note ?? null,
        server_tag,
        duration_days: duration.duration_days,
        duration_seconds: duration.duration_seconds,
        duration_value: duration.duration_value,
        duration_unit: duration.duration_unit,
        starts_on_first_use,
        first_used_at: null,
        expires_at,
      }).select("id,key,created_at,expires_at,is_active,note,starts_on_first_use,duration_days,duration_value,duration_unit,first_used_at").single();

      if (error) {
        const msg = error.message || "insert failed";
        if (msg.toLowerCase().includes("duplicate")) return json(req, publicBaseUrl, { ok: false, code: "DUPLICATE", msg: "Key bị trùng" }, 409);
        throw new Error(msg);
      }

      await logKeyEvent(sb, {
        account_id: sess.account.id,
        key_id: data?.id ?? null,
        action: "create_key_custom",
        result: "ok",
        detail: { note: parsed.note ?? null, duration_value: duration.duration_value, duration_unit: duration.duration_unit, start_mode: parsed.start_mode },
      });
      return json(req, publicBaseUrl, { ok: true, key: data });
    }

    if (action === "update_key") {
      const Schema = z.object({
        action: z.literal("update_key"),
        key_id: z.string().uuid(),
        note: z.string().max(2000).nullable().optional(),
        duration_value: z.number().int().min(1).max(999999),
        duration_unit: z.enum(["hour", "day"]),
        start_mode: z.enum(["immediate", "first_use"]),
      });
      const parsed = Schema.parse(body);

      const { data: ownedKey, error: ownErr } = await sb.schema("rent").from("keys")
        .select("id,key,created_at,first_used_at")
        .eq("id", parsed.key_id)
        .eq("account_id", sess.account.id)
        .maybeSingle();
      if (ownErr) throw new Error(ownErr.message);
      if (!ownedKey) return json(req, publicBaseUrl, { ok: false, code: "KEY_NOT_FOUND", msg: "Không tìm thấy key" }, 404);

      const duration = normalizeDurationInput(parsed.duration_value, parsed.duration_unit);
      const anchorIso = parsed.start_mode === "first_use"
        ? (ownedKey.first_used_at ? ownedKey.first_used_at : null)
        : ownedKey.created_at;
      const expires_at = anchorIso
        ? new Date(new Date(anchorIso).getTime() + duration.duration_ms).toISOString()
        : null;

      const patch = {
        note: parsed.note ?? null,
        duration_days: duration.duration_days,
        duration_seconds: duration.duration_seconds,
        duration_value: duration.duration_value,
        duration_unit: duration.duration_unit,
        starts_on_first_use: parsed.start_mode === "first_use",
        expires_at,
      } as const;

      const { data, error } = await sb.schema("rent").from("keys")
        .update(patch)
        .eq("id", parsed.key_id)
        .eq("account_id", sess.account.id)
        .select("id,key,created_at,expires_at,is_active,note,starts_on_first_use,duration_days,duration_value,duration_unit,first_used_at")
        .single();
      if (error) throw new Error(error.message);

      await logKeyEvent(sb, {
        account_id: sess.account.id,
        key_id: data?.id ?? null,
        action: "update_key_config",
        result: "ok",
        detail: { duration_value: duration.duration_value, duration_unit: duration.duration_unit, start_mode: parsed.start_mode, note: parsed.note ?? null },
      });
      return json(req, publicBaseUrl, { ok: true, key: data });
    }

    if (action === "toggle_key") {
      const Schema = z.object({
        action: z.literal("toggle_key"),
        key_id: z.string().uuid(),
        is_active: z.boolean(),
      });
      const parsed = Schema.parse(body);

      const { data, error } = await sb.schema("rent").from("keys")
        .update({ is_active: parsed.is_active })
        .eq("id", parsed.key_id)
        .eq("account_id", sess.account.id)
        .select("id,key,created_at,expires_at,is_active,note,starts_on_first_use,duration_days,duration_value,duration_unit,first_used_at")
        .single();

      if (error) throw new Error(error.message);
      await logKeyEvent(sb, {
        account_id: sess.account.id,
        key_id: data?.id ?? null,
        action: parsed.is_active ? "enable_key" : "disable_key",
        result: "ok",
      });
      return json(req, publicBaseUrl, { ok: true, key: data });
    }

    if (action === "delete_key") {
      const Schema = z.object({
        action: z.literal("delete_key"),
        key_id: z.string().uuid(),
      });
      const parsed = Schema.parse(body);

      const { data: ownedKey, error: ownErr } = await sb.schema("rent").from("keys")
        .select("id,key")
        .eq("id", parsed.key_id)
        .eq("account_id", sess.account.id)
        .maybeSingle();
      if (ownErr) throw new Error(ownErr.message);
      if (!ownedKey) return json(req, publicBaseUrl, { ok: false, code: "KEY_NOT_FOUND", msg: "Không tìm thấy key" }, 404);

      const { error } = await sb.schema("rent").from("keys").delete().eq("id", parsed.key_id).eq("account_id", sess.account.id);
      if (error) throw new Error(error.message);
      await logKeyEvent(sb, {
        account_id: sess.account.id,
        key_id: ownedKey.id,
        action: "delete_key",
        result: "ok",
        detail: { key: ownedKey.key },
      });
      return json(req, publicBaseUrl, { ok: true });
    }

    if (action === "set_hmac_view_password") {
      const Schema = z.object({
        action: z.literal("set_hmac_view_password"),
        password: z.string().min(4).max(128),
      });
      const parsed = Schema.parse(body);
      const password = parsed.password.trim();
      if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        return json(req, publicBaseUrl, { ok: false, code: "INVALID_PASSWORD", msg: "Mật khẩu phải có cả chữ và số" }, 400);
      }
      if (sess.account.hmac_view_password_hash) {
        return json(req, publicBaseUrl, { ok: false, code: "ALREADY_SET", msg: "Mật khẩu xem HMAC đã được đặt trước đó" }, 409);
      }
      const password_hash = await hashPassword(password);
      const { error } = await sb.schema("rent").from("accounts").update({
        hmac_view_password_hash: password_hash,
        hmac_view_failed_attempts: 0,
        hmac_view_locked_until: null,
      }).eq("id", sess.account.id);
      if (error) throw new Error(error.message);
      await logKeyEvent(sb, { account_id: sess.account.id, action: "set_hmac_view_password", result: "ok" });
      return json(req, publicBaseUrl, { ok: true, hmac_secret: sess.account.hmac_secret });
    }

    if (action === "unlock_hmac_view_password") {
      const Schema = z.object({
        action: z.literal("unlock_hmac_view_password"),
        password: z.string().min(1).max(128),
      });
      const parsed = Schema.parse(body);
      const lockedUntil = sess.account.hmac_view_locked_until ? new Date(sess.account.hmac_view_locked_until).getTime() : 0;
      if (lockedUntil > Date.now()) {
        const remaining_seconds = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000));
        return json(req, publicBaseUrl, { ok: false, code: "LOCKED", msg: `Đang bị khóa tạm. Thử lại sau ${remaining_seconds} giây`, remaining_seconds }, 429);
      }
      if (!sess.account.hmac_view_password_hash) {
        return json(req, publicBaseUrl, { ok: false, code: "PASSWORD_NOT_SET", msg: "Bạn chưa đặt mật khẩu xem HMAC" }, 400);
      }
      const ok = await verifyPassword(parsed.password.trim(), sess.account.hmac_view_password_hash);
      if (!ok) {
        const failed = Number(sess.account.hmac_view_failed_attempts ?? 0) + 1;
        const locked_until = failed >= 5 ? new Date(Date.now() + 60 * 1000).toISOString() : null;
        const nextFailed = failed >= 5 ? 0 : failed;
        await sb.schema("rent").from("accounts").update({
          hmac_view_failed_attempts: nextFailed,
          hmac_view_locked_until: locked_until,
        }).eq("id", sess.account.id);
        await logKeyEvent(sb, { account_id: sess.account.id, action: "unlock_hmac_view_password_failed", result: "BAD_PASSWORD" });
        return json(req, publicBaseUrl, { ok: false, code: "BAD_PASSWORD", msg: locked_until ? "Sai mật khẩu quá nhiều lần. Tạm khóa 1 phút" : "Sai mật khẩu" }, 401);
      }
      await sb.schema("rent").from("accounts").update({
        hmac_view_failed_attempts: 0,
        hmac_view_locked_until: null,
      }).eq("id", sess.account.id);
      await logKeyEvent(sb, { account_id: sess.account.id, action: "unlock_hmac_view_password_success", result: "ok" });
      return json(req, publicBaseUrl, { ok: true, hmac_secret: sess.account.hmac_secret });
    }

    if (action === "log_copy_hmac_secret") {
      z.object({ action: z.literal("log_copy_hmac_secret") }).parse(body);
      await logKeyEvent(sb, { account_id: sess.account.id, action: "copy_hmac_secret", result: "ok" });
      return json(req, publicBaseUrl, { ok: true });
    }

    if (action === "list_downloads") {
      z.object({ action: z.literal("list_downloads") }).parse(body);
      const { data, error } = await sb.schema("rent").from("download_links").select("id,title,url,note,enabled,created_at").eq("enabled", true).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return json(req, publicBaseUrl, { ok: true, items: data ?? [] });
    }

    return json(req, publicBaseUrl, { ok: false, code: "BAD_ACTION", msg: "Unknown action" }, 400);
  } catch (e: any) {
    return json(req, publicBaseUrl, { ok: false, code: "ERROR", msg: String(e?.message ?? e) }, 400);
  }
});
