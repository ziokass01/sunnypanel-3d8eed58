import { createClient } from "npm:@supabase/supabase-js@2";
import { assertTenant } from "../_shared/tenant.ts";
import { buildCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { deriveTenantSecretString } from "../_shared/rent.ts";

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
  if (req.method === "OPTIONS") return handleOptions(req, publicBaseUrl, "GET,OPTIONS");
  if (req.method !== "GET") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, { status: 405, headers: buildCorsHeaders(req, publicBaseUrl) });

  const cors = buildCorsHeaders(req, publicBaseUrl, "GET,OPTIONS");

  const auth = await assertTenant(req);
  if (!auth.ok) return json(auth.body, { status: auth.status, headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) return json({ ok: false, code: "SERVER_MISCONFIG" }, { status: 500, headers: cors });

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const { data: tenant, error } = await sb
    .from("rent_tenants")
    .select("tenant_id, username, subscription_expires_at, secret_salt, secret_version, rotate_count")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();

  if (error || !tenant) {
    return json({ ok: false, code: "TENANT_NOT_FOUND", msg: error?.message ?? "Tenant not found" }, { status: 404, headers: cors });
  }

  const expAt = tenant.subscription_expires_at ? Date.parse(String(tenant.subscription_expires_at)) : NaN;
  const active = Number.isFinite(expAt) && expAt > Date.now();

  const secret = await deriveTenantSecretString(String(tenant.tenant_id), String(tenant.secret_salt), Number(tenant.secret_version));

  return json(
    {
      ok: true,
      tenant_id: tenant.tenant_id,
      username: tenant.username,
      active,
      subscription_expires_at: tenant.subscription_expires_at,
      rotate_count: tenant.rotate_count,
      tenant_secret: secret,
    },
    { status: 200, headers: cors },
  );
});
