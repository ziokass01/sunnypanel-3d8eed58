import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { assertAdmin } from "../_shared/admin.ts";
import { buildCorsHeaders, handleOptions } from "../_shared/cors.ts";

const BodySchema = z.object({
  ip_hash: z.string().min(16).max(128).optional(),
  fingerprint_hash: z.string().min(16).max(128).optional(),
  reason: z.string().max(500).optional(),
  blocked_until: z.string().optional().nullable(),
});

Deno.serve(async (req) => {
  const PUBLIC_BASE_URL = Deno.env.get("PUBLIC_BASE_URL") ?? "";
  const cors = buildCorsHeaders(req, PUBLIC_BASE_URL, "POST,OPTIONS");
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return handleOptions(req, PUBLIC_BASE_URL, "POST,OPTIONS");
  if (req.method !== "POST") return json({ ok: false, msg: "METHOD_NOT_ALLOWED" }, 405);

  const admin = await assertAdmin(req);
  if (!admin.ok) return json(admin.body, admin.status);

  let body: unknown = {};
  try { body = await req.json(); } catch { body = {}; }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return json({ ok: false, msg: "BAD_REQUEST" }, 400);
  if (!parsed.data.ip_hash && !parsed.data.fingerprint_hash) return json({ ok: false, msg: "MISSING_TARGET" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) return json({ ok: false, msg: "SERVER_MISCONFIG_MISSING_SECRET" }, 500);
  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const { error } = await sb.from("licenses_free_blocklist").insert({
    ip_hash: parsed.data.ip_hash ?? null,
    fingerprint_hash: parsed.data.fingerprint_hash ?? null,
    reason: parsed.data.reason ?? null,
    enabled: true,
    blocked_until: parsed.data.blocked_until ?? null,
  } as any);
  if (error) return json({ ok: false, msg: "INSERT_FAILED" }, 500);

  return json({ ok: true });
});
