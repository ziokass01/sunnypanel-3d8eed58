import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { assertAdmin } from "../_shared/admin.ts";
import { buildCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { deriveTenantSecretString } from "../_shared/rent.ts";

const BodySchema = z.object({
  tenant_id: z.string().uuid(),
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
  if (!parsed.success) return json({ ok: false, code: "BAD_REQUEST" }, { status: 400, headers: cors });

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const { data: tenant, error: tErr } = await sb
    .from("rent_tenants")
    .select("tenant_id, secret_salt, secret_version, rotate_count, subscription_expires_at")
    .eq("tenant_id", parsed.data.tenant_id)
    .maybeSingle();

  if (tErr || !tenant) return json({ ok: false, code: "TENANT_NOT_FOUND" }, { status: 404, headers: cors });

  const rotateCount = Number(tenant.rotate_count ?? 0);
  const newVersion = Number(tenant.secret_version ?? 1) + 1;
  const newRotateCount = rotateCount + 1;

  let newSubExp: string | null = tenant.subscription_expires_at ?? null;

  // Penalty: after the first rotation, reduce remaining time by 20%.
  if (rotateCount >= 1 && tenant.subscription_expires_at) {
    const nowMs = Date.now();
    const curExpMs = Date.parse(String(tenant.subscription_expires_at));
    if (Number.isFinite(curExpMs) && curExpMs > nowMs) {
      const remaining = curExpMs - nowMs;
      const reduced = Math.floor(remaining * 0.8);
      newSubExp = new Date(nowMs + reduced).toISOString();
    }
  }

  const { error: uErr } = await sb
    .from("rent_tenants")
    .update({
      secret_version: newVersion,
      rotate_count: newRotateCount,
      subscription_expires_at: newSubExp,
    })
    .eq("tenant_id", tenant.tenant_id);

  if (uErr) return json({ ok: false, code: "UPDATE_FAILED", msg: uErr.message }, { status: 500, headers: cors });

  const tenantSecret = await deriveTenantSecretString(String(tenant.tenant_id), String(tenant.secret_salt), newVersion);

  return json(
    {
      ok: true,
      tenant_id: tenant.tenant_id,
      secret_version: newVersion,
      rotate_count: newRotateCount,
      subscription_expires_at: newSubExp,
      tenant_secret: tenantSecret,
      penalty_applied: rotateCount >= 1,
    },
    { status: 200, headers: cors },
  );
});
