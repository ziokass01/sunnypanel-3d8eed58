import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function randomChunk(len: number) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function makeKey() {
  return `SUNNY-${randomChunk(4)}-${randomChunk(4)}-${randomChunk(4)}`;
}

const inputSchema = z.object({
  // future-proof: allow choosing prefix/format, but keep strict for now
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, msg: "METHOD_NOT_ALLOWED" }, 405);

  // Validate auth + admin role
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ ok: false, msg: "UNAUTHORIZED" }, 401);

  // Body is optional for now but still validate to prevent weird inputs
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // allow empty body
  }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return json({ ok: false, msg: "INVALID_INPUT" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // client for auth claims
  const authed = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsError } = await authed.auth.getClaims(token);
  if (claimsError || !claims?.claims?.sub) return json({ ok: false, msg: "UNAUTHORIZED" }, 401);

  const userId = claims.claims.sub;
  const roleCheck = await authed.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (roleCheck.error || roleCheck.data !== true) return json({ ok: false, msg: "FORBIDDEN" }, 403);

  // service role for collision check across all rows
  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  for (let attempt = 0; attempt < 10; attempt++) {
    const key = makeKey();
    const exists = await db.from("licenses").select("id").eq("key", key).maybeSingle();
    if (!exists.data) {
      return json({ ok: true, key });
    }
  }

  return json({ ok: false, msg: "GEN_FAILED" }, 500);
});
