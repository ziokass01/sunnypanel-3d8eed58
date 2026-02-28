import { createClient } from "npm:@supabase/supabase-js@2";
import { assertAdmin } from "../_shared/admin.ts";
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

  const admin = await assertAdmin(req);
  if (!admin.ok) return json(admin.body, { status: admin.status, headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) return json({ ok: false, code: "SERVER_MISCONFIG" }, { status: 500, headers: cors });

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const { data, error } = await sb
    .from("rent_tenants")
    .select("tenant_id, username, auth_user_id, created_at, subscription_expires_at, secret_version, rotate_count, note")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return json({ ok: false, code: "QUERY_FAILED", msg: error.message }, { status: 500, headers: cors });

  return json({ ok: true, tenants: data ?? [] }, { status: 200, headers: cors });
});
