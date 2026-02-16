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
  out_token: z.string().min(8).max(512),
});

type JsonErr = { ok: false; code?: string; msg: string; detail?: unknown };

type JsonOk = { ok: true; session_id: string };

Deno.serve(async (req) => {
  const PUBLIC_BASE_URL = Deno.env.get("PUBLIC_BASE_URL") ?? "";
  const origin = req.headers.get("origin") ?? "";
  const cors = corsHeaders(origin, PUBLIC_BASE_URL, "POST,OPTIONS");

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED", msg: "METHOD_NOT_ALLOWED" } satisfies JsonErr, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) {
    return json(
      {
        ok: false,
        code: "FREE_NOT_READY",
        msg: "Missing backend secrets",
        detail: {
          missing: [!supabaseUrl ? "SUPABASE_URL" : null, !serviceRole ? "SUPABASE_SERVICE_ROLE_KEY" : null].filter(Boolean),
        },
      } satisfies JsonErr,
      503,
    );
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return json({ ok: false, code: "BAD_REQUEST", msg: "BAD_REQUEST" } satisfies JsonErr, 400);

  const out_token = parsed.data.out_token;
  const outHash = await sha256Hex(out_token);

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const { data: sess, error } = await sb
    .from("licenses_free_sessions")
    .select("session_id,expires_at")
    .eq("out_token_hash", outHash)
    .maybeSingle();

  if (error) {
    return json({ ok: false, code: "SERVER_ERROR", msg: error.message } satisfies JsonErr, 500);
  }

  if (!sess?.session_id) {
    return json({ ok: false, code: "INVALID_SESSION", msg: "INVALID_SESSION" } satisfies JsonErr, 404);
  }

  // Basic expiry check (avoid resolving dead sessions)
  const exp = Date.parse(sess.expires_at);
  if (Number.isFinite(exp) && exp <= Date.now()) {
    return json({ ok: false, code: "SESSION_EXPIRED", msg: "SESSION_EXPIRED" } satisfies JsonErr, 400);
  }

  return json({ ok: true, session_id: sess.session_id } satisfies JsonOk, 200);
});
