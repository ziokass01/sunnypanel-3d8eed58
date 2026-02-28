import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { assertTenant } from "../_shared/tenant.ts";
import { buildCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { sha256Hex } from "../_shared/rent.ts";

const BodySchema = z.object({
  code: z.string().min(6).max(128),
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

function normalizeCode(raw: string) {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9-]/g, "");
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

  const code = normalizeCode(parsed.data.code);
  const code_hash = await sha256Hex(code);

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const { data: tenant, error: tErr } = await sb
    .from("rent_tenants")
    .select("tenant_id, subscription_expires_at")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();

  if (tErr || !tenant) return json({ ok: false, code: "TENANT_NOT_FOUND" }, { status: 404, headers: cors });

  const { data: ac, error: acErr } = await sb
    .from("rent_activation_codes")
    .select("id, duration_seconds")
    .eq("tenant_id", tenant.tenant_id)
    .eq("code_hash", code_hash)
    .is("used_at", null)
    .maybeSingle();

  if (acErr || !ac) {
    return json({ ok: false, code: "INVALID_CODE", msg: "Code không đúng hoặc đã dùng" }, { status: 400, headers: cors });
  }

  const nowMs = Date.now();
  const curExpMs = tenant.subscription_expires_at ? Date.parse(String(tenant.subscription_expires_at)) : NaN;
  const baseMs = Number.isFinite(curExpMs) && curExpMs > nowMs ? curExpMs : nowMs;
  const newExpMs = baseMs + Number(ac.duration_seconds) * 1000;
  const newExpIso = new Date(newExpMs).toISOString();

  const { error: uErr } = await sb
    .from("rent_tenants")
    .update({ subscription_expires_at: newExpIso })
    .eq("tenant_id", tenant.tenant_id);

  if (uErr) return json({ ok: false, code: "UPDATE_FAILED", msg: uErr.message }, { status: 500, headers: cors });

  const { error: markErr } = await sb
    .from("rent_activation_codes")
    .update({ used_at: new Date().toISOString(), used_by: auth.user.id })
    .eq("id", ac.id);

  if (markErr) {
    // Not fatal; but signals admin to clean up.
    console.error("rent-activate: failed to mark used", markErr);
  }

  return json({ ok: true, subscription_expires_at: newExpIso }, { status: 200, headers: cors });
});
