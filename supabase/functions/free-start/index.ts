import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { assertAdmin } from "../_shared/admin.ts";

const KNOWN_HOSTS = new Set(["mityangho.id.vn", "sunnypanel.lovable.app"]);

function isAllowedOrigin(origin: string, publicBaseUrl: string) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    const host = u.host;
    if (KNOWN_HOSTS.has(host)) return true;
    if (host === "lovable.dev" || host.endsWith(".lovable.dev") || host.endsWith(".lovable.app")) return true;
    if (publicBaseUrl) {
      const pb = new URL(publicBaseUrl);
      const pbHost = pb.host;
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

function getClientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "";
}

function base64url(bytesLen = 32) {
  const bytes = new Uint8Array(bytesLen);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

const BodySchema = z.object({
  key_type_code: z.string().min(2).max(8),
  fingerprint: z.string().min(6).max(128).optional(),
  test_mode: z.boolean().optional().default(false),
});

function isMissingRateLimitSetup(error: { message?: string | null; details?: string | null; hint?: string | null } | null | undefined) {
  const haystack = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();
  return haystack.includes("check_free_ip_rate_limit")
    || haystack.includes("check_free_fp_rate_limit")
    || haystack.includes("could not find the function")
    || haystack.includes("does not exist")
    || (haystack.includes("relation") && haystack.includes("rate_limit"));
}

async function safeInsertStartErrorSession(
  sb: ReturnType<typeof createClient>,
  payload: {
    ipHash: string;
    uaHash: string;
    fpHash: string;
    keyTypeCode: string;
    lastError: string;
  },
) {
  try {
    const now = new Date();
    await sb.from("licenses_free_sessions").insert({
      status: "start_error",
      reveal_count: 0,
      ip_hash: payload.ipHash,
      ua_hash: payload.uaHash,
      fingerprint_hash: payload.fpHash,
      key_type_code: payload.keyTypeCode,
      duration_seconds: 0,
      started_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 3 * 60 * 1000).toISOString(),
      last_error: payload.lastError,
    });
  } catch {
    // no-op
  }
}

