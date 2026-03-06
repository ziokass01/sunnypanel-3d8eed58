import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { assertAdmin } from "../_shared/admin.ts";
import { buildCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { hashPassword, hmacSha256Hex, randomBase64url, sha256Hex } from "../_shared/rent.ts";

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

function randomChunk(len = 4) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function makeActivationCode() {
  return `${randomChunk(4)}-${randomChunk(4)}-${randomChunk(4)}-${randomChunk(4)}`;
}

function normalizeActivationCode(s: string) {
  return s.trim().toUpperCase();
}

function isValidActivationCodeFormat(s: string) {
  return /^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$/.test(s);
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

Deno.serve(async (req) => {
  const publicBaseUrl = Deno.env.get("PUBLIC_BASE_URL") ?? inferBaseUrl(req);
  if (req.method === "OPTIONS") return handleOptions(req, publicBaseUrl, "POST,OPTIONS");

  const admin = await assertAdmin(req);
  if (!admin.ok) return json(req, publicBaseUrl, admin.body, admin.status);

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
    if (action === "list_users") {
      const { data, error } = await sb
        .schema("rent")
        .from("accounts")
        .select("id,username,created_at,activated_at,expires_at,max_devices,is_disabled,hmac_secret,note")
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);
      return json(req, publicBaseUrl, { ok: true, users: data ?? [] });
    }

    if (action === "update_user") {
      const Schema = z.object({
        action: z.literal("update_user"),
        account_id: z.string().uuid(),
        max_devices: z.number().int().min(1).max(20).optional(),
        is_disabled: z.boolean().optional(),
        note: z.string().max(2000).nullable().optional(),
      });
      const parsed = Schema.parse(body);

      const patch: Record<string, unknown> = {};
      if (typeof parsed.max_devices === "number") patch.max_devices = parsed.max_devices;
      if (typeof parsed.is_disabled === "boolean") patch.is_disabled = parsed.is_disabled;
      if (Object.prototype.hasOwnProperty.call(parsed, "note")) patch.note = parsed.note ?? null;

      const { data, error } = await sb
        .schema("rent")
        .from("accounts")
        .update(patch)
        .eq("id", parsed.account_id)
        .select("id,username,created_at,activated_at,expires_at,max_devices,is_disabled,hmac_secret,note")
        .single();

      if (error) throw new Error(error.message);
      return json(req, publicBaseUrl, { ok: true, user: data });
    }

    if (action === "list_activation_keys") {
      const Schema = z.object({
        action: z.literal("list_activation_keys"),
        account_id: z.string().uuid().nullable().optional(),
        limit: z.number().int().min(1).max(200).default(30),
      });
      const parsed = Schema.parse(body);

      let query = sb
        .schema("rent")
        .from("activation_keys")
        .select("id,code,duration_seconds,duration_days,created_at,claimed_by,claimed_at,revoked_at,note,target_account_id")
        .order("created_at", { ascending: false })
        .limit(parsed.limit);

      if (parsed.account_id) {
        query = query.eq("target_account_id", parsed.account_id);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return json(req, publicBaseUrl, { ok: true, keys: data ?? [] });
    }

    if (action === "delete_activation_key") {
      const Schema = z.object({
        action: z.literal("delete_activation_key"),
        key_id: z.string().uuid(),
      });
      const parsed = Schema.parse(body);

      const { data: keyRow, error: keyErr } = await sb
        .schema("rent")
        .from("activation_keys")
        .select("id,claimed_at,revoked_at")
        .eq("id", parsed.key_id)
        .maybeSingle();
      if (keyErr) throw keyErr;
      if (!keyRow) throw new Error("KEY_NOT_FOUND");
      if (keyRow.claimed_at || keyRow.revoked_at) throw new Error("KEY_NOT_UNUSED");

      const { error: delErr } = await sb.schema("rent").from("activation_keys").delete().eq("id", parsed.key_id);
      if (delErr) throw delErr;
      return json(req, publicBaseUrl, { ok: true });
    }

    if (action === "list_reset_codes") {
      const Schema = z.object({
        action: z.literal("list_reset_codes"),
        account_id: z.string().uuid(),
        limit: z.number().int().min(1).max(200).default(20),
      });
      const parsed = Schema.parse(body);

      const { data, error } = await sb
        .schema("rent")
        .from("reset_codes")
        .select("id,created_at,expires_at,used_at")
        .eq("account_id", parsed.account_id)
        .order("created_at", { ascending: false })
        .limit(parsed.limit);

      if (error) throw new Error(error.message);
      return json(req, publicBaseUrl, { ok: true, rows: data ?? [] });
    }

    if (action === "create_user") {
      const Schema = z.object({
        action: z.literal("create_user"),
        username: z.string().min(3).max(64),
        password: z.string().min(6).max(256),
        hmac_secret: z.string().min(8).max(256).nullable().optional(),
        max_devices: z.number().int().min(1).max(20).default(1),
        note: z.string().max(2000).nullable().optional(),
      });
      const parsed = Schema.parse(body);

      const username = parsed.username.trim().toLowerCase();
      if (!/^[a-z0-9._-]+$/.test(username)) {
        return json(req, publicBaseUrl, { ok: false, code: "INVALID_USERNAME", msg: "Username chỉ nên dùng a-z 0-9 . _ -" }, 400);
      }

      const password_hash = await hashPassword(parsed.password);
      let hmac = (parsed.hmac_secret ?? "").trim();
      let generated_hmac: string | undefined;

      if (hmac) {
        const { data: exists, error: existsErr } = await sb.schema("rent").from("accounts").select("id").eq("hmac_secret", hmac).maybeSingle();
        if (existsErr) throw existsErr;
        if (exists) {
          return json(req, publicBaseUrl, { ok: false, code: "DUPLICATE", msg: "HMAC bị trùng" }, 409);
        }
      } else {
        for (let i = 0; i < 20; i++) {
          const candidate = randomBase64url(32);
          const { data: exists, error: existsErr } = await sb.schema("rent").from("accounts").select("id").eq("hmac_secret", candidate).maybeSingle();
          if (existsErr) throw existsErr;
          if (!exists) {
            hmac = candidate;
            generated_hmac = candidate;
            break;
          }
        }
        if (!hmac) throw new Error("FAILED_TO_GENERATE_UNIQUE_HMAC");
      }

      const { data, error } = await sb
        .schema("rent")
        .from("accounts")
        .insert({
          username,
          password_hash,
          hmac_secret: hmac,
          max_devices: parsed.max_devices,
          note: parsed.note ?? null,
          activated_at: null,
        })
        .select("id,username,created_at,activated_at,expires_at,max_devices,is_disabled,hmac_secret,note")
        .single();

      if (error) {
        const msg = error.message || "insert failed";
        if (msg.toLowerCase().includes("duplicate")) {
          return json(req, publicBaseUrl, { ok: false, code: "DUPLICATE", msg: "Username hoặc HMAC bị trùng" }, 409);
        }
        throw new Error(msg);
      }

      return json(req, publicBaseUrl, { ok: true, user: data, generated_hmac });
    }

    if (action === "issue_activation") {
      const Schema = z.object({
        action: z.literal("issue_activation"),
        account_id: z.string().uuid(),
        days: z.number().int().min(1).max(999999),
        note: z.string().max(2000).nullable().optional(),
        custom_code: z.string().nullable().optional(),
      });
      const parsed = Schema.parse(body);
      const masterSecret = requireRentMasterSecret(req, publicBaseUrl);
      if (typeof masterSecret !== "string") return masterSecret;

      const duration_days = parsed.days;
      const duration_seconds = parsed.days <= 24855 ? parsed.days * 86400 : null;
      let code = "";
      const requested = parsed.custom_code ? normalizeActivationCode(parsed.custom_code) : "";

      if (requested) {
        if (!isValidActivationCodeFormat(requested)) {
          return json(req, publicBaseUrl, { ok: false, code: "INVALID_ACTIVATION_CODE", msg: "Activation key không đúng format XXXX-XXXX-XXXX-XXXX" }, 400);
        }
        const { data: exists, error: existsErr } = await sb.schema("rent").from("activation_keys").select("id").eq("code", requested).maybeSingle();
        if (existsErr) throw existsErr;
        if (exists) {
          return json(req, publicBaseUrl, { ok: false, code: "DUPLICATE", msg: "Activation key bị trùng" }, 409);
        }
        code = requested;
      } else {
        for (let i = 0; i < 20; i++) {
          const candidate = makeActivationCode();
          const { data: exists, error: existsErr } = await sb.schema("rent").from("activation_keys").select("id").eq("code", candidate).maybeSingle();
          if (existsErr) throw existsErr;
          if (!exists) {
            code = candidate;
            break;
          }
        }
        if (!code) throw new Error("FAILED_TO_GENERATE_UNIQUE_ACTIVATION_CODE");
      }

      const server_tag = await hmacSha256Hex(masterSecret, `activation|${parsed.account_id}|${code}`);

      const { error } = await sb.schema("rent").from("activation_keys").insert({
        code,
        duration_seconds,
        duration_days,
        created_by: null,
        note: parsed.note ?? null,
        target_account_id: parsed.account_id,
        server_tag,
      });

      if (error) throw new Error(error.message);
      return json(req, publicBaseUrl, { ok: true, code, duration_seconds, duration_days });
    }

    if (action === "create_reset_code") {
      const Schema = z.object({
        action: z.literal("create_reset_code"),
        account_id: z.string().uuid(),
        minutes: z.number().int().min(5).max(1440).default(30),
      });
      const parsed = Schema.parse(body);

      const code = `RC-${randomChunk(4)}-${randomChunk(4)}-${randomChunk(4)}`;
      const expires_at = new Date(Date.now() + parsed.minutes * 60 * 1000).toISOString();
      const code_hash = await sha256Hex(code);

      const { error } = await sb.schema("rent").from("reset_codes").insert({
        account_id: parsed.account_id,
        code_hash,
        expires_at,
        created_by: null,
      });

      if (error) throw new Error(error.message);
      return json(req, publicBaseUrl, { ok: true, code, expires_at });
    }

    if (action === "reset_password_default") {
      const Schema = z.object({
        action: z.literal("reset_password_default"),
        account_id: z.string().uuid(),
      });
      const parsed = Schema.parse(body);

      const default_password = Deno.env.get("RENT_DEFAULT_PASSWORD") ?? "12345678";
      const password_hash = await hashPassword(default_password);
      const { error } = await sb.schema("rent").from("accounts").update({ password_hash }).eq("id", parsed.account_id);
      if (error) throw new Error(error.message);
      return json(req, publicBaseUrl, { ok: true, default_password });
    }

    if (action === "rotate_hmac") {
      const Schema = z.object({
        action: z.literal("rotate_hmac"),
        account_id: z.string().uuid(),
        new_hmac: z.string().nullable().optional(),
      });
      const parsed = Schema.parse(body);

      const { data: acc, error: accErr } = await sb.schema("rent").from("accounts")
        .select("id,expires_at")
        .eq("id", parsed.account_id)
        .single();
      if (accErr || !acc) throw new Error(accErr?.message ?? "ACCOUNT_NOT_FOUND");

      let new_hmac_secret = (parsed.new_hmac ?? "").trim();
      if (new_hmac_secret) {
        if (new_hmac_secret.length < 8 || new_hmac_secret.length > 256) {
          return json(req, publicBaseUrl, { ok: false, code: "INVALID_HMAC", msg: "HMAC secret phải 8-256 ký tự" }, 400);
        }
        const { data: exists, error: existsErr } = await sb.schema("rent").from("accounts").select("id").eq("hmac_secret", new_hmac_secret).neq("id", parsed.account_id).maybeSingle();
        if (existsErr) throw existsErr;
        if (exists) {
          return json(req, publicBaseUrl, { ok: false, code: "DUPLICATE", msg: "HMAC bị trùng" }, 409);
        }
      } else {
        for (let i = 0; i < 20; i++) {
          const candidate = randomBase64url(32);
          const { data: exists, error: existsErr } = await sb.schema("rent").from("accounts").select("id").eq("hmac_secret", candidate).maybeSingle();
          if (existsErr) throw existsErr;
          if (!exists) {
            new_hmac_secret = candidate;
            break;
          }
        }
        if (!new_hmac_secret) throw new Error("FAILED_TO_GENERATE_UNIQUE_HMAC");
      }

      const now = Date.now();
      let new_expires_at: string | null = acc.expires_at ?? null;
      let penalized = false;

      if (acc.expires_at) {
        const expMs = new Date(acc.expires_at).getTime();
        if (expMs > now) {
          const remaining = expMs - now;
          const reduced = Math.floor(remaining * 0.8);
          new_expires_at = new Date(now + reduced).toISOString();
          penalized = true;
        }
      }

      const { error } = await sb.schema("rent").from("accounts")
        .update({ hmac_secret: new_hmac_secret, expires_at: new_expires_at })
        .eq("id", parsed.account_id);

      if (error) throw new Error(error.message);
      return json(req, publicBaseUrl, { ok: true, new_hmac_secret, new_expires_at, penalized });
    }

    if (action === "delete_user") {
      const Schema = z.object({
        action: z.literal("delete_user"),
        account_id: z.string().uuid(),
      });
      const parsed = Schema.parse(body);

      const { error } = await sb.schema("rent").from("accounts").delete().eq("id", parsed.account_id);
      if (error) throw new Error(error.message);
      return json(req, publicBaseUrl, { ok: true });
    }

    if (action === "list_downloads") {
      z.object({ action: z.literal("list_downloads") }).parse(body);
      const { data, error } = await sb.schema("rent").from("download_links").select("id,title,url,note,enabled,created_at").order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return json(req, publicBaseUrl, { ok: true, items: data ?? [] });
    }

    if (action === "create_download") {
      const Schema = z.object({
        action: z.literal("create_download"),
        title: z.string().min(1).max(200),
        url: z.string().min(1).max(4000),
        note: z.string().max(2000).nullable().optional(),
        enabled: z.boolean().optional(),
      });
      const parsed = Schema.parse(body);

      const { data, error } = await sb
        .schema("rent")
        .from("download_links")
        .insert({ title: parsed.title.trim(), url: parsed.url.trim(), note: parsed.note ?? null, enabled: parsed.enabled ?? true })
        .select("id,title,url,note,enabled,created_at")
        .single();

      if (error) throw new Error(error.message);
      return json(req, publicBaseUrl, { ok: true, item: data });
    }

    if (action === "update_download") {
      const Schema = z.object({
        action: z.literal("update_download"),
        id: z.string().uuid(),
        title: z.string().min(1).max(200),
        url: z.string().min(1).max(4000),
        note: z.string().max(2000).nullable().optional(),
        enabled: z.boolean().optional(),
      });
      const parsed = Schema.parse(body);

      const patch: Record<string, unknown> = {
        title: parsed.title.trim(),
        url: parsed.url.trim(),
        note: parsed.note ?? null,
      };
      if (typeof parsed.enabled === "boolean") patch.enabled = parsed.enabled;

      const { data, error } = await sb
        .schema("rent")
        .from("download_links")
        .update(patch)
        .eq("id", parsed.id)
        .select("id,title,url,note,enabled,created_at")
        .single();

      if (error) throw new Error(error.message);
      return json(req, publicBaseUrl, { ok: true, item: data });
    }

    if (action === "toggle_download") {
      const Schema = z.object({
        action: z.literal("toggle_download"),
        id: z.string().uuid(),
        enabled: z.boolean(),
      });
      const parsed = Schema.parse(body);
      const { error } = await sb.schema("rent").from("download_links").update({ enabled: parsed.enabled }).eq("id", parsed.id);
      if (error) throw new Error(error.message);
      return json(req, publicBaseUrl, { ok: true });
    }

    if (action === "delete_download") {
      const Schema = z.object({
        action: z.literal("delete_download"),
        id: z.string().uuid(),
      });
      const parsed = Schema.parse(body);
      const { error } = await sb.schema("rent").from("download_links").delete().eq("id", parsed.id);
      if (error) throw new Error(error.message);
      return json(req, publicBaseUrl, { ok: true });
    }

    return json(req, publicBaseUrl, { ok: false, code: "BAD_ACTION", msg: "Unknown action" }, 400);
  } catch (e: any) {
    return json(req, publicBaseUrl, { ok: false, code: "ERROR", msg: String(e?.message ?? e) }, 400);
  }
});
