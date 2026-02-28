import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { buildCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { sha256Hex } from "../_shared/rent.ts";

const BodySchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  code: z.string().min(6).max(128),
  new_password: z.string().min(6).max(72),
});

function normalizeCode(raw: string) {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9-]/g, "");
}

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...(init ?? {}),
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

Deno.serve(async (req) => {
  const publicBaseUrl = Deno.env.get("PUBLIC_BASE_URL") ?? "https://mityangho.id.vn";
  if (req.method === "OPTIONS") return handleOptions(req, publicBaseUrl);
  const cors = buildCorsHeaders(req, publicBaseUrl);

  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, { status: 405, headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) return json({ ok: false, code: "SERVER_MISCONFIG" }, { status: 500, headers: cors });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return json({ ok: false, code: "BAD_REQUEST" }, { status: 400, headers: cors });

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const username = parsed.data.username.trim();

  const { data: tenant, error: tErr } = await sb
    .from("rent_tenants")
    .select("tenant_id, auth_user_id")
    .eq("username", username)
    .maybeSingle();

  if (tErr || !tenant) return json({ ok: false, code: "TENANT_NOT_FOUND" }, { status: 404, headers: cors });

  const code_hash = await sha256Hex(normalizeCode(parsed.data.code));

  const { data: reset, error: rErr } = await sb
    .from("rent_password_reset_codes")
    .select("id")
    .eq("tenant_id", tenant.tenant_id)
    .eq("code_hash", code_hash)
    .is("used_at", null)
    .maybeSingle();

  if (rErr || !reset) return json({ ok: false, code: "INVALID_CODE" }, { status: 400, headers: cors });

  const { error: upErr } = await sb.auth.admin.updateUserById(String(tenant.auth_user_id), { password: parsed.data.new_password });
  if (upErr) return json({ ok: false, code: "UPDATE_FAILED", msg: upErr.message }, { status: 500, headers: cors });

  await sb
    .from("rent_password_reset_codes")
    .update({ used_at: new Date().toISOString(), used_by: tenant.auth_user_id })
    .eq("id", reset.id);

  return json({ ok: true }, { status: 200, headers: cors });
});
