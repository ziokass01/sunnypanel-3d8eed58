import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

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

function base64url(bytesLen = 24) {
  const bytes = new Uint8Array(bytesLen);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

const BodySchema = z.object({
  key_type_code: z.string().min(2).max(8),
  fingerprint: z.string().min(6).max(128),
  test_mode: z.boolean().optional().default(false),
});

Deno.serve(async (req) => {
  const PUBLIC_BASE_URL = Deno.env.get("PUBLIC_BASE_URL") ?? "";
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = resolveCorsOrigin(origin, PUBLIC_BASE_URL);
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

  const { key_type_code, fingerprint, test_mode } = parsed.data;

  if (test_mode) {
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
    const authHeader = req.headers.get("Authorization");
    if (!anonKey || !authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ ok: false, msg: "UNAUTHORIZED" }, 401);
    }
    const authed = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await authed.auth.getClaims(token);
    if (claimsError || !claims?.claims?.sub) return jsonResponse({ ok: false, msg: "UNAUTHORIZED" }, 401);
    const userId = claims.claims.sub;
    const roleCheck = await authed.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (roleCheck.error || roleCheck.data !== true) return jsonResponse({ ok: false, msg: "FORBIDDEN" }, 403);
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

  const fpHash = await sha256Hex(fingerprint);
  const uaHash = await sha256Hex(ua);
  const ipHash = await sha256Hex(ip);

  // Create a token-based session (expires quickly)
  const out_token = base64url(24);
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
