import { createClient } from "npm:@supabase/supabase-js@2";
import { assertTenant } from "../_shared/tenant.ts";
import { buildCorsHeaders, handleOptions } from "../_shared/cors.ts";

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
  const cors = buildCorsHeaders(req, publicBaseUrl, "GET,OPTIONS");

  if (req.method !== "GET") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, { status: 405, headers: cors });

  const auth = await assertTenant(req);
  if (!auth.ok) return json(auth.body, { status: auth.status, headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) return json({ ok: false, code: "SERVER_MISCONFIG" }, { status: 500, headers: cors });

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const { data: tenant, error: tErr } = await sb
    .from("rent_tenants")
    .select("tenant_id")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();

  if (tErr || !tenant) return json({ ok: false, code: "TENANT_NOT_FOUND" }, { status: 404, headers: cors });

  const { data: keys, error } = await sb
    .from("rent_license_keys")
    .select("id, key_last4, expires_at, expires_unix, max_devices, revoked_at, created_at, note")
    .eq("tenant_id", tenant.tenant_id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return json({ ok: false, code: "QUERY_FAILED", msg: error.message }, { status: 500, headers: cors });

  return json({ ok: true, keys: keys ?? [] }, { status: 200, headers: cors });
});
