import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { assertAdmin } from "../_shared/admin.ts";
import { resolveCorsOrigin } from "../_shared/cors.ts";

const BodySchema = z.object({
  issue_id: z.string().uuid(),
  license_id: z.string().uuid(),
  revoke: z.boolean().optional().default(true),
  delete_issue: z.boolean().optional().default(true),
  reason: z.string().max(500).optional(),
});

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

  if (parsed.data.revoke) {
    await sb.from("licenses").update({
      is_active: false,
      expires_at: new Date().toISOString(),
      note: `REVOKED_BY_ADMIN: ${parsed.data.reason ?? "free-issued delete"}`,
    }).eq("id", parsed.data.license_id);
  }

  if (parsed.data.delete_issue) {
    const { error } = await sb.from("licenses_free_issues").delete().eq("issue_id", parsed.data.issue_id);
    if (error) return json({ ok: false, msg: "DELETE_FAILED" }, 500);
  }
  return json({ ok: true });
});
