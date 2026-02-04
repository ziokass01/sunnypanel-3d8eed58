import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

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

const BodySchema = z.object({
  out_token: z.string().min(8).max(256),
});

Deno.serve(async (req) => {
  const PUBLIC_BASE_URL = Deno.env.get("PUBLIC_BASE_URL") ?? "";
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = isAllowedOrigin(origin, PUBLIC_BASE_URL)
    ? origin
    : (origin && !PUBLIC_BASE_URL ? origin : (PUBLIC_BASE_URL || "*"));

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(allowOrigin),
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": allowHeaders,
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, msg: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders(allowOrigin) },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ ok: false, msg: "INVALID_INPUT" }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders(allowOrigin) },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) {
    return new Response(JSON.stringify({ ok: false, msg: "SERVER_MISCONFIG" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(allowOrigin) },
    });
  }

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const outHash = await sha256Hex(parsed.data.out_token);

  await sb
    .from("licenses_free_sessions")
    .update({
      status: "closed",
      claim_token_hash: null,
      claim_expires_at: null,
      out_expires_at: new Date().toISOString(),
    })
    .eq("out_token_hash", outHash);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders(allowOrigin) },
  });
});
