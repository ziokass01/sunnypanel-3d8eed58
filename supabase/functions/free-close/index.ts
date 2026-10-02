import { authenticateFreeIngress } from "../_shared/free-ingress.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { corsHeaders } from "../_shared/cors.ts";

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
  const cors = corsHeaders(origin, PUBLIC_BASE_URL, "POST,OPTIONS");
  const jsonResponse = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
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

  try {
    req = await authenticateFreeIngress(req, "free-close",
      Deno.env.get("FREE_GATEWAY_SHARED_SECRET") || Deno.env.get("VERIFY_GATEWAY_SHARED_SECRET") || "");
  } catch (error) {
    const code = String((error as Error).message || "FREE_GATEWAY_REQUIRED");
    return jsonResponse({ ok: false, code, msg: code }, code === "FREE_GATEWAY_SECRET_MISSING" ? 503 : 403);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) {
    return jsonResponse({ ok: false, msg: "SERVER_MISCONFIG" }, 500);
  }

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const outHash = await sha256Hex(parsed.data.out_token);

  // VIP pass2 sessions may carry a dedicated out_token hash.
  // Resolve one concrete session first, then close by session_id.
  const { data: sessionMatch, error: lookupError } = await sb
    .from("licenses_free_sessions")
    .select("session_id")
    .or(`out_token_hash.eq.${outHash},out_token_hash_pass2.eq.${outHash}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) return jsonResponse({ ok: false, msg: "SERVER_ERROR" }, 500);
  if (!sessionMatch?.session_id) {
    return jsonResponse({ ok: true }, 200);
  }

  const close = await sb.rpc("free_flow_burn", { p_session_id: sessionMatch.session_id, p_reason: "USER_CLOSED" });
  if (close.error) return jsonResponse({ ok: false, code: "CLOSE_FAILED", msg: "SERVER_ERROR" }, 500);
  return jsonResponse({ ok: true }, 200);
});
