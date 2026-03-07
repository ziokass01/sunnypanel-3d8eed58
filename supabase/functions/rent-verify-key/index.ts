import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { buildCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { hmacSha256Hex, isValidRentKeyFormat } from "../_shared/rent.ts";

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
    // audit must never break verify flow
  }
}

Deno.serve(async (req) => {
  const publicBaseUrl = Deno.env.get("PUBLIC_BASE_URL") ?? inferBaseUrl(req);
  if (req.method === "OPTIONS") return handleOptions(req, publicBaseUrl, "POST,OPTIONS");

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const masterSecret = Deno.env.get("RENT_MASTER_HMAC_SECRET") ?? "";

  if (!supabaseUrl || !serviceRole) {
    return json(req, publicBaseUrl, { ok: false, code: "SERVER_MISCONFIG_MISSING_SECRET", msg: "Missing backend secrets" }, 503);
  }
  if (!masterSecret) {
    return json(req, publicBaseUrl, { ok: false, code: "SERVER_MISCONFIG_MISSING_RENT_MASTER_HMAC_SECRET", msg: "Missing RENT_MASTER_HMAC_SECRET" }, 503);
  }

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    const Schema = z.object({
      username: z.string().min(3).max(64),
      key: z.string().min(8).max(64),
      device_id: z.string().min(3).max(256),
      ts: z.union([z.number().int(), z.string()]),
      sig_user: z.string().min(16).max(256).optional(),
      sig: z.string().min(16).max(256).optional(),
    }).refine((value) => !!(value.sig_user || value.sig), { message: "Missing sig_user" });

    const parsed = Schema.parse(body);
    const username = parsed.username.trim().toLowerCase();
    const key = parsed.key.trim().toUpperCase();
    const device_id = parsed.device_id.trim();
    const ts = typeof parsed.ts === "string" ? parseInt(parsed.ts, 10) : parsed.ts;
    const sigUser = (parsed.sig_user ?? parsed.sig ?? "").trim().toLowerCase();

    const invalid = async (code: string, accountId?: string | null, keyId?: string | null, detail?: Record<string, unknown>) => {
      await logKeyEvent(sb, {
        account_id: accountId ?? null,
        key_id: keyId ?? null,
        action: "verify",
        result: code,
        device_id,
        detail: { username, key, ...detail },
      });
      return json(req, publicBaseUrl, { ok: true, valid: false, code }, 200);
    };

    if (!isValidRentKeyFormat(key)) {
      return await invalid("INVALID_KEY_FORMAT", null, null);
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > 5 * 60) {
      return await invalid("BAD_TIMESTAMP", null, null);
    }

    const { data: acc, error: accErr } = await sb.schema("rent").from("accounts")
      .select("id,username,expires_at,max_devices,is_disabled,hmac_secret")
      .eq("username", username)
      .single();

    if (accErr || !acc) return await invalid("NO_ACCOUNT", null, null);
    if (acc.is_disabled) return await invalid("ACCOUNT_DISABLED", acc.id, null);
    if (!acc.expires_at || new Date(acc.expires_at).getTime() <= Date.now()) {
      return await invalid("SUBSCRIPTION_EXPIRED", acc.id, null);
    }

    const { data: rk, error: keyErr } = await sb.schema("rent").from("keys")
      .select("id,account_id,created_at,expires_at,is_active,server_tag,master_sig,starts_on_first_use,duration_days,duration_value,duration_unit,first_used_at")
      .eq("key", key)
      .maybeSingle();

    if (keyErr || !rk || rk.account_id !== acc.id) return await invalid("KEY_NOT_FOUND", acc.id, null);
    if (!rk.is_active) return await invalid("KEY_DISABLED", acc.id, rk.id);
    if (rk.expires_at && new Date(rk.expires_at).getTime() <= Date.now()) return await invalid("KEY_EXPIRED", acc.id, rk.id);

    const expectedServerTag = await hmacSha256Hex(masterSecret, `rent-key|${key}`);
    const legacyTag = await hmacSha256Hex(masterSecret, key);
    if (rk.server_tag) {
      if (rk.server_tag !== expectedServerTag) {
        return await invalid("KEY_TAMPERED", acc.id, rk.id);
      }
    } else if (rk.master_sig) {
      if (rk.master_sig !== legacyTag) {
        return await invalid("KEY_TAMPERED", acc.id, rk.id, { legacy: true });
      }
      await sb.schema("rent").from("keys").update({ server_tag: expectedServerTag }).eq("id", rk.id);
    } else {
      await sb.schema("rent").from("keys").update({ server_tag: expectedServerTag }).eq("id", rk.id);
    }

    const msg = `${username}|${key}|${device_id}|${ts}`;
    const expectedSig = (await hmacSha256Hex(acc.hmac_secret, msg)).toLowerCase();
    if (expectedSig !== sigUser) return await invalid("BAD_SIGNATURE", acc.id, rk.id);

    const { data: existing } = await sb.schema("rent").from("key_devices")
      .select("id")
      .eq("key_id", rk.id)
      .eq("device_id", device_id)
      .maybeSingle();

    if (!existing) {
      const { count } = await sb.schema("rent").from("key_devices")
        .select("*", { count: "exact", head: true })
        .eq("key_id", rk.id);

      const currentCount = count ?? 0;
      if (currentCount >= (acc.max_devices ?? 1)) {
        return await invalid("DEVICE_LIMIT", acc.id, rk.id, { currentCount, max_devices: acc.max_devices ?? 1 });
      }

      const { error: insErr } = await sb.schema("rent").from("key_devices").insert({
        key_id: rk.id,
        device_id,
      });
      if (insErr) throw new Error(insErr.message);
    } else {
      await sb.schema("rent").from("key_devices").update({ last_seen: new Date().toISOString() }).eq("id", existing.id);
    }

    let keyExpiresAt = rk.expires_at as string | null;
    if (rk.starts_on_first_use && !rk.first_used_at) {
      const durationUnit = String(rk.duration_unit ?? (rk.duration_value != null ? "day" : "")).trim() === "hour" ? "hour" : "day";
      const durationValue = Number(rk.duration_value ?? rk.duration_days ?? 0);
      const durationMs = durationUnit === "hour" ? durationValue * 3600 * 1000 : durationValue * 86400 * 1000;
      if (!Number.isFinite(durationMs) || durationMs < 1) {
        return await invalid("KEY_BAD_DURATION", acc.id, rk.id);
      }
      const firstUsedAt = new Date().toISOString();
      keyExpiresAt = new Date(Date.now() + durationMs).toISOString();
      const { error: startErr } = await sb.schema("rent").from("keys")
        .update({ first_used_at: firstUsedAt, expires_at: keyExpiresAt })
        .eq("id", rk.id)
        .is("first_used_at", null);
      if (startErr) throw new Error(startErr.message);
      await logKeyEvent(sb, {
        account_id: acc.id,
        key_id: rk.id,
        action: "start_key_first_use",
        result: "ok",
        device_id,
        detail: { username, expires_at: keyExpiresAt, duration_value: durationValue, duration_unit: durationUnit },
      });
    }

    await logKeyEvent(sb, {
      account_id: acc.id,
      key_id: rk.id,
      action: "verify",
      result: "VALID",
      device_id,
      detail: { username, key_expires_at: keyExpiresAt },
    });

    return json(req, publicBaseUrl, {
      ok: true,
      valid: true,
      expires_at: acc.expires_at,
      key_expires_at: keyExpiresAt,
      max_devices: acc.max_devices,
    }, 200);
  } catch (e: any) {
    return json(req, publicBaseUrl, { ok: false, code: "ERROR", msg: String(e?.message ?? e) }, 400);
  }
});
