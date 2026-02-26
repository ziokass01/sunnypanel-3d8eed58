import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveCorsOrigin } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const PUBLIC_BASE_URL = Deno.env.get("PUBLIC_BASE_URL") ?? "";
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = resolveCorsOrigin(origin, PUBLIC_BASE_URL);
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-fp, x-debug",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  // IMPORTANT:
  // If an exception escapes this handler, Supabase may return a 5xx response WITHOUT CORS headers,
  // which browsers surface as "TypeError: Failed to fetch". Always wrap handler body.
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
      .select(
        "free_outbound_url,free_enabled,free_disabled_message,free_min_delay_seconds,free_return_seconds,free_daily_limit_per_fingerprint,free_require_link4m_referrer,free_public_note,free_public_links",
      )
      .eq("id", 1)
      .maybeSingle();

    if (sErr) {
      return jsonResponse({ ok: false, code: "FREE_NOT_READY", msg: sErr.message }, 503);
    }

    const rawOutbound = settings?.free_outbound_url;
    const free_outbound_url = String(rawOutbound ?? "").trim() || "https://link4m.com/PkY7X";
    const free_enabled = Boolean(settings?.free_enabled ?? true);
    const free_disabled_message = settings?.free_disabled_message ?? "Trang GetKey đang tạm đóng.";
    const free_min_delay_seconds = Math.max(0, Number(settings?.free_min_delay_seconds ?? 0));
    const free_return_seconds = Math.max(10, Number(settings?.free_return_seconds ?? 10));
    const free_daily_limit_per_fingerprint = Math.max(1, Number(settings?.free_daily_limit_per_fingerprint ?? 1));
    const free_require_link4m_referrer = Boolean(settings?.free_require_link4m_referrer ?? false);
    const free_public_note = String(settings?.free_public_note ?? "");
    const free_public_links = Array.isArray(settings?.free_public_links) ? settings?.free_public_links : [];

    // Key types enabled
    const { data: keyTypes, error: kErr } = await sb
      .from("licenses_free_key_types")
      .select("code,label,kind,value,duration_seconds,sort_order,enabled")
      .eq("enabled", true)
      .order("sort_order", { ascending: true });

    if (kErr) {
      return jsonResponse({ ok: false, code: "FREE_NOT_READY", msg: kErr.message }, 503);
    }

    // Optional Turnstile
    const TURNSTILE_SITE_KEY_RAW = (Deno.env.get("TURNSTILE_SITE_KEY") ?? "").trim();
    const TURNSTILE_SECRET_KEY_RAW = (Deno.env.get("TURNSTILE_SECRET_KEY") ?? "").trim();

    const isPlaceholderTurnstileKey = (k: string) => {
      const v = String(k || "").trim().toLowerCase();
      return v === "" || v === "dummy" || v === "changeme" || v === "test";
    };

    const turnstile_enabled = Boolean(
      TURNSTILE_SITE_KEY_RAW && TURNSTILE_SECRET_KEY_RAW && !isPlaceholderTurnstileKey(TURNSTILE_SITE_KEY_RAW),
    );

    const baseUrl = PUBLIC_BASE_URL?.trim() || "";
    const missing: string[] = [];
    if (!free_outbound_url) missing.push("free_outbound_url");
    if (!keyTypes?.length) missing.push("no_key_types_enabled");
    if (!baseUrl) missing.push("public_base_url");

    const destination_gate_url = baseUrl ? `${baseUrl}/free/gate` : "/free/gate";

    const body = {
      ok: true,
      settings: {
        free_enabled,
        free_outbound_url,
        free_disabled_message,
        free_min_delay_seconds,
        free_return_seconds,
        free_daily_limit_per_fingerprint,
        free_require_link4m_referrer,
        free_public_note,
        free_public_links,
        base_url: baseUrl,
        destination_gate_url,
      },
      key_types: (keyTypes ?? []).map((x: any) => ({
        code: x.code,
        label: x.label,
        kind: x.kind,
        value: x.value,
        duration_seconds: x.duration_seconds,
      })),
      diagnostics: {
        allow_origin: allowOrigin,
        origin,
        public_base_url: baseUrl,
        missing,
        turnstile_enabled,
      },
    };

    const debug = req.headers.get("x-debug") === "1";
    if (debug) {
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "x-debug": "1",
        },
      });
    }

    return jsonResponse(body, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[free-config] fatal", msg);
    return jsonResponse({ ok: false, code: "SERVER_ERROR", msg: "UNEXPECTED_ERROR", detail: msg }, 500);
  }
});
