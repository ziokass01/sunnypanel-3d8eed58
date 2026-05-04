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

function normalizePrefix(value: unknown) {
  const raw = String(value ?? "SUNNY").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  return raw || "SUNNY";
}

function makeKey(prefix = "SUNNY") {
  const p = normalizePrefix(prefix);
  return `${p}-${randomChunk(4)}-${randomChunk(4)}-${randomChunk(4)}`;
}

function makeRedeemKey(prefix = "FND") {
  const p = normalizePrefix(prefix);
  return `${p}-${randomChunk(4)}-${randomChunk(4)}-${randomChunk(4)}`;
}

function addSecondsIso(base: Date, seconds: number) {
  return new Date(base.getTime() + Math.max(60, Number(seconds || 0)) * 1000).toISOString();
}

function normalizeFreeSelectionMode(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  return ["package", "credit", "mixed", "none"].includes(raw) ? raw : "none";
}

function normalizeWalletKind(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["vip", "premium"].includes(raw)) return "vip";
  if (["normal", "soft"].includes(raw)) return "normal";
  return "normal";
}

const FIND_DUMPS_PACKAGE_FALLBACK: Record<string, any> = {
  classic: { package_code: "classic", title: "Find Dumps Classic", description: "Admin test package classic", reward_mode: "plan", plan_code: "classic", soft_credit_amount: 0, premium_credit_amount: 0, entitlement_seconds: 0, device_limit_override: 1, account_limit_override: 1 },
  go: { package_code: "go", title: "Find Dumps Go", description: "Admin test package go", reward_mode: "plan", plan_code: "go", soft_credit_amount: 0, premium_credit_amount: 0, entitlement_seconds: 0, device_limit_override: 1, account_limit_override: 1 },
  plus: { package_code: "plus", title: "Find Dumps Plus", description: "Admin test package plus", reward_mode: "plan", plan_code: "plus", soft_credit_amount: 0, premium_credit_amount: 0, entitlement_seconds: 0, device_limit_override: 2, account_limit_override: 1 },
  pro: { package_code: "pro", title: "Find Dumps Pro", description: "Admin test package pro", reward_mode: "plan", plan_code: "pro", soft_credit_amount: 0, premium_credit_amount: 0, entitlement_seconds: 0, device_limit_override: 3, account_limit_override: 1 },
};

const FIND_DUMPS_CREDIT_FALLBACK: Record<string, any> = {
  "credit-normal": { package_code: "credit-normal", title: "Find Dumps +5 credit thường", description: "Admin test soft credit", reward_mode: "soft_credit", plan_code: null, soft_credit_amount: 5, premium_credit_amount: 0, entitlement_seconds: 0, device_limit_override: null, account_limit_override: null },
  "credit-vip": { package_code: "credit-vip", title: "Find Dumps +0.2 credit VIP", description: "Admin test premium credit", reward_mode: "premium_credit", plan_code: null, soft_credit_amount: 0, premium_credit_amount: 0.2, entitlement_seconds: 0, device_limit_override: null, account_limit_override: null },
};