Deno.serve(async (req) => {
  const PUBLIC_BASE_URL = Deno.env.get("PUBLIC_BASE_URL") ?? "";
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = resolveCorsOrigin(origin, PUBLIC_BASE_URL);
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-fp",
    "Access-Control-Max-Age": "86400",
  };
  const jsonResponse = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, msg: "METHOD_NOT_ALLOWED" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) {
    return jsonResponse({ ok: false, msg: "MISSING_SUPABASE_SECRETS" }, 500);
  }

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const safeLogSecurity = async (event_type: string, details: Record<string, unknown>, ip_hash?: string, fingerprint_hash?: string | null) => {
    try {
      await sb.from("licenses_free_security_logs").insert({
        event_type,
        route: "free-start",
        details,
        ip_hash: ip_hash ?? null,
        fingerprint_hash: fingerprint_hash ?? null,
      });
    } catch {
      // no-op
    }
  };

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ ok: false, msg: "BAD_REQUEST" }, 400);
  }

  const { key_type_code, test_mode } = parsed.data;
  const fpFromHeader = (req.headers.get("x-fp") ?? "").trim();
  const fingerprint = fpFromHeader || parsed.data.fingerprint || "";

  if (test_mode) {
    const admin = await assertAdmin(req);
    if (!admin.ok) return jsonResponse({ ok: false, msg: "UNAUTHORIZED" }, admin.status);
  }

  // Settings
  const { data: settings, error: sErr } = await sb
    .from("licenses_free_settings")
    .select("free_outbound_url,free_enabled,free_disabled_message,free_min_delay_seconds")
    .eq("id", 1)
    .maybeSingle();

  if (sErr) {
    return jsonResponse({ ok: false, msg: sErr.message }, 500);
  }

  const free_enabled = Boolean(settings?.free_enabled ?? true);
  if (!free_enabled) {
    return jsonResponse({ ok: false, msg: "CLOSED" }, 403);
  }

  const defaultOutbound = settings?.free_outbound_url ?? "";
  const baseUrl = PUBLIC_BASE_URL || origin;
  const outbound_url = test_mode ? `${baseUrl}/free/gate` : defaultOutbound;
  if (!outbound_url) return jsonResponse({ ok: false, msg: "MISSING_OUTBOUND_URL" }, 500);

  // Key type must be enabled
  const { data: kt, error: kErr } = await sb
    .from("licenses_free_key_types")
    .select("code,label,duration_seconds,enabled")
    .eq("code", key_type_code)
    .maybeSingle();

  if (kErr) {
    return jsonResponse({ ok: false, msg: kErr.message }, 500);
  }
  if (!kt || !kt.enabled) {
    return jsonResponse({ ok: false, msg: "KEY_TYPE_DISABLED" }, 400);
  }

  const ua = req.headers.get("user-agent") ?? "";
  const ip = getClientIp(req);

  const fpHash = fingerprint ? await sha256Hex(fingerprint) : await sha256Hex(`missing:${ua}:${ip}`);
  const uaHash = await sha256Hex(ua);
  const ipHash = await sha256Hex(ip);

  const rl = await sb.rpc("check_free_ip_rate_limit", {
    p_ip_hash: ipHash,
    p_route: "free-start",
    p_limit: 25,
    p_window_seconds: 60,
  });
  if (rl.error) {
    if (isMissingRateLimitSetup(rl.error)) {      await safeInsertStartErrorSession(sb, {
        ipHash,
        uaHash,
        fpHash,
        keyTypeCode: key_type_code,
        lastError: "SERVER_RATE_LIMIT_MISCONFIG",
      });
      return jsonResponse({ ok: false, msg: "Server đang cấu hình thiếu, vui lòng thử lại sau", code: "SERVER_RATE_LIMIT_MISCONFIG" }, 503);
    }
    await safeInsertStartErrorSession(sb, {
      ipHash,
      uaHash,
      fpHash,
      keyTypeCode: key_type_code,
      lastError: "RATE_LIMIT_CHECK_FAILED",
    });
    return jsonResponse({ ok: false, msg: "RATE_LIMIT_CHECK_FAILED" }, 500);
  }
  const allowed = Array.isArray(rl.data) ? rl.data[0]?.allowed : rl.data?.allowed;
  if (allowed === false) {
    await safeLogSecurity("rate_limit_ip_blocked", { key_type_code }, ipHash, fingerprint ? fpHash : null);
    return jsonResponse({ ok: false, msg: "RATE_LIMIT" }, 429);
  }

  if (fingerprint) {
    const fpRl = await sb.rpc("check_free_fp_rate_limit", {
      p_fp_hash: fpHash,
      p_route: "free-start",
      p_limit: 12,
      p_window_seconds: 60,
    });
    if (fpRl.error) {
      if (isMissingRateLimitSetup(fpRl.error)) {
        await safeInsertStartErrorSession(sb, {
          ipHash,
          uaHash,
          fpHash,
          keyTypeCode: key_type_code,
          lastError: "SERVER_RATE_LIMIT_MISCONFIG",
        });
        return jsonResponse({ ok: false, msg: "Server đang cấu hình thiếu, vui lòng thử lại sau", code: "SERVER_RATE_LIMIT_MISCONFIG" }, 503);
      }
      await safeInsertStartErrorSession(sb, {
        ipHash,
        uaHash,
        fpHash,
        keyTypeCode: key_type_code,
        lastError: "RATE_LIMIT_CHECK_FAILED",
      });
      return jsonResponse({ ok: false, msg: "RATE_LIMIT_CHECK_FAILED" }, 500);
    }
    const fpAllowed = Array.isArray(fpRl.data) ? fpRl.data[0]?.allowed : fpRl.data?.allowed;
    if (fpAllowed === false) {
      await safeLogSecurity("rate_limit_fp_blocked", { key_type_code }, ipHash, fpHash);
      return jsonResponse({ ok: false, msg: "RATE_LIMIT" }, 429);
    }
  }

  const banned = await sb
    .from("licenses_free_blocklist")
    .select("id")
    .eq("enabled", true)
    .or(`fingerprint_hash.eq.${fpHash},ip_hash.eq.${ipHash}`)
    .limit(1)
    .maybeSingle();
  if (banned.data?.id) {
    await safeLogSecurity("blocklist_hit", { key_type_code }, ipHash, fingerprint ? fpHash : null);
    return jsonResponse({ ok: false, msg: "BLOCKED" }, 403);
  }

  // Create a token-based session (expires quickly)
  const out_token = base64url(32);
  const out_token_hash = await sha256Hex(out_token);

  const now = new Date();
  const started_at = now.toISOString();
  const expires_at = new Date(now.getTime() + 30 * 60 * 1000).toISOString(); // 30 minutes
  const out_expires_at = expires_at;

  const duration_seconds = Number(kt.duration_seconds ?? 0);

  const { error: insErr } = await sb.from("licenses_free_sessions").insert({
    status: "started",
    reveal_count: 0,
    ip_hash: ipHash,
    ua_hash: uaHash,
    fingerprint_hash: fpHash,
    started_at,
    expires_at,
    out_token_hash,
    out_expires_at,
    key_type_code,
    duration_seconds,
  });

  if (insErr) {
    return jsonResponse({ ok: false, msg: insErr.message }, 500);
  }

  const min_delay_seconds = Math.max(5, Number(settings?.free_min_delay_seconds ?? 25));

  return jsonResponse({ ok: true, out_token, outbound_url, min_delay_seconds }, 200);
});
