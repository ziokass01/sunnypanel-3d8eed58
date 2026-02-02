import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  const pub = (Deno.env.get("PUBLIC_BASE_URL") ?? "").trim().replace(/\/$/, "");

  const allowed =
    (origin && origin.endsWith(".lovable.app")) || // preview + published lovable
    (pub && origin === pub); // your real domain

  return {
    "Access-Control-Allow-Origin": allowed ? origin : "null",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "content-type,authorization",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Vary": "Origin",
  };
};

const json = (req: Request, data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

function normalizeBool(v: string | undefined | null) {
  const s = (v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function inferBaseUrl(req: Request) {
  const url = new URL(req.url);
  const host = url.host;

  // If this is a Lovable preview host, prefer the request origin to keep preview flow correct.
  if (host.includes("preview--") && host.endsWith(".lovable.app")) {
    return `${url.protocol}//${url.host}`;
  }

  const env = (Deno.env.get("PUBLIC_BASE_URL") ?? "").trim();
  if (env) return env.replace(/\/$/, "");
  return `${url.protocol}//${url.host}`;
}

function normalizeHttpsUrl(input: string | null) {
  const v = (input ?? "").trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function fixCommonGateTypo(url: string | null) {
  if (!url) return null;
  // Normalize a common typo that caused 404: /free/gat -> /free/gate
  return url.replace(/\/free\/gat(?=\b|\/|$)/g, "/free/gate");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "GET") return json(req, { ok: false, msg: "METHOD_NOT_ALLOWED" }, 405);

  const publicBase = inferBaseUrl(req);

  // 1) Prefer DB override (admin-managed). 2) Fallback to ENV.
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  let dbOutbound: string | null = null;
  const settings = await db
    .from("licenses_free_settings")
    .select("free_outbound_url")
    .eq("id", 1)
    .maybeSingle();
  if (!settings.error) {
    dbOutbound = fixCommonGateTypo(normalizeHttpsUrl((settings.data as any)?.free_outbound_url ?? null));
  }

  const envOutbound = fixCommonGateTypo(normalizeHttpsUrl((Deno.env.get("FREE_OUTBOUND_URL") ?? "").trim() || null));
  const freeOutbound = dbOutbound ?? envOutbound;

  const showTest = normalizeBool(Deno.env.get("SHOW_TEST_REDIRECT_BUTTON"));
  const turnEnabled = normalizeBool(Deno.env.get("FREE_TURNSTILE_ENABLED"));
  const turnSiteKey = (Deno.env.get("TURNSTILE_SITE_KEY") ?? "").trim() || null;

  const missing: string[] = [];
  if (!freeOutbound) missing.push("FREE_OUTBOUND_URL");
  if (turnEnabled) {
    if (!turnSiteKey) missing.push("TURNSTILE_SITE_KEY");
    if (!(Deno.env.get("TURNSTILE_SECRET_KEY") ?? "").trim()) missing.push("TURNSTILE_SECRET_KEY");
  }

  return json(req, {
    public_base_url: publicBase,
    destination_gate_url: `${publicBase}/free/gate`,
    free_outbound_url: freeOutbound,
    show_test_redirect_button: showTest,
    turnstile_enabled: turnEnabled,
    turnstile_site_key: turnSiteKey,
    missing,
  });
});
