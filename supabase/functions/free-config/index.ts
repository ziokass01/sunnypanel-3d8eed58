import { createClient } from "npm:@supabase/supabase-js@2";

function corsHeaders(allowOrigin: string) {
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  } as const;
}

const allowHeaders =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

function isAllowedOrigin(origin: string, publicBaseUrl: string) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    const host = u.host;
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
  const allowOrigin = isAllowedOrigin(origin, PUBLIC_BASE_URL)
    ? origin
    : (origin && !PUBLIC_BASE_URL ? origin : (PUBLIC_BASE_URL || "*"));

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        ...corsHeaders(allowOrigin),
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": allowHeaders,
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) {
    return new Response(JSON.stringify({ error: "Missing SUPABASE secrets" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(allowOrigin) },
    });
  }

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  // Load settings row id=1
  const { data: settings, error: sErr } = await sb
    .from("licenses_free_settings")
    .select(
      "free_outbound_url,free_enabled,free_disabled_message,free_min_delay_seconds,free_return_seconds,free_daily_limit_per_fingerprint,free_require_link4m_referrer,free_public_note,free_public_links",
    )
    .eq("id", 1)
    .maybeSingle();

  if (sErr) {
    return new Response(JSON.stringify({ error: sErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(allowOrigin) },
    });
  }

  const free_outbound_url = settings?.free_outbound_url ?? null;
  const free_enabled = Boolean(settings?.free_enabled ?? true);
  const free_disabled_message = settings?.free_disabled_message ?? "Trang GetKey đang tạm đóng.";
  const free_min_delay_seconds = Math.max(5, Number(settings?.free_min_delay_seconds ?? 25));
  const free_return_seconds = Math.max(10, Number(settings?.free_return_seconds ?? 10));
  const free_daily_limit_per_fingerprint = Math.max(1, Number(settings?.free_daily_limit_per_fingerprint ?? 1));
  const free_require_link4m_referrer = Boolean(settings?.free_require_link4m_referrer ?? false);
  const free_public_note = String(settings?.free_public_note ?? "");
  const free_public_links = Array.isArray(settings?.free_public_links) ? settings?.free_public_links : [];

  // Load enabled key types
  const { data: keyTypes, error: kErr } = await sb
    .from("licenses_free_key_types")
    .select("code,label,kind,value,duration_seconds,sort_order,enabled")
    .eq("enabled", true)
    .order("sort_order", { ascending: true });

  if (kErr) {
    return new Response(JSON.stringify({ error: kErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(allowOrigin) },
    });
  }

  const TURNSTILE_SITE_KEY = Deno.env.get("TURNSTILE_SITE_KEY") ?? "";
  const TURNSTILE_SECRET_KEY = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";
  const turnstile_enabled = Boolean(TURNSTILE_SITE_KEY && TURNSTILE_SECRET_KEY);

  const missing: string[] = [];
  if (!free_outbound_url) missing.push("free_outbound_url");
  if (!keyTypes?.length) missing.push("no_key_types_enabled");
  if (!baseUrl) missing.push("public_base_url");

  const destination_gate_url = `${baseUrl}/free/gate`;

  const body = {
    public_base_url: baseUrl || null,
    destination_gate_url,

    free_enabled,
    free_disabled_message,
    free_outbound_url,
    free_min_delay_seconds,
    free_return_seconds,
    free_daily_limit_per_fingerprint,
    free_require_link4m_referrer,

    free_public_note,
    free_public_links,

    key_types: (keyTypes ?? []).map((k) => ({
      code: k.code,
      label: k.label,
      kind: k.kind,
      value: k.value,
      duration_seconds: k.duration_seconds,
    })),

    turnstile_enabled,
    turnstile_site_key: TURNSTILE_SITE_KEY || null,

    missing,
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(allowOrigin),
    },
  });
});