async function getFindDumpsRewardMeta(sb: any, packageCode: string) {
  const code = String(packageCode || "").trim().toLowerCase();
  if (!code) return null;
  const { data, error } = await sb
    .from("server_app_reward_packages")
    .select("package_code,title,description,reward_mode,plan_code,soft_credit_amount,premium_credit_amount,entitlement_seconds,device_limit_override,account_limit_override,enabled")
    .eq("app_code", "find-dumps")
    .eq("package_code", code)
    .maybeSingle();
  if (error) return null;
  if (data && data.enabled === false) return null;
  return data ?? null;
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
    .select("code,label,duration_seconds,enabled,app_code,app_label,key_signature,allow_reset,free_selection_mode,free_selection_expand,default_package_code,default_credit_code,default_wallet_kind")
    .eq("code", parsed.data.key_type_code)
    .maybeSingle();

  if (!keyType || !keyType.enabled) return json({ ok: false, message: "KEY_TYPE_DISABLED" });

  const appCode = String((keyType as any).app_code || "free-fire").trim().toLowerCase() || "free-fire";

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
      app_code: appCode,
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

  const durationSeconds = Math.max(60, Number(keyType.duration_seconds ?? 3600));
  const expiresAt = addSecondsIso(now, durationSeconds);


  // AI_ADMIN_TEST_FIX_V1: AI Coding free-key test must issue ai_sunny_redeem_keys,
  // not legacy public.licenses. Otherwise Admin Test GetKey returns LICENSE_INSERT_FAILED.
  if (appCode === "ai-coding") {
    const pepper = Deno.env.get("AI_SUNNY_KEY_PEPPER") ?? Deno.env.get("AI_SUNNY_HASH_PEPPER") ?? "sunny-ai";
    let planCode = "trial";
    const planCheck = await sb.from("ai_sunny_plans").select("plan_code").eq("plan_code", planCode).maybeSingle();
    if (planCheck.error || !planCheck.data?.plan_code) planCode = "free";

    let rawKey = "";
    let inserted: { id: string; code_mask: string } | null = null;
    let lastAiInsertError = "";
    for (let attempt = 0; attempt < 12; attempt += 1) {
      rawKey = makeKey("AI-SUNNY");
      const codeHash = await sha256Hex(`${pepper}:${rawKey}`);
      const ins = await sb.from("ai_sunny_redeem_keys").insert({
        code_hash: codeHash,
        code_mask: maskKey(rawKey),
        title: String((keyType as any).label ?? "Key thêm token AI"),
        status: "active",
        plan_code_to_grant: planCode,
        grant_hours: Math.max(1, Math.ceil(durationSeconds / 3600)),
        bonus_daily_tokens: 60000,
        bonus_daily_messages: 30,
        allowed_models: ["mimo-v2.5"],
        max_uses_total: 1,
        max_uses_per_day: 1,
        per_user_once: true,
        daily_ip_limit: 1,
        daily_device_limit: 1,
        require_device_id: true,
        expires_at: expiresAt,
        created_by: "free-admin-test",
        note: `ADMIN_FREE_TEST;TRACE=${traceId};SESSION=${sessionId};KEY_TYPE=${keyType.code};APP=ai-coding`,
      }).select("id,code_mask").single();
      if (!ins.error && ins.data?.id) {
        inserted = { id: String(ins.data.id), code_mask: String(ins.data.code_mask ?? maskKey(rawKey)) };
        break;
      }
      lastAiInsertError = extractErrorMessage(ins.error);
    }

    if (!inserted) {
      await sb.from("licenses_free_sessions").update({ status: "start_error", last_error: "ADMIN_TEST_AI_REDEEM_INSERT_FAILED" }).eq("session_id", sessionId);
      await sb.from("licenses_free_security_logs").insert({
        event_type: "admin_test_error",
        route: "admin-free-test",
        ip_hash: ipHash,
        fingerprint_hash: fpHash,
        details: { reason: "AI_REDEEM_KEY_INSERT_FAILED", message: lastAiInsertError || "unknown" },
      });
      return json({ ok: false, message: "AI_REDEEM_KEY_INSERT_FAILED", session_id: sessionId, detail: lastAiInsertError || undefined }, 500);
    }

    // Best-effort monitor row only. Do not fail AI key issuing if licenses_free_issues
    // still has old legacy constraints around license_id.
    const issueInsert = await sb.from("licenses_free_issues").insert({
      license_id: null,
      key_mask: inserted.code_mask,
      created_at: now.toISOString(),
      expires_at: expiresAt,
      session_id: sessionId,
      ip_hash: ipHash,
      fingerprint_hash: fpHash,
      ua_hash: uaHash,
      app_code: "ai-coding",
      key_signature: "AI-SUNNY",
      server_redeem_key_id: inserted.id,
    });
    if (issueInsert.error) {
      await sb.from("licenses_free_security_logs").insert({
        event_type: "admin_test_warning",
        route: "admin-free-test",
        ip_hash: ipHash,
        fingerprint_hash: fpHash,
        details: { reason: "AI_ISSUE_LOG_SKIPPED", message: extractErrorMessage(issueInsert.error), ai_redeem_key_id: inserted.id },
      });
    }

    await sb.from("licenses_free_sessions").update({
      status: "revealed",
      reveal_count: 1,
      revealed_at: now.toISOString(),
      issued_server_redeem_key_id: inserted.id,
      issued_server_reward_mode: "ai_sunny_redeem",
      app_code: "ai-coding",
      selection_meta: {
        app_code: "ai-coding",
        reward_mode: "ai_sunny_redeem",
        plan_code: planCode,
        duration_seconds: durationSeconds,
        trace_id: traceId,
      },
    }).eq("session_id", sessionId);

    return json({ ok: true, message: "ADMIN_TEST_OK", key: rawKey, expires_at: expiresAt, ip_hash: ipHash, fp_hash: fpHash, session_id: sessionId });
  }

  // Find Dumps free key types are server-app redeem keys, not legacy rows in public.licenses.
  // Keep this branch isolated from Fake Lag and Free Fire so fd_credit/fd_package cannot hit LICENSE_INSERT_FAILED.
  if (appCode === "find-dumps") {
    const mode = normalizeFreeSelectionMode((keyType as any).free_selection_mode);
    let packageCode = String((keyType as any).default_package_code ?? "").trim().toLowerCase();
    let creditCode = String((keyType as any).default_credit_code ?? "").trim().toLowerCase();
    const walletKind = normalizeWalletKind((keyType as any).default_wallet_kind);

    if (mode === "credit") {
      if (!creditCode) creditCode = "credit-normal";
      packageCode = "";
    } else if (mode === "package") {
      if (!packageCode) packageCode = "go";
      creditCode = "";
    } else if (mode === "mixed") {
      if (creditCode) packageCode = "";
      else if (packageCode) creditCode = "";
      else packageCode = "go";
    } else {
      if (String(keyType.code || "").toLowerCase().includes("credit")) creditCode = creditCode || "credit-normal";
      else packageCode = packageCode || "go";
    }

    const issueKind = creditCode ? "credit" : "package";
    const rewardCode = creditCode || packageCode;
    const rewardRow = await getFindDumpsRewardMeta(sb, rewardCode);
    const fallback = issueKind === "credit" ? FIND_DUMPS_CREDIT_FALLBACK[rewardCode] : FIND_DUMPS_PACKAGE_FALLBACK[rewardCode];
    const reward = rewardRow ?? fallback;

    if (!reward) {
      await sb.from("licenses_free_sessions").update({ status: "start_error", last_error: "FIND_DUMPS_REWARD_NOT_CONFIGURED" }).eq("session_id", sessionId);
      return json({ ok: false, message: "FIND_DUMPS_REWARD_NOT_CONFIGURED", session_id: sessionId, reward_code: rewardCode }, 409);
    }

    const rewardMode = String(reward.reward_mode || (issueKind === "credit" ? "soft_credit" : "plan"));
    const planCode = String(reward.plan_code ?? "").trim() || null;
    const softCreditAmount = Number(reward.soft_credit_amount ?? 0);
    const premiumCreditAmount = Number(reward.premium_credit_amount ?? 0);
    const entitlementSeconds = issueKind === "package" ? durationSeconds : 0;
    const title = `${String(reward.title ?? rewardCode)} ${String((keyType as any).label ?? "")}`.trim();
    const description = String(reward.description ?? `Admin test ${issueKind} ${rewardCode}`);

    let inserted: { id: string; redeem_key: string } | null = null;
    let lastRedeemInsertError = "";
    for (let attempt = 0; attempt < 12; attempt++) {
      const redeem_key = makeRedeemKey("FND");
      const ins = await sb.from("server_app_redeem_keys").insert({
        app_code: "find-dumps",
        redeem_key,
        title,
        description,
        enabled: true,
        starts_at: now.toISOString(),
        expires_at: expiresAt,
        max_redemptions: 1,
        redeemed_count: 0,
        reward_mode: rewardMode,
        plan_code: planCode,
        soft_credit_amount: softCreditAmount,
        premium_credit_amount: premiumCreditAmount,
        entitlement_days: 0,
        entitlement_seconds: entitlementSeconds,
        device_limit_override: reward.device_limit_override ?? null,
        account_limit_override: reward.account_limit_override ?? null,
        trace_id: traceId,
        source_free_session_id: sessionId,
        notes: `ADMIN_FREE_TEST;TRACE=${traceId};SESSION=${sessionId};KEY_TYPE=${keyType.code};APP=find-dumps`,
        metadata: {
          source: "admin-free-test",
          free_session_id: sessionId,
          trace_id: traceId,
          free_issue_kind: issueKind,
          package_code: packageCode || null,
          credit_code: creditCode || null,
          wallet_kind: issueKind === "credit" ? walletKind : null,
          key_type_code: keyType.code,
          key_signature: "FD",
          issued_at: now.toISOString(),
          claim_starts_entitlement: issueKind === "package",
          expires_from_claim: true,
          one_time_use: true,
          free_duration_seconds: durationSeconds,
        },
      }).select("id,redeem_key").single();

      if (!ins.error && ins.data?.id) {
        inserted = { id: String(ins.data.id), redeem_key: String(ins.data.redeem_key) };
        break;
      }
      lastRedeemInsertError = extractErrorMessage(ins.error);
    }

    if (!inserted) {
      await sb.from("licenses_free_sessions").update({ status: "start_error", last_error: "ADMIN_TEST_SERVER_REDEEM_INSERT_FAILED" }).eq("session_id", sessionId);
      await sb.from("licenses_free_security_logs").insert({
        event_type: "admin_test_error",
        route: "admin-free-test",
        ip_hash: ipHash,
        fingerprint_hash: fpHash,
        details: { reason: "SERVER_REDEEM_KEY_INSERT_FAILED", message: lastRedeemInsertError || "unknown", reward_code: rewardCode },
      });
      return json({ ok: false, message: "SERVER_REDEEM_KEY_INSERT_FAILED", session_id: sessionId, detail: lastRedeemInsertError || undefined }, 500);
    }

    await sb.from("licenses_free_issues").insert({
      license_id: null,
      key_mask: inserted.redeem_key,
      created_at: now.toISOString(),
      expires_at: expiresAt,
      session_id: sessionId,
      ip_hash: ipHash,
      fingerprint_hash: fpHash,
      ua_hash: uaHash,
      app_code: "find-dumps",
      key_signature: "FD",
      server_redeem_key_id: inserted.id,
    });

    await sb.from("licenses_free_sessions").update({
      status: "revealed",
      reveal_count: 1,
      revealed_at: now.toISOString(),
      issued_server_redeem_key_id: inserted.id,
      issued_server_reward_mode: rewardMode,
      app_code: "find-dumps",
      package_code: packageCode || null,
      credit_code: creditCode || null,
      wallet_kind: issueKind === "credit" ? walletKind : null,
      selection_meta: {
        app_code: "find-dumps",
        package_code: packageCode || null,
        credit_code: creditCode || null,
        wallet_kind: issueKind === "credit" ? walletKind : null,
        reward_mode: rewardMode,
        duration_seconds: durationSeconds,
        trace_id: traceId,
      },
    }).eq("session_id", sessionId);

    return json({ ok: true, message: "ADMIN_TEST_OK", key: inserted.redeem_key, expires_at: expiresAt, ip_hash: ipHash, fp_hash: fpHash, session_id: sessionId });
  }

  let fakeLagRule: any = null;
  if (appCode === "fake-lag") {
    const ruleRes = await sb.from("license_access_rules").select("*").eq("app_code", "fake-lag").maybeSingle();
    fakeLagRule = ruleRes.data ?? null;
    if (fakeLagRule && fakeLagRule.public_enabled === false) {
      return json({ ok: false, msg: "APP_KEY_DISABLED" }, 200);
    }
  }

  const keySignature = normalizePrefix(
    appCode === "fake-lag"
      ? (fakeLagRule?.key_prefix || "FAKELAG")
      : ((keyType as any).key_signature || "SUNNY"),
  );
  const fakeLagMaxDevices = Math.max(1, Number(fakeLagRule?.max_devices_per_key ?? 1));
  const fakeLagMaxIps = Math.max(1, Number(fakeLagRule?.max_ips_per_key ?? 1));
  const fakeLagMaxVerify = Math.max(1, Number(fakeLagRule?.max_verify_per_key ?? 1));

  let key = "";
  let licenseId = "";
  let lastLicenseInsertError = "";
  for (let attempt = 0; attempt < 12; attempt++) {
    key = makeKey(appCode === "fake-lag" ? keySignature : keySignature);
    const insLic = await sb
      .from("licenses")
      .insert({
        key,
        app_code: appCode,
        is_active: true,
        max_devices: appCode === "fake-lag" ? fakeLagMaxDevices : 1,
        max_ips: appCode === "fake-lag" ? fakeLagMaxIps : null,
        max_verify: appCode === "fake-lag" ? fakeLagMaxVerify : null,
        expires_at: expiresAt,
        note: `ADMIN_FREE_TEST_${String(keyType.code).toUpperCase()};APP=${appCode};SIG=${keySignature};RULE_SOURCE=${appCode === "fake-lag" ? "server_app_fake_lag" : "admin_free"}`,
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
    app_code: appCode,
    key_signature: keySignature,
  });

  await sb.from("licenses_free_sessions")
    .update({ status: "revealed", reveal_count: 1, revealed_at: now.toISOString(), revealed_license_id: licenseId })
    .eq("session_id", sessionId);

  return json({ ok: true, message: "ADMIN_TEST_OK", key, expires_at: expiresAt, ip_hash: ipHash, fp_hash: fpHash, session_id: sessionId });
});
