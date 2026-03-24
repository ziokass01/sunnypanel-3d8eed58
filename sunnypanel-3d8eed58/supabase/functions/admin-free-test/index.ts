import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { assertAdmin } from "../_shared/admin.ts";
import { buildCorsHeaders, handleOptions } from "../_shared/cors.ts";

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

function randomChunk(len = 4) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function makeKey() {
  return `SUNNY-${randomChunk(4)}-${randomChunk(4)}-${randomChunk(4)}`;
}

function extractErrorMessage(err: unknown) {
  if (!err || typeof err !== "object") return "unknown";
  const anyErr = err as Record<string, unknown>;
  return String(anyErr.message ?? anyErr.details ?? anyErr.hint ?? "unknown");
}

function maskKey(key: string) {
  if (key.length <= 10) return "***";
  return `${key.slice(0, 9)}…${key.slice(-4)}`;
}

function isFreeSchemaMissing(err: unknown) {
  const txt = extractErrorMessage(err).toLowerCase();
  return txt.includes("does not exist") || txt.includes("undefined column") || txt.includes("could not find");
}

function inferProjectRefFromUrl(supabaseUrl: string): string | null {
  try {
    const host = new URL(supabaseUrl).hostname;
    // <ref>.supabase.co
    const ref = host.split(".")[0];
    return ref || null;
  } catch {
    return null;
  }
}

const BodySchema = z.object({
  key_type_code: z.string().min(2).max(8),
  dry_run: z.boolean().optional().default(false),
});

Deno.serve(async (req) => {
  const PUBLIC_BASE_URL = Deno.env.get("PUBLIC_BASE_URL") ?? "";
  const cors = buildCorsHeaders(req, PUBLIC_BASE_URL, "POST,OPTIONS");

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });

  if (req.method === "OPTIONS") return handleOptions(req, PUBLIC_BASE_URL, "POST,OPTIONS");
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED", msg: "METHOD_NOT_ALLOWED" }, 405);

  const admin = await assertAdmin(req);
  if (!admin.ok) return json(admin.body, admin.status);

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return json({ ok: false, message: "BAD_REQUEST" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const projectRef = inferProjectRefFromUrl(supabaseUrl);

  const missing: string[] = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!serviceRole) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length) {
    return json(
      {
        ok: false,
        code: "SERVER_MISCONFIG_MISSING_SECRET",
        msg: "Missing backend secrets",
        missing,
        project_ref: projectRef,
      },
      503,
    );
  }

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const synthetic = `admin_test:${Date.now()}:${crypto.randomUUID()}`;
  const ipHash = await sha256Hex(`${synthetic}:ip`);
  const fpHash = await sha256Hex(`${synthetic}:fp`);
  const uaHash = await sha256Hex("admin-test");

  const { data: keyType } = await sb
    .from("licenses_free_key_types")
    .select("code,duration_seconds,enabled")
    .eq("code", parsed.data.key_type_code)
    .maybeSingle();

  if (!keyType || !keyType.enabled) return json({ ok: false, message: "KEY_TYPE_DISABLED" });

  const now = new Date();
  const sessionExp = new Date(now.getTime() + 20 * 60 * 1000).toISOString();
  const insSess = await sb
    .from("licenses_free_sessions")
    .insert({
      status: "gate_ok",
      reveal_count: 0,
      ip_hash: ipHash,
      ua_hash: uaHash,
      fingerprint_hash: fpHash,
      key_type_code: keyType.code,
      duration_seconds: Number(keyType.duration_seconds ?? 3600),
      started_at: now.toISOString(),
      gate_ok_at: now.toISOString(),
      expires_at: sessionExp,
    })
    .select("session_id")
    .single();

  if (insSess.error || !insSess.data?.session_id) {
    await sb.from("licenses_free_security_logs").insert({
      event_type: "admin_test_error",
      route: "admin-free-test",
      ip_hash: ipHash,
      fingerprint_hash: fpHash,
      details: { reason: "SESSION_INSERT_FAILED" },
    });
    return json(
      {
        ok: false,
        message: "SESSION_INSERT_FAILED",
        detail: isFreeSchemaMissing(insSess.error) ? "Thiếu migration: 20260206150000_free_schema_runtime_fix.sql" : undefined,
      },
      500,
    );
  }

  const sessionId = insSess.data.session_id;

  if (parsed.data.dry_run) {
    return json({
      ok: true,
      message: "DRY_RUN_OK",
      ip_hash: ipHash,
      fp_hash: fpHash,
      session_id: sessionId,
      expires_at: new Date(now.getTime() + Number(keyType.duration_seconds ?? 3600) * 1000).toISOString(),
    });
  }

  const expiresAt = new Date(now.getTime() + Number(keyType.duration_seconds ?? 3600) * 1000).toISOString();
  let key = "";
  let licenseId = "";
  let lastLicenseInsertError = "";
  for (let attempt = 0; attempt < 12; attempt++) {
    key = makeKey();
    // licenses table schema in this project is minimal: (id, key, created_at, expires_at, max_devices, is_active, note)
    // Keep insert payload compatible to avoid ADMIN_TEST_INSERT_FAILED due to missing columns.
    const insLic = await sb
      .from("licenses")
      .insert({
        key,
        is_active: true,
        max_devices: 1,
        expires_at: expiresAt,
        note: `ADMIN_FREE_TEST_${String(keyType.code).toUpperCase()}`,
      })
      .select("id")
      .single();
    if (!insLic.error && insLic.data?.id) {
      licenseId = insLic.data.id;
      break;
    }
    lastLicenseInsertError = extractErrorMessage(insLic.error);
  }

  if (!licenseId) {
    await sb.from("licenses_free_sessions").update({ status: "start_error", last_error: "ADMIN_TEST_INSERT_FAILED" }).eq(
      "session_id",
      sessionId,
    );
    await sb.from("licenses_free_security_logs").insert({
      event_type: "admin_test_error",
      route: "admin-free-test",
      ip_hash: ipHash,
      fingerprint_hash: fpHash,
      details: { reason: "LICENSE_INSERT_FAILED", message: lastLicenseInsertError || "unknown" },
    });
    return json(
      {
        ok: false,
        message: "LICENSE_INSERT_FAILED",
        session_id: sessionId,
        detail: (lastLicenseInsertError || "") +
          (isFreeSchemaMissing({ message: lastLicenseInsertError })
            ? " | Thiếu migration: 20260206150000_free_schema_runtime_fix.sql"
            : ""),
      },
      500,
    );
  }

  await sb.from("licenses_free_issues").insert({
    license_id: licenseId,
    key_mask: maskKey(key),
    created_at: now.toISOString(),
    expires_at: expiresAt,
    session_id: sessionId,
    ip_hash: ipHash,
    fingerprint_hash: fpHash,
    ua_hash: uaHash,
  });

  await sb.from("licenses_free_sessions")
    .update({ status: "revealed", reveal_count: 1, revealed_at: now.toISOString(), revealed_license_id: licenseId })
    .eq("session_id", sessionId);

  return json({ ok: true, message: "ADMIN_TEST_OK", key, expires_at: expiresAt, ip_hash: ipHash, fp_hash: fpHash, session_id: sessionId });
});
