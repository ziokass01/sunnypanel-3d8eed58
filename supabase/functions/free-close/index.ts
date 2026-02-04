import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://mityangho.id.vn",
  "https://sunnypanel.lovable.app",
  "https://preview--sunnypanel.lovable.app",
];

const allowHeaders =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

function parseAllowedOriginsCsv(csv: string) {
  return (csv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickAllowOrigin(origin: string, publicBaseUrl: string) {
  if (!origin) return "*";
  const fromEnv = parseAllowedOriginsCsv(Deno.env.get("ALLOWED_ORIGINS") ?? "");
  const list = new Set<string>([...DEFAULT_ALLOWED_ORIGINS, ...fromEnv]);
  if (publicBaseUrl) list.add(publicBaseUrl);
  return list.has(origin) ? origin : (publicBaseUrl || DEFAULT_ALLOWED_ORIGINS[1]);
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
  const allowOrigin = pickAllowOrigin(origin, PUBLIC_BASE_URL);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": allowOrigin,
        "Vary": "Origin",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": allowHeaders,
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, msg: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
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
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) {
    return new Response(JSON.stringify({ ok: false, msg: "SERVER_MISCONFIG" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
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
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
  });
});
