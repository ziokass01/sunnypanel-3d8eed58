import { resolveCorsOrigin } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function inferBaseUrl(req: Request) {
  const origin = req.headers.get("origin");
  if (origin) return origin;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return "";
}

Deno.serve(async (req) => {
  const PUBLIC_BASE_URL = Deno.env.get("PUBLIC_BASE_URL") ?? "";
  const baseUrl = inferBaseUrl(req) || PUBLIC_BASE_URL;

  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = resolveCorsOrigin(origin, baseUrl || PUBLIC_BASE_URL);
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    // Include x-debug to allow troubleshooting calls from browsers.
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-fp, x-debug",
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

  try {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) {
    return jsonResponse(
      {
        ok: false,
        code: "FREE_NOT_READY",
        msg: "Missing backend secret SUPABASE_SERVICE_ROLE_KEY",
        missing: [!supabaseUrl ? "SUPABASE_URL" : null, !serviceRole ? "SUPABASE_SERVICE_ROLE_KEY" : null].filter(Boolean),
      },
      503,
    );
  }

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  // Load settings row id=1
  const { data: settings, error: sErr } = await sb
    .from("licenses_free_settings")
    .select(`
  free_outbound_url,
  free_outbound_url_pass2,
  free_enabled,
  free_disabled_message,
  free_min_delay_seconds,
  free_min_delay_seconds_pass2,
  free_gate_antibypass_enabled,
  free_gate_antibypass_seconds,
  free_link4m_rotate_days,
  free_session_waiting_limit,
  free_link4m_rotate_nonce_pass1,
  free_link4m_rotate_nonce_pass2,
  free_return_seconds,
  free_daily_limit_per_fingerprint,
  free_require_link4m_referrer,
  free_public_note,
  free_public_links,
  free_download_enabled,
  free_download_name,
  free_download_info,
  free_download_url,
  free_download_size
`)
    .eq("id", 1)
    .maybeSingle();

  if (sErr) {
    return jsonResponse({ ok: false, code: "FREE_NOT_READY", msg: sErr.message }, 503);
  }

  const rawOutbound = settings?.free_outbound_url;
  const free_outbound_url = String(rawOutbound ?? "").trim() || "https://link4m.com/PkY7X";
  const rawOutboundPass2 = (settings as any)?.free_outbound_url_pass2;
  const free_outbound_url_pass2 = String(rawOutboundPass2 ?? "").trim() || free_outbound_url;
  const free_enabled = Boolean(settings?.free_enabled ?? true);
  const free_disabled_message = settings?.free_disabled_message ?? "Trang GetKey đang tạm đóng.";
  const free_min_delay_seconds = Math.max(0, Number(settings?.free_min_delay_seconds ?? 0));
  const free_min_delay_seconds_pass2 = Math.max(0, Number((settings as any)?.free_min_delay_seconds_pass2 ?? free_min_delay_seconds));
  const free_gate_antibypass_enabled = Boolean((settings as any)?.free_gate_antibypass_enabled ?? false);
  const free_gate_antibypass_seconds = Math.max(0, Number((settings as any)?.free_gate_antibypass_seconds ?? 0));
  const free_link4m_rotate_days = Math.max(1, Number((settings as any)?.free_link4m_rotate_days ?? 7));
  const free_session_waiting_limit = Math.max(1, Number((settings as any)?.free_session_waiting_limit ?? 2));
  const free_link4m_rotate_nonce_pass1 = Math.max(0, Number((settings as any)?.free_link4m_rotate_nonce_pass1 ?? 0));
  const free_link4m_rotate_nonce_pass2 = Math.max(0, Number((settings as any)?.free_link4m_rotate_nonce_pass2 ?? 0));
  const free_return_seconds = Math.max(10, Number(settings?.free_return_seconds ?? 10));
  const free_daily_limit_per_fingerprint = Math.max(1, Number(settings?.free_daily_limit_per_fingerprint ?? 1));
  const free_require_link4m_referrer = Boolean(settings?.free_require_link4m_referrer ?? false);
  const free_public_note = String(settings?.free_public_note ?? "");
  const free_public_links = Array.isArray(settings?.free_public_links) ? settings?.free_public_links : [];
  const free_download_enabled = Boolean((settings as any)?.free_download_enabled ?? false);
  const free_download_name = String((settings as any)?.free_download_name ?? "").trim() || null;
  const free_download_info = String((settings as any)?.free_download_info ?? "").trim() || null;
  const free_download_url = String((settings as any)?.free_download_url ?? "").trim() || null;
  const free_download_size = Math.max(0, Number((settings as any)?.free_download_size ?? 0)) || null;

  // Load enabled key types
  const { data: keyTypes, error: kErr } = await sb
    .from("licenses_free_key_types")
    .select("code,label,kind,value,duration_seconds,sort_order,enabled,requires_double_gate")
    .eq("enabled", true)
    .order("sort_order", { ascending: true });

  if (kErr) {
    return jsonResponse({ ok: false, code: "FREE_NOT_READY", msg: kErr.message }, 503);
  }

  const TURNSTILE_SITE_KEY_RAW = (Deno.env.get("TURNSTILE_SITE_KEY") ?? "").trim();
  const TURNSTILE_SECRET_KEY_RAW = (Deno.env.get("TURNSTILE_SECRET_KEY") ?? "").trim();

  const isPlaceholderTurnstileKey = (k: string) => {
    const v = String(k || "").trim().toLowerCase();
    return v === "" || v === "dummy" || v === "changeme" || v === "test";
  };

  const turnstile_enabled = Boolean(
    TURNSTILE_SITE_KEY_RAW &&
      TURNSTILE_SECRET_KEY_RAW &&
      !isPlaceholderTurnstileKey(TURNSTILE_SITE_KEY_RAW),
  );

  const missing: string[] = [];
  if (!free_outbound_url) missing.push("free_outbound_url");
  if (!keyTypes?.length) missing.push("no_key_types_enabled");
  if (!baseUrl) missing.push("public_base_url");

  const destination_gate_url = baseUrl ? `${baseUrl}/free/gate` : "/free/gate";

  const body = {
    ok: true,

    // Diagnostics for browser CORS / project mismatch debugging
    request_origin: origin || null,
    allow_origin: allowOrigin || null,

    public_base_url: baseUrl || null,
    destination_gate_url,

    free_enabled,
    free_disabled_message,
    free_outbound_url,
    free_min_delay_seconds,
    free_min_delay_seconds_pass2,
    free_link4m_rotate_days,
    free_session_waiting_limit,
    free_link4m_rotate_nonce_pass1,
    free_link4m_rotate_nonce_pass2,
    free_outbound_url_pass2,
    free_gate_antibypass_enabled,
    free_gate_antibypass_seconds,
    free_return_seconds,
    free_daily_limit_per_fingerprint,
    free_require_link4m_referrer,

    free_public_note,
    free_public_links,
    free_download_enabled,
    free_download_name,
    free_download_info,
    free_download_url,
    free_download_size,

    key_types: (keyTypes ?? []).map((k) => ({
      code: k.code,
      label: k.label,
      kind: k.kind,
      value: k.value,
      duration_seconds: k.duration_seconds,
      requires_double_gate: Boolean((k as any).requires_double_gate ?? false),
    })),

    turnstile_enabled,
    turnstile_site_key: turnstile_enabled ? TURNSTILE_SITE_KEY_RAW : null,

    missing,
  };

  return jsonResponse(body, 200);
  } catch (e) {
    console.error("free-config unexpected error", e);
    return jsonResponse(
      { ok: false, code: "INTERNAL", error: "Internal server error" },
      { status: 500, headers: corsHeaders },
    );
  }

});
