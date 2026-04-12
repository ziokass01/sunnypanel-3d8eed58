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


function normalizeFindDumpsRewardMode(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "credit") return "credit";
  if (raw === "mixed") return "mixed";
  if (raw === "plan") return "plan";
  return "mixed";
}

function normalizeWalletKind(value: unknown): "normal" | "vip" | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "normal" || raw === "soft") return "normal";
  if (raw === "vip" || raw === "premium") return "vip";
  return null;
}

async function issueFindDumpsAdminRedeemKey(sb: any, params: {
  keyType: any;
  sessionId: string;
  traceId: string;
  nowIso: string;
  expiresAt: string;
  ipHash: string;
  fpHash: string;
}) {
  const keyType = params.keyType ?? {};
  const appCode = "find-dumps";
  const rewardMode = normalizeFindDumpsRewardMode(keyType.free_selection_mode);
  const packageCode = String(keyType.default_package_code ?? "").trim().toLowerCase() || null;
  const creditCode = String(keyType.default_credit_code ?? "").trim().toLowerCase() || null;
  const walletKind = normalizeWalletKind(keyType.default_wallet_kind);

  if (rewardMode === "plan" || rewardMode === "mixed") {
    if (!packageCode) {
      throw new Error("FIND_DUMPS_DEFAULT_PACKAGE_REQUIRED");
    }
  }
  if (rewardMode === "credit") {
    if (!creditCode) {
      throw new Error("FIND_DUMPS_DEFAULT_CREDIT_REQUIRED");
    }
  }
  if (rewardMode === "mixed" && !packageCode && !creditCode) {
    throw new Error("FIND_DUMPS_DEFAULT_SELECTION_REQUIRED");
  }

  let rewardPackageId: string | null = null;
  let planCode: string | null = null;
  let softCredit = 0;
  let premiumCredit = 0;
  let entitlementDays = 0;
  let entitlementSeconds = 0;
  let deviceLimitOverride: number | null = null;
  let accountLimitOverride: number | null = null;
  let title = String(keyType.label ?? "Find Dumps key").trim() || "Find Dumps key";
  let description = "Admin test key for Find Dumps";

  if (packageCode) {
    const pkgRes = await sb
      .from("server_app_reward_packages")
      .select("id,package_code,title,description,enabled,reward_mode,plan_code,soft_credit_amount,premium_credit_amount,entitlement_days,entitlement_seconds,device_limit_override,account_limit_override")
      .eq("app_code", appCode)
      .eq("package_code", packageCode)
      .maybeSingle();
    if (pkgRes.error || !pkgRes.data || !pkgRes.data.enabled) {
      throw new Error("FIND_DUMPS_PACKAGE_NOT_FOUND");
    }
    rewardPackageId = String(pkgRes.data.id);
    title = String(pkgRes.data.title ?? title).trim() || title;
    description = String(pkgRes.data.description ?? description).trim() || description;
    planCode = String(pkgRes.data.plan_code ?? "").trim() || null;
    softCredit = Number(pkgRes.data.soft_credit_amount ?? 0) || 0;
    premiumCredit = Number(pkgRes.data.premium_credit_amount ?? 0) || 0;
    entitlementDays = Math.max(0, Number(pkgRes.data.entitlement_days ?? 0) || 0);
    entitlementSeconds = Math.max(0, Number(pkgRes.data.entitlement_seconds ?? 0) || 0);
    deviceLimitOverride = pkgRes.data.device_limit_override == null ? null : Number(pkgRes.data.device_limit_override);
    accountLimitOverride = pkgRes.data.account_limit_override == null ? null : Number(pkgRes.data.account_limit_override);
  }

  if (creditCode) {
    // Credit-only admin test keys do not need a reward package row, but still issue through runtime redeem keys.
    title = `${title} Credit`.trim();
    description = `${description} • ${creditCode}`;
    if (!packageCode) {
      planCode = null;
      entitlementDays = 0;
      entitlementSeconds = 0;
    }
  }

  let inserted: { id: string; redeem_key: string } | null = null;
  let lastError = "";
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const redeemKey = makeKey();
    const ins = await sb
      .from("server_app_redeem_keys")
      .insert({
        app_code: appCode,
        reward_package_id: rewardPackageId,
        redeem_key: redeemKey,
        title,
        description,
        enabled: true,
        starts_at: params.nowIso,
        expires_at: params.expiresAt,
        max_redemptions: 1,
        redeemed_count: 0,
        reward_mode: rewardMode,
        plan_code: planCode,
        soft_credit_amount: softCredit,
        premium_credit_amount: premiumCredit,
        entitlement_days: entitlementDays,
        entitlement_seconds: entitlementSeconds,
        device_limit_override: deviceLimitOverride,
        account_limit_override: accountLimitOverride,
        trace_id: params.traceId,
        source_free_session_id: params.sessionId,
        metadata: {
          source: "admin-free-test",
          app_code: appCode,
          key_type_code: String(keyType.code ?? "").trim() || null,
          package_code: packageCode,
          credit_code: creditCode,
          wallet_kind: walletKind,
          key_signature: "FD",
          admin_test: true,
        },
      })
      .select("id,redeem_key")
      .single();
    if (!ins.error && ins.data?.id) {
      inserted = { id: String(ins.data.id), redeem_key: String(ins.data.redeem_key) };
      break;
    }
    lastError = extractErrorMessage(ins.error);
  }

  if (!inserted) {
    throw new Error(lastError || "SERVER_REDEEM_KEY_INSERT_FAILED");
  }

  await sb.from("licenses_free_sessions").update({
    status: "revealed",
    reveal_count: 1,
    revealed_at: params.nowIso,
    app_code: appCode,
    package_code: packageCode,
    credit_code: creditCode,
    wallet_kind: walletKind,
    issued_server_redeem_key_id: inserted.id,
    issued_server_reward_mode: rewardMode,
    selection_meta: {
      app_code: appCode,
      package_code: packageCode,
      credit_code: creditCode,
      wallet_kind: walletKind,
      reward_mode: rewardMode,
      trace_id: params.traceId,
      source: "admin-free-test",
    },
  }).eq("session_id", params.sessionId);

  await sb.from("licenses_free_issues").insert({
    license_id: null,
    key_mask: inserted.redeem_key,
    created_at: params.nowIso,
    expires_at: params.expiresAt,
    session_id: params.sessionId,
    ip_hash: params.ipHash,
    fingerprint_hash: params.fpHash,
    app_code: appCode,
    key_signature: "FD",
    server_redeem_key_id: inserted.id,
  });

  return {
    key: inserted.redeem_key,
    expires_at: params.expiresAt,
    app_code: appCode,
    key_signature: "FD",
    reward_mode: rewardMode,
    package_code: packageCode,
    credit_code: creditCode,
    wallet_kind: walletKind,
    server_redeem_key_id: inserted.id,
  };
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
  key_type_code: z.string().min(2).max(64),
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
    .select("code,label,duration_seconds,enabled,app_code,free_selection_mode,default_package_code,default_credit_code,default_wallet_kind")
    .eq("code", parsed.data.key_type_code)
    .maybeSingle();

  if (!keyType || !keyType.enabled) return json({ ok: false, message: "KEY_TYPE_DISABLED" });

  const now = new Date();
  const traceId = crypto.randomUUID();
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
      trace_id: traceId,
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
  const normalizedAppCode = String((keyType as any)?.app_code ?? "free-fire").trim().toLowerCase() || "free-fire";

  if (normalizedAppCode === "find-dumps") {
    try {
      const issued = await issueFindDumpsAdminRedeemKey(sb, {
        keyType,
        sessionId,
        traceId,
        nowIso: now.toISOString(),
        expiresAt,
        ipHash,
        fpHash,
      });
      return json({ ok: true, message: "ADMIN_TEST_OK", key: issued.key, expires_at: issued.expires_at, ip_hash: ipHash, fp_hash: fpHash, session_id: sessionId, app_code: issued.app_code, key_signature: issued.key_signature, reward_mode: issued.reward_mode, package_code: issued.package_code, credit_code: issued.credit_code, wallet_kind: issued.wallet_kind, server_redeem_key_id: issued.server_redeem_key_id });
    } catch (error) {
      await sb.from("licenses_free_sessions").update({ status: "start_error", last_error: extractErrorMessage(error) || "ADMIN_TEST_INSERT_FAILED" }).eq("session_id", sessionId);
      return json({ ok: false, message: "SERVER_REDEEM_KEY_INSERT_FAILED", detail: extractErrorMessage(error), session_id: sessionId }, 500);
    }
  }

  let key = "";
  let licenseId = "";
  let lastLicenseInsertError = "";
  for (let attempt = 0; attempt < 12; attempt++) {
    key = makeKey();
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
