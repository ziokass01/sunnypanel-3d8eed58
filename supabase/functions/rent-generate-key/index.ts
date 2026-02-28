import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { assertTenant } from "../_shared/tenant.ts";
import { buildCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { buildRentKey, deriveTenantSecretBytes, nowUnix, randomU64 } from "../_shared/rent.ts";

const BodySchema = z.object({
  duration_seconds: z.number().int().min(60).max(3650 * 24 * 3600),
  max_devices: z.number().int().min(1).max(100).default(1),
  note: z.string().max(200).optional(),
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
  if (!parsed.success) return json({ ok: false, code: "BAD_REQUEST", msg: "Invalid body" }, { status: 400, headers: cors });

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const { data: tenant, error: tErr } = await sb
    .from("rent_tenants")
    .select("tenant_id, subscription_expires_at, secret_salt, secret_version")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();

  if (tErr || !tenant) return json({ ok: false, code: "TENANT_NOT_FOUND" }, { status: 404, headers: cors });

  const subExpMs = tenant.subscription_expires_at ? Date.parse(String(tenant.subscription_expires_at)) : NaN;
  if (!Number.isFinite(subExpMs) || subExpMs <= Date.now()) {
    return json({ ok: false, code: "TENANT_EXPIRED", msg: "Hết hạn thuê. Nhập key/gia hạn để dùng." }, { status: 403, headers: cors });
  }

  const now = nowUnix();
  const targetExp = now + parsed.data.duration_seconds;
  const capExp = Math.min(targetExp, Math.floor(subExpMs / 1000));

  const secretBytes = await deriveTenantSecretBytes(String(tenant.tenant_id), String(tenant.secret_salt), Number(tenant.secret_version));

  // collision-safe key_id
  let keyId: bigint | null = null;
  let builtKey: { key: string; last4: string } | null = null;

  for (let i = 0; i < 8; i++) {
    const candidate = randomU64();
    const { data: exists } = await sb
      .from("rent_license_keys")
      .select("id")
      .eq("tenant_id", tenant.tenant_id)
      .eq("key_id", candidate.toString())
      .maybeSingle();

    if (!exists) {
      keyId = candidate;
      const built = await buildRentKey(secretBytes, keyId, capExp);
      builtKey = { key: built.key, last4: built.last4 };
      break;
    }
  }

  if (!keyId || !builtKey) return json({ ok: false, code: "KEY_ID_GEN_FAILED" }, { status: 500, headers: cors });

  const expiresAtIso = new Date(capExp * 1000).toISOString();

  const { error: insErr } = await sb
    .from("rent_license_keys")
    .insert({
      tenant_id: tenant.tenant_id,
      key_id: keyId.toString(),
      expires_at: expiresAtIso,
      expires_unix: capExp,
      max_devices: parsed.data.max_devices,
      key_last4: builtKey.last4,
      note: parsed.data.note ?? null,
    });

  if (insErr) {
    return json({ ok: false, code: "INSERT_FAILED", msg: insErr.message }, { status: 500, headers: cors });
  }

  return json(
    {
      ok: true,
      key: builtKey.key,
      expires_at: expiresAtIso,
      max_devices: parsed.data.max_devices,
      note: parsed.data.note ?? null,
    },
    { status: 200, headers: cors },
  );
});
