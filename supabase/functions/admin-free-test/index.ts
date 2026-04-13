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


type RewardSeed = {
  reward_mode: string;
  plan_code: string | null;
  soft_credit_amount: number;
  premium_credit_amount: number;
  entitlement_seconds: number;
  reward_package_id: string | null;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
};

async function buildFindDumpsRewardSeed(sb: any, keyType: any): Promise<RewardSeed> {
  const selectionMode = String(keyType?.free_selection_mode || "package").trim().toLowerCase();
  const durationSeconds = Math.max(60, Number(keyType?.duration_seconds ?? 259200));
  if (selectionMode === "credit") {
    const creditCode = String(keyType?.default_credit_code || "credit-normal").trim().toLowerCase();
    const walletKind = String(keyType?.default_wallet_kind || (creditCode === "credit-vip" ? "vip" : "normal")).trim().toLowerCase();
    const amount = 5;
    return {
      reward_mode: walletKind === "vip" ? "premium_credit" : "soft_credit",
      plan_code: null,
      soft_credit_amount: walletKind === "vip" ? 0 : amount,
      premium_credit_amount: walletKind === "vip" ? amount : 0,
      entitlement_seconds: 0,
      reward_package_id: null,
      title: `Find Dumps ${walletKind === "vip" ? "VIP" : "thường"} +5 credit`,
      description: `Admin test credit flow (${creditCode})`,
      metadata: {
        source: "admin-free-test",
        credit_code: creditCode,
        wallet_kind: walletKind,
        one_time_use: true,
      },
    };
  }

  const packageCode = String(keyType?.default_package_code || "go").trim().toLowerCase() || "go";
  const rewardPkg = await sb
    .from("server_app_reward_packages")
    .select("id,package_code,title,description,enabled,reward_mode,plan_code,soft_credit_amount,premium_credit_amount,entitlement_days,entitlement_seconds")
    .eq("app_code", "find-dumps")
    .eq("package_code", packageCode)
    .maybeSingle();

  if (rewardPkg.error) throw rewardPkg.error;
  const pkg = rewardPkg.data;
  if (!pkg) {
    const planCode = packageCode === "classic" ? "classic" : packageCode === "plus" ? "plus" : packageCode === "pro" ? "pro" : "go";
    return {
      reward_mode: "mixed",
      plan_code: planCode,
      soft_credit_amount: planCode === "go" ? 5 : planCode === "plus" ? 20 : planCode === "pro" ? 50 : 5,
      premium_credit_amount: 0,
      entitlement_seconds: durationSeconds,
      reward_package_id: null,
      title: `Find Dumps ${planCode.toUpperCase()} admin test`,
      description: `Fallback package ${packageCode}`,
      metadata: {
        source: "admin-free-test",
        package_code: packageCode,
        claim_starts_entitlement: true,
        expires_from_claim: true,
        one_time_use: true,
      },
    };
  }

  return {
    reward_mode: String(pkg.reward_mode || "plan"),
    plan_code: pkg.plan_code == null ? null : String(pkg.plan_code),
    soft_credit_amount: Number(pkg.soft_credit_amount || 0),
    premium_credit_amount: Number(pkg.premium_credit_amount || 0),
    entitlement_seconds: Math.max(0, Number(pkg.entitlement_seconds || (Number(pkg.entitlement_days || 0) * 86400) || durationSeconds)),
    reward_package_id: String(pkg.id),
    title: String(pkg.title || `Find Dumps ${packageCode}`),
    description: String(pkg.description || `Admin test package ${packageCode}`),
    metadata: {
      source: "admin-free-test",
      package_code: String(pkg.package_code || packageCode),
      claim_starts_entitlement: true,
      expires_from_claim: true,
      one_time_use: true,
    },
  };
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
    .select("code,label,app_code,duration_seconds,enabled,free_selection_mode,default_package_code,default_credit_code,default_wallet_kind")
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

  const keyTypeAppCode = String(keyType.app_code || "free-fire").trim().toLowerCase();
  const expiresAt = new Date(now.getTime() + Number(keyType.duration_seconds ?? 3600) * 1000).toISOString();

  if (keyTypeAppCode === "find-dumps") {
    const rewardSeed = await buildFindDumpsRewardSeed(sb, keyType);
    let key = "";
    let redeemId = "";
    let lastRedeemInsertError = "";
    for (let attempt = 0; attempt < 12; attempt++) {
      key = makeKey();
      const insRedeem = await sb
        .from("server_app_redeem_keys")
        .insert({
          app_code: "find-dumps",
          redeem_key: key,
          title: rewardSeed.title,
          description: rewardSeed.description,
          enabled: true,
          starts_at: now.toISOString(),
          expires_at: expiresAt,
          max_redemptions: 1,
          redeemed_count: 0,
          reward_package_id: rewardSeed.reward_package_id,
          reward_mode: rewardSeed.reward_mode,
          plan_code: rewardSeed.plan_code,
          soft_credit_amount: rewardSeed.soft_credit_amount,
          premium_credit_amount: rewardSeed.premium_credit_amount,
          entitlement_days: 0,
          entitlement_seconds: rewardSeed.entitlement_seconds,
          trace_id: traceId,
          source_free_session_id: sessionId,
          metadata: {
            ...rewardSeed.metadata,
            trace_id: traceId,
            free_session_id: sessionId,
            key_type_code: keyType.code,
            key_signature: "FD",
            issued_at: now.toISOString(),
          },
          notes: `ADMIN_FREE_TEST;TRACE=${traceId};SESSION=${sessionId};KEY_TYPE=${String(keyType.code).toUpperCase()};APP=find-dumps`,
        })
        .select("id")
        .single();
      if (!insRedeem.error && insRedeem.data?.id) {
        redeemId = insRedeem.data.id;
        break;
      }
      lastRedeemInsertError = extractErrorMessage(insRedeem.error);
    }

    if (!redeemId) {
      await sb.from("licenses_free_sessions").update({ status: "start_error", last_error: "ADMIN_TEST_REDEEM_INSERT_FAILED" }).eq("session_id", sessionId);
      await sb.from("licenses_free_security_logs").insert({
        event_type: "admin_test_error",
        route: "admin-free-test",
        ip_hash: ipHash,
        fingerprint_hash: fpHash,
        details: { reason: "RUNTIME_REDEEM_INSERT_FAILED", message: lastRedeemInsertError || "unknown" },
      });
      return json({ ok: false, message: "RUNTIME_REDEEM_INSERT_FAILED", session_id: sessionId, detail: lastRedeemInsertError || "unknown" }, 500);
    }

    await sb.from("licenses_free_issues").insert({
      license_id: null,
      key_mask: maskKey(key),
      created_at: now.toISOString(),
      expires_at: expiresAt,
      session_id: sessionId,
      ip_hash: ipHash,
      fingerprint_hash: fpHash,
      ua_hash: uaHash,
    });

    await sb.from("licenses_free_sessions").update({
      status: "revealed",
      reveal_count: 1,
      revealed_at: now.toISOString(),
      app_code: "find-dumps",
      issued_server_redeem_key_id: redeemId,
      issued_server_reward_mode: rewardSeed.reward_mode,
    }).eq("session_id", sessionId);

    return json({ ok: true, message: "ADMIN_TEST_OK", key, expires_at: expiresAt, ip_hash: ipHash, fp_hash: fpHash, session_id: sessionId, app_code: "find-dumps", key_signature: "FD" });
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
