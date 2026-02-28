import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { assertAdmin } from "../_shared/admin.ts";
import { buildCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { deriveTenantSecretString } from "../_shared/rent.ts";

const BodySchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(6).max(72).optional(),
  note: z.string().max(200).optional(),
});

function randomPassword(len = 14) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[arr[i] % alphabet.length];
  return out;
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

  const admin = await assertAdmin(req);
  if (!admin.ok) return json(admin.body, { status: admin.status, headers: cors });

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
  if (!parsed.success) return json({ ok: false, code: "BAD_REQUEST", msg: "Invalid body" }, { status: 400, headers: cors });

  const username = parsed.data.username.trim();
  const password = parsed.data.password ?? randomPassword();
  const email = `${username}@tenant.local`;

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  // Create auth user
  const { data: created, error: cErr } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (cErr || !created.user) {
    return json({ ok: false, code: "CREATE_USER_FAILED", msg: cErr?.message ?? "createUser failed" }, { status: 400, headers: cors });
  }

  const authUserId = created.user.id;

  // Assign role
  const { error: rErr } = await sb
    .from("user_roles")
    .insert({ user_id: authUserId, role: "tenant" });

  if (rErr) {
    // Rollback auth user
    await sb.auth.admin.deleteUser(authUserId);
    return json({ ok: false, code: "ROLE_ASSIGN_FAILED", msg: rErr.message }, { status: 500, headers: cors });
  }

  // Create tenant row
  const { data: tenantRow, error: tErr } = await sb
    .from("rent_tenants")
    .insert({ auth_user_id: authUserId, username, note: parsed.data.note ?? null })
    .select("tenant_id, secret_salt, secret_version")
    .single();

  if (tErr || !tenantRow) {
    // Rollback
    await sb.auth.admin.deleteUser(authUserId);
    return json({ ok: false, code: "TENANT_INSERT_FAILED", msg: tErr?.message ?? "insert failed" }, { status: 500, headers: cors });
  }

  const tenantSecret = await deriveTenantSecretString(String(tenantRow.tenant_id), String(tenantRow.secret_salt), Number(tenantRow.secret_version));

  return json(
    {
      ok: true,
      tenant_id: tenantRow.tenant_id,
      username,
      login: { username, email, password },
      tenant_secret: tenantSecret,
    },
    { status: 200, headers: cors },
  );
});
