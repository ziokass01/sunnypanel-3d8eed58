import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { assertTenant } from "../_shared/tenant.ts";
import { buildCorsHeaders, handleOptions } from "../_shared/cors.ts";

const BodySchema = z.object({
  id: z.string().uuid(),
});

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

  const auth = await assertTenant(req);
  if (!auth.ok) return json(auth.body, { status: auth.status, headers: cors });

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

  const { data: tenant, error: tErr } = await sb
    .from("rent_tenants")
    .select("tenant_id")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();

  if (tErr || !tenant) return json({ ok: false, code: "TENANT_NOT_FOUND" }, { status: 404, headers: cors });

  const { error } = await sb
    .from("rent_license_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("tenant_id", tenant.tenant_id)
    .eq("id", parsed.data.id);

  if (error) return json({ ok: false, code: "UPDATE_FAILED", msg: error.message }, { status: 500, headers: cors });

  return json({ ok: true }, { status: 200, headers: cors });
});
