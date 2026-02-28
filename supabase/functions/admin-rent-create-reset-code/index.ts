import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { assertAdmin } from "../_shared/admin.ts";
import { buildCorsHeaders, handleOptions } from "../_shared/cors.ts";
import { b32encode, groupKey, sha256Hex } from "../_shared/rent.ts";

const BodySchema = z.object({
  tenant_id: z.string().uuid(),
});

function generateCode() {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const raw = b32encode(bytes);
  return `RST-${groupKey(raw)}`;
}

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

  const { data: tenant } = await sb
    .from("rent_tenants")
    .select("tenant_id")
    .eq("tenant_id", parsed.data.tenant_id)
    .maybeSingle();

  if (!tenant) return json({ ok: false, code: "TENANT_NOT_FOUND" }, { status: 404, headers: cors });

  for (let i = 0; i < 6; i++) {
    const code = generateCode();
    const norm = normalizeCode(code);
    const code_hash = await sha256Hex(norm);
    const code_last4 = norm.slice(-4);

    const { error } = await sb
      .from("rent_password_reset_codes")
      .insert({ tenant_id: parsed.data.tenant_id, code_hash, code_last4, created_by: admin.user.id });

    if (!error) return json({ ok: true, code, code_last4 }, { status: 200, headers: cors });

    if (!error.message.toLowerCase().includes("duplicate")) return json({ ok: false, code: "INSERT_FAILED", msg: error.message }, { status: 500, headers: cors });
  }

  return json({ ok: false, code: "CODE_GEN_FAILED" }, { status: 500, headers: cors });
});
