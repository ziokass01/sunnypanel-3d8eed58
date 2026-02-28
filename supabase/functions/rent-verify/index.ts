import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { b32decode, constantTimeEqual, deriveTenantSecretBytes, nowUnix, verifyRentKey } from "../_shared/rent.ts";

const BodySchema = z.object({
  key: z.string().min(10).max(200),
  device_id: z.string().min(2).max(128).optional(),
});

function openCors(req: Request) {
  const origin = req.headers.get("origin");
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type,authorization,x-tenant-id,x-tenant-secret",
    "Access-Control-Max-Age": "86400",
  };
  if (!origin) {
    h["Access-Control-Allow-Origin"] = "*";
  } else {
    h["Access-Control-Allow-Origin"] = origin;
    h["Vary"] = "Origin";
  }
  return h;
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
  const cors = openCors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, { status: 405, headers: cors });

  const tenantId = (req.headers.get("x-tenant-id") ?? "").trim();
  const tenantSecret = (req.headers.get("x-tenant-secret") ?? "").trim();
  if (!tenantId || !tenantSecret) return json({ ok: false, code: "UNAUTHORIZED", msg: "Missing x-tenant-id / x-tenant-secret" }, { status: 401, headers: cors });

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
    .select("tenant_id, subscription_expires_at, secret_salt, secret_version")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (tErr || !tenant) return json({ ok: false, code: "TENANT_NOT_FOUND" }, { status: 404, headers: cors });

  const subExpMs = tenant.subscription_expires_at ? Date.parse(String(tenant.subscription_expires_at)) : NaN;
  if (!Number.isFinite(subExpMs) || subExpMs <= Date.now()) {
    return json({ ok: false, code: "TENANT_EXPIRED", msg: "Tenant expired" }, { status: 403, headers: cors });
  }

  const secretBytes = await deriveTenantSecretBytes(String(tenant.tenant_id), String(tenant.secret_salt), Number(tenant.secret_version));

  // Authenticate by secret (tenant gets this once; if leaked they rotate)
  let providedSecretBytes: Uint8Array;
  try {
    providedSecretBytes = b32decode(tenantSecret);
  } catch {
    return json({ ok: false, code: "UNAUTHORIZED" }, { status: 401, headers: cors });
  }

  if (!constantTimeEqual(providedSecretBytes, secretBytes)) {
    return json({ ok: false, code: "UNAUTHORIZED" }, { status: 401, headers: cors });
  }

  const verified = await verifyRentKey(secretBytes, parsed.data.key);
  if (!verified.ok) return json({ ok: false, code: verified.code }, { status: 400, headers: cors });

  const now = nowUnix();
  if (verified.expUnix < now) return json({ ok: false, code: "KEY_EXPIRED" }, { status: 403, headers: cors });

  // Ensure this key exists in DB (prevents random valid-format keys from being used without issuance)
  const { data: rec, error: kErr } = await sb
    .from("rent_license_keys")
    .select("expires_unix, max_devices, revoked_at")
    .eq("tenant_id", tenant.tenant_id)
    .eq("key_id", verified.keyId.toString())
    .maybeSingle();

  if (kErr || !rec) return json({ ok: false, code: "NOT_ISSUED" }, { status: 403, headers: cors });
  if (rec.revoked_at) return json({ ok: false, code: "REVOKED" }, { status: 403, headers: cors });
  if (Number(rec.expires_unix) !== verified.expUnix) return json({ ok: false, code: "INVALID_KEY" }, { status: 403, headers: cors });

  // Device binding (optional)
  const deviceId = parsed.data.device_id?.trim();
  if (deviceId) {
    const maxDevices = Math.max(1, Number(rec.max_devices ?? 1));

    const { data: existingDevice } = await sb
      .from("rent_license_devices")
      .select("id")
      .eq("tenant_id", tenant.tenant_id)
      .eq("key_id", verified.keyId.toString())
      .eq("device_id", deviceId)
      .maybeSingle();

    if (existingDevice?.id) {
      await sb
        .from("rent_license_devices")
        .update({ last_seen: new Date().toISOString() })
        .eq("id", existingDevice.id);
    } else {
      const { count } = await sb
        .from("rent_license_devices")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant.tenant_id)
        .eq("key_id", verified.keyId.toString());

      const c = Number(count ?? 0);
      if (c >= maxDevices) return json({ ok: false, code: "DEVICE_LIMIT" }, { status: 403, headers: cors });

      await sb
        .from("rent_license_devices")
        .insert({ tenant_id: tenant.tenant_id, key_id: verified.keyId.toString(), device_id: deviceId });
    }
  }

  return json({ ok: true, exp: verified.expUnix }, { status: 200, headers: cors });
});
