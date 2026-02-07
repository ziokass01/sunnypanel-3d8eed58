import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { assertAdmin } from "../_shared/admin.ts";
import { resolveCorsOrigin } from "../_shared/cors.ts";

const BodySchema = z.object({ session_id: z.string().uuid() });

Deno.serve(async (req) => {
  const PUBLIC_BASE_URL = Deno.env.get("PUBLIC_BASE_URL") ?? "";
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = resolveCorsOrigin(origin, PUBLIC_BASE_URL);
  const headers = { "Access-Control-Allow-Origin": allowOrigin, Vary: "Origin", "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return json({ ok: false, msg: "METHOD_NOT_ALLOWED" }, 405);

  const admin = await assertAdmin(req);
  if (!admin.ok) return json(admin.body, admin.status);

  let body: unknown = {};
  try { body = await req.json(); } catch { body = {}; }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return json({ ok: false, msg: "BAD_REQUEST" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) return json({ ok: false, msg: "SERVER_MISCONFIG_MISSING_SECRET" }, 500);
  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const { error } = await sb.from("licenses_free_sessions").delete().eq("session_id", parsed.data.session_id);
  if (error) return json({ ok: false, msg: "DELETE_FAILED" }, 500);
  return json({ ok: true });
});
