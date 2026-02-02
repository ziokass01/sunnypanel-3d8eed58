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
    Vary: "Origin",
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
  const env = (Deno.env.get("PUBLIC_BASE_URL") ?? "").trim();
  if (env) return env.replace(/\/$/, "");
  return `${url.protocol}//${url.host}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "GET") return json(req, { ok: false, msg: "METHOD_NOT_ALLOWED" }, 405);

  const publicBase = inferBaseUrl(req);
  const freeOutbound = (Deno.env.get("FREE_OUTBOUND_URL") ?? "").trim() || null;
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
