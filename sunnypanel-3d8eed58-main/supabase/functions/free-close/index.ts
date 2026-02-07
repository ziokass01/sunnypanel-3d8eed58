import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { resolveCorsOrigin } from "../_shared/cors.ts";

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
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, msg: "METHOD_NOT_ALLOWED" }, 405);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ ok: false, msg: "INVALID_INPUT" }, 200);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) {
    return jsonResponse({ ok: false, msg: "SERVER_MISCONFIG" }, 500);
  }

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const outHash = await sha256Hex(parsed.data.out_token);

  // Close session.
  // Some deployments may not have newer optional columns yet (e.g. claim_token_plain),
  // so we try the full update first, then fall back to a minimal update if needed.
  const fullUpd = await sb
    .from("licenses_free_sessions")
    .update({
      status: "closed",
      claim_token_hash: null,
      claim_expires_at: null,
      // Optional column (introduced later)
      claim_token_plain: null,
      out_expires_at: new Date().toISOString(),
    })
    .eq("out_token_hash", outHash);

  if (fullUpd.error) {
    const msg = String(fullUpd.error.message || "");
    // Missing-column errors vary; check for the column name to be safe.
    if (msg.toLowerCase().includes("claim_token_plain")) {
      await sb
        .from("licenses_free_sessions")
        .update({
          status: "closed",
          claim_token_hash: null,
          claim_expires_at: null,
          out_expires_at: new Date().toISOString(),
        })
        .eq("out_token_hash", outHash);
    }
  }

  return jsonResponse({ ok: true }, 200);
});
