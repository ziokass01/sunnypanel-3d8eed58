import { createClient } from "npm:@supabase/supabase-js@2";
import { createAdminClient } from "../_shared/admin.ts";
import { adjustRuntimeWalletBalance, cleanupRuntimeOps } from "../_shared/server_app_runtime.ts";

function getAllowedOrigin(origin: string | null | undefined) {
  const incoming = String(origin ?? "").trim();
  const publicBase = String(Deno.env.get("PUBLIC_BASE_URL") ?? "").trim();
  return incoming || publicBase || "*";
}

function opsJson(status: number, body: unknown, origin?: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": getAllowedOrigin(origin),
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-fp, x-admin-key",
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-max-age": "86400",
      "vary": "origin",
    },
  });
}

function parseAdminEmails(raw: string | undefined | null): Set<string> {
  return new Set(
    String(raw ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function assertOpsAdmin(req: Request): Promise<{ ok: true } | { ok: false; status: number; body: { ok: false; code: string; msg: string } }> {
  const runtimeOpsAdminKey = String(Deno.env.get("RUNTIME_OPS_ADMIN_KEY") ?? "").trim();
  const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "").trim();

  const authHeader = String(req.headers.get("Authorization") ?? "").trim();
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : authHeader;
  const apiKeyHeader = String(req.headers.get("apikey") ?? "").trim();
  const adminKeyHeader = String(req.headers.get("x-admin-key") ?? "").trim();
  const tokenCandidates = [adminKeyHeader, apiKeyHeader, bearerToken].filter(Boolean);

  const directKeys = [runtimeOpsAdminKey, serviceRoleKey].filter(Boolean);
  if (tokenCandidates.some((token) => directKeys.includes(token))) {
    return { ok: true };
  }

  const token = bearerToken || apiKeyHeader;
  if (!token) {
    return { ok: false, status: 401, body: { ok: false, code: "UNAUTHORIZED", msg: "Admin required" } };
  }

  if (!supabaseUrl || !(anonKey || serviceRoleKey)) {
    return { ok: false, status: 500, body: { ok: false, code: "SERVER_MISCONFIG_MISSING_SECRET", msg: "Admin verifier not configured" } };
  }

  const verifierKey = anonKey || serviceRoleKey;
  const authed = createClient(supabaseUrl, verifierKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userErr } = await authed.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) {
    return { ok: false, status: 401, body: { ok: false, code: "UNAUTHORIZED", msg: "Admin required" } };
  }

  const adminEmails = parseAdminEmails(Deno.env.get("ADMIN_EMAILS"));
  const userEmail = String(user.email ?? "").toLowerCase();
  const emailAllowed = userEmail ? adminEmails.has(userEmail) : false;
  const metadataAdmin = user.user_metadata?.is_admin === true || user.app_metadata?.is_admin === true || user.app_metadata?.panel_role === "admin";
  const roleCheck = await authed.rpc("has_role", { _user_id: user.id, _role: "admin" });
  const roleAllowed = !roleCheck.error && roleCheck.data === true;

  if (!emailAllowed && !metadataAdmin && !roleAllowed) {
    return { ok: false, status: 401, body: { ok: false, code: "UNAUTHORIZED", msg: "Admin required" } };
  }

  return { ok: true };
}

type OpsAction =
  | "cleanup"
  | "adjust_wallet"
  | "account_snapshot"
  | "redeem_preview"
  | "revoke_session"
  | "restore_session"
  | "hard_delete_session"
  | "revoke_entitlement"
  | "restore_entitlement"
  | "hard_delete_entitlement";

function asString(value: unknown, fallback = "") {
  const v = String(value ?? fallback).trim();
  return v || fallback;
}

function asNullableString(value: unknown) {
  const v = String(value ?? "").trim();
  return v || null;
}

function asNumber(value: unknown, fallback = 0) {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

function getNowIso() {
  return new Date().toISOString();
}

function buildFriendlyError(code: string, message: string) {
  const MAP: Record<string, string> = {
    UNKNOWN_ACTION: "Ops action không hợp lệ.",
    MISSING_APP_CODE: "Thiếu app_code.",
    MISSING_ACCOUNT_REF: "Thiếu account_ref.",
    MISSING_REDEEM_KEY: "Thiếu redeem_key để xem preview.",
    REDEEM_KEY_NOT_FOUND: "Redeem key không tồn tại hoặc đã gõ sai.",
    REDEEM_KEY_DISABLED: "Redeem key đang bị tắt.",
    REDEEM_KEY_BLOCKED: "Redeem key đang bị khóa.",
    REDEEM_KEY_NOT_STARTED: "Redeem key chưa đến giờ bắt đầu.",
    REDEEM_KEY_EXPIRED: "Redeem key đã hết hạn.",
    REDEEM_KEY_LIMIT_REACHED: "Redeem key đã hết lượt dùng tối đa.",
    SESSION_NOT_FOUND: "Không tìm thấy session cần xử lý.",
    ENTITLEMENT_NOT_FOUND: "Không tìm thấy entitlement cần xử lý.",
    ACTIVE_SESSION_DELETE_BLOCKED: "Chỉ được xóa vĩnh viễn session đã revoke / logged_out / expired.",
    ACTIVE_ENTITLEMENT_DELETE_BLOCKED: "Chỉ được xóa vĩnh viễn entitlement không còn active.",
    EMPTY_ADJUSTMENT: "Bạn chưa nhập số cộng hoặc trừ cho ví.",
    NEGATIVE_SOFT_BALANCE: "Không thể làm credit thường âm.",
    NEGATIVE_PREMIUM_BALANCE: "Không thể làm credit kim cương âm.",
    WALLET_BALANCE_CONFLICT: "Ví vừa bị thay đổi ở nơi khác. Hãy tải lại rồi thử lại.",
  };
  return MAP[code] ?? message;
}

function isFutureIso(iso: string | null | undefined) {
  if (!iso) return false;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) && ms > Date.now();
}

function normalizeRewardSource(keyRow: any, pkg: any | null) {
  const rewardMode = asString(keyRow?.reward_mode, pkg ? asString(pkg?.reward_mode, "package") : "mixed");
  const packageLinked = Boolean(keyRow?.reward_package_id);
  const packageActive = Boolean(pkg?.enabled ?? false);
  const usePackage = packageLinked && rewardMode === "package" && packageActive;

  const resolved = {
    source: usePackage ? "package" : "inline_key",
    reward_mode: usePackage ? asString(pkg?.reward_mode, rewardMode) : rewardMode,
    package_code: usePackage ? asNullableString(pkg?.package_code) : null,
    title: usePackage ? asNullableString(pkg?.title) : asNullableString(keyRow?.title),
    plan_code: usePackage ? asNullableString(pkg?.plan_code) : asNullableString(keyRow?.plan_code),
    soft_credit_amount: round2(asNumber(usePackage ? pkg?.soft_credit_amount : keyRow?.soft_credit_amount, 0)),
    premium_credit_amount: round2(asNumber(usePackage ? pkg?.premium_credit_amount : keyRow?.premium_credit_amount, 0)),
    entitlement_days: Math.max(0, Math.trunc(asNumber(usePackage ? pkg?.entitlement_days : keyRow?.entitlement_days, 0))),
    device_limit_override: (() => {
      const value = usePackage ? pkg?.device_limit_override : keyRow?.device_limit_override;
      return value == null ? null : Math.trunc(asNumber(value, 0));
    })(),
    account_limit_override: (() => {
      const value = usePackage ? pkg?.account_limit_override : keyRow?.account_limit_override;
      return value == null ? null : Math.trunc(asNumber(value, 0));
    })(),
  };

  const notes: string[] = [];
  if (packageLinked && rewardMode !== "package") {
    notes.push("Key đang gắn package nhưng reward_mode không phải package, nên preview này lấy reward trực tiếp từ key.");
  }
  if (packageLinked && rewardMode === "package" && !packageActive) {
    notes.push("Key đang gắn package nhưng package đang tắt hoặc thiếu dữ liệu.");
  }
  if (!resolved.plan_code && !resolved.soft_credit_amount && !resolved.premium_credit_amount && !resolved.entitlement_days) {
    notes.push("Reward hiện tại không mở plan, không cộng credit và không thêm ngày entitlement.");
  }

  return { resolved, notes };
}

async function getAccountSnapshot(params: { appCode: string; accountRef: string; deviceId?: string | null }) {
  const admin = createAdminClient();
  const accountRef = asString(params.accountRef);
  if (!accountRef) {
    throw Object.assign(new Error("MISSING_ACCOUNT_REF"), { status: 400, code: "MISSING_ACCOUNT_REF" });
  }

  let entitlementsQuery = admin
    .from("server_app_entitlements")
    .select("id,account_ref,device_id,plan_code,status,starts_at,expires_at,revoked_at,revoke_reason,created_at")
    .eq("app_code", params.appCode)
    .eq("account_ref", accountRef)
    .order("created_at", { ascending: false })
    .limit(20);

  let walletsQuery = admin
    .from("server_app_wallet_balances")
    .select("id,account_ref,device_id,soft_balance,premium_balance,last_soft_reset_at,last_premium_reset_at,updated_at")
    .eq("app_code", params.appCode)
    .eq("account_ref", accountRef)
    .order("updated_at", { ascending: false })
    .limit(10);

  let sessionsQuery = admin
    .from("server_app_sessions")
    .select("id,account_ref,device_id,status,started_at,last_seen_at,expires_at,revoked_at,revoke_reason,client_version")
    .eq("app_code", params.appCode)
    .eq("account_ref", accountRef)
    .order("last_seen_at", { ascending: false })
    .limit(20);

  let txQuery = admin
    .from("server_app_wallet_transactions")
    .select("id,account_ref,device_id,feature_code,transaction_type,wallet_kind,soft_delta,premium_delta,soft_balance_after,premium_balance_after,note,created_at")
    .eq("app_code", params.appCode)
    .eq("account_ref", accountRef)
    .order("created_at", { ascending: false })
    .limit(30);

  let eventsQuery = admin
    .from("server_app_runtime_events")
    .select("id,event_type,ok,code,message,account_ref,device_id,feature_code,wallet_kind,client_version,meta,created_at")
    .eq("app_code", params.appCode)
    .eq("account_ref", accountRef)
    .order("created_at", { ascending: false })
    .limit(30);

  const deviceId = asNullableString(params.deviceId);
  if (deviceId) {
    entitlementsQuery = entitlementsQuery.eq("device_id", deviceId);
    walletsQuery = walletsQuery.eq("device_id", deviceId);
    sessionsQuery = sessionsQuery.eq("device_id", deviceId);
    txQuery = txQuery.eq("device_id", deviceId);
    eventsQuery = eventsQuery.eq("device_id", deviceId);
  }

  const [entitlementsRes, walletsRes, sessionsRes, txRes, eventsRes] = await Promise.all([
    entitlementsQuery,
    walletsQuery,
    sessionsQuery,
    txQuery,
    eventsQuery,
  ]);

  const firstError = [entitlementsRes, walletsRes, sessionsRes, txRes, eventsRes].find((item: any) => item.error)?.error;
  if (firstError) throw firstError;

  return {
    account_ref: accountRef,
    device_id: deviceId,
    entitlements: entitlementsRes.data ?? [],
    wallets: walletsRes.data ?? [],
    sessions: sessionsRes.data ?? [],
    transactions: txRes.data ?? [],
    events: eventsRes.data ?? [],
  };
}

async function getRedeemPreview(params: { appCode: string; redeemKey: string }) {
  const admin = createAdminClient();
  const redeemKey = asString(params.redeemKey);
  if (!redeemKey) {
    throw Object.assign(new Error("MISSING_REDEEM_KEY"), { status: 400, code: "MISSING_REDEEM_KEY" });
  }

  const { data: keyRow, error } = await admin
    .from("server_app_redeem_keys")
    .select("id,reward_package_id,redeem_key,title,enabled,starts_at,expires_at,max_redemptions,redeemed_count,reward_mode,plan_code,soft_credit_amount,premium_credit_amount,entitlement_days,device_limit_override,account_limit_override,blocked_at,blocked_reason")
    .eq("app_code", params.appCode)
    .eq("redeem_key", redeemKey)
    .maybeSingle();
  if (error) throw error;
  if (!keyRow) {
    throw Object.assign(new Error("REDEEM_KEY_NOT_FOUND"), { status: 404, code: "REDEEM_KEY_NOT_FOUND" });
  }

  let pkg: any | null = null;
  if ((keyRow as any).reward_package_id) {
    const { data: pkgData, error: pkgError } = await admin
      .from("server_app_reward_packages")
      .select("id,package_code,title,enabled,reward_mode,plan_code,soft_credit_amount,premium_credit_amount,entitlement_days,device_limit_override,account_limit_override")
      .eq("id", (keyRow as any).reward_package_id)
      .maybeSingle();
    if (pkgError) throw pkgError;
    pkg = pkgData ?? null;
  }

  const { resolved, notes } = normalizeRewardSource(keyRow, pkg);

  const statusChecks = {
    enabled: Boolean((keyRow as any).enabled ?? true),
    blocked: Boolean((keyRow as any).blocked_at),
    not_started: Boolean((keyRow as any).starts_at && new Date(String((keyRow as any).starts_at)).getTime() > Date.now()),
    expired: Boolean((keyRow as any).expires_at && !isFutureIso(String((keyRow as any).expires_at))),
    limit_reached: Math.max(0, Math.trunc(asNumber((keyRow as any).redeemed_count, 0))) >= Math.max(1, Math.trunc(asNumber((keyRow as any).max_redemptions, 1))),
  };

  return {
    key: keyRow,
    package: pkg,
    reward_preview: resolved,
    reward_notes: notes,
    status_checks: statusChecks,
  };
}

async function updateSessionStatus(params: { sessionId: string; status: "revoked" | "active"; reason?: string | null }) {
  const admin = createAdminClient();
  const sessionId = asString(params.sessionId);
  if (!sessionId) {
    throw Object.assign(new Error("SESSION_NOT_FOUND"), { status: 404, code: "SESSION_NOT_FOUND" });
  }

  const { data: current, error: currentError } = await admin
    .from("server_app_sessions")
    .select("id,app_code,account_ref,device_id,status,revoked_at,revoke_reason,last_seen_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw Object.assign(new Error("SESSION_NOT_FOUND"), { status: 404, code: "SESSION_NOT_FOUND" });

  const nowIso = getNowIso();

  if (params.status === "active") {
    let revokeOthersQuery = admin
      .from("server_app_sessions")
      .update({
        status: "revoked",
        revoked_at: nowIso,
        revoke_reason: "Revoked automatically before restoring another session",
        updated_at: nowIso,
      })
      .eq("app_code", asString((current as any).app_code))
      .eq("account_ref", asString((current as any).account_ref))
      .eq("status", "active")
      .neq("id", sessionId);

    const currentDeviceId = (current as any).device_id;
    revokeOthersQuery = currentDeviceId == null
      ? revokeOthersQuery.is("device_id", null)
      : revokeOthersQuery.eq("device_id", asString(currentDeviceId));

    const { error: revokeOthersError } = await revokeOthersQuery;
    if (revokeOthersError) throw revokeOthersError;
  }

  const patch = params.status === "active"
    ? {
        status: "active",
        revoked_at: null,
        revoke_reason: null,
        last_seen_at: nowIso,
        updated_at: nowIso,
      }
    : {
        status: "revoked",
        revoked_at: nowIso,
        revoke_reason: asNullableString(params.reason) ?? "Revoked from runtime ops",
        updated_at: nowIso,
      };

  const { data, error } = await admin
    .from("server_app_sessions")
    .update(patch)
    .eq("id", sessionId)
    .select("id,account_ref,device_id,status,revoked_at,revoke_reason,last_seen_at")
    .maybeSingle();
  if (error) {
    if ((error as any)?.code === "23505") {
      throw Object.assign(new Error("SESSION_RESTORE_CONFLICT"), {
        status: 409,
        code: "SESSION_RESTORE_CONFLICT",
      });
    }
    throw error;
  }
  if (!data) throw Object.assign(new Error("SESSION_NOT_FOUND"), { status: 404, code: "SESSION_NOT_FOUND" });
  return data;
}

async function updateEntitlementStatus(params: { entitlementId: string; status: "revoked" | "active"; reason?: string | null }) {
  const admin = createAdminClient();
  const entitlementId = asString(params.entitlementId);
  if (!entitlementId) {
    throw Object.assign(new Error("ENTITLEMENT_NOT_FOUND"), { status: 404, code: "ENTITLEMENT_NOT_FOUND" });
  }
  const patch = params.status === "active"
    ? {
        status: "active",
        revoked_at: null,
        revoke_reason: null,
        updated_at: getNowIso(),
      }
    : {
        status: "revoked",
        revoked_at: getNowIso(),
        revoke_reason: asNullableString(params.reason) ?? "Revoked from runtime ops",
        updated_at: getNowIso(),
      };

  const { data, error } = await admin
    .from("server_app_entitlements")
    .update(patch)
    .eq("id", entitlementId)
    .select("id,account_ref,device_id,plan_code,status,revoked_at,revoke_reason,expires_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("ENTITLEMENT_NOT_FOUND"), { status: 404, code: "ENTITLEMENT_NOT_FOUND" });
  return data;
}


async function hardDeleteSession(params: { sessionId: string }) {
  const admin = createAdminClient();
  const sessionId = asString(params.sessionId);
  if (!sessionId) {
    throw Object.assign(new Error("SESSION_NOT_FOUND"), { status: 404, code: "SESSION_NOT_FOUND" });
  }

  const { data: current, error: currentError } = await admin
    .from("server_app_sessions")
    .select("id,app_code,account_ref,device_id,status,revoked_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw Object.assign(new Error("SESSION_NOT_FOUND"), { status: 404, code: "SESSION_NOT_FOUND" });
  if (String((current as any).status ?? "") === "active") {
    throw Object.assign(new Error("ACTIVE_SESSION_DELETE_BLOCKED"), { status: 409, code: "ACTIVE_SESSION_DELETE_BLOCKED" });
  }

  const { error } = await admin
    .from("server_app_sessions")
    .delete()
    .eq("id", sessionId);
  if (error) throw error;
  return { id: sessionId, deleted: true, account_ref: (current as any).account_ref, device_id: (current as any).device_id, status: (current as any).status };
}

async function hardDeleteEntitlement(params: { entitlementId: string }) {
  const admin = createAdminClient();
  const entitlementId = asString(params.entitlementId);
  if (!entitlementId) {
    throw Object.assign(new Error("ENTITLEMENT_NOT_FOUND"), { status: 404, code: "ENTITLEMENT_NOT_FOUND" });
  }

  const { data: current, error: currentError } = await admin
    .from("server_app_entitlements")
    .select("id,account_ref,device_id,plan_code,status,revoked_at")
    .eq("id", entitlementId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw Object.assign(new Error("ENTITLEMENT_NOT_FOUND"), { status: 404, code: "ENTITLEMENT_NOT_FOUND" });
  if (String((current as any).status ?? "") === "active") {
    throw Object.assign(new Error("ACTIVE_ENTITLEMENT_DELETE_BLOCKED"), { status: 409, code: "ACTIVE_ENTITLEMENT_DELETE_BLOCKED" });
  }

  const { error } = await admin
    .from("server_app_entitlements")
    .delete()
    .eq("id", entitlementId);
  if (error) throw error;
  return { id: entitlementId, deleted: true, account_ref: (current as any).account_ref, device_id: (current as any).device_id, plan_code: (current as any).plan_code, status: (current as any).status };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";

  if (req.method === "OPTIONS") {
    return opsJson(200, { ok: true }, origin);
  }

  if (req.method !== "POST") {
    return opsJson(405, { ok: false, code: "METHOD_NOT_ALLOWED", message: "POST only" }, origin);
  }

  const adminCheck = await assertOpsAdmin(req);
  if (!adminCheck.ok) {
    return opsJson(adminCheck.status, adminCheck.body, origin);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = asString(body?.action).toLowerCase() as OpsAction;
    const appCode = asString(body?.app_code);
    if (!appCode) {
      return opsJson(400, { ok: false, code: "MISSING_APP_CODE", message: "Missing app_code" }, origin);
    }

    if (action === "cleanup") {
      const result = await cleanupRuntimeOps(appCode);
      return opsJson(200, { ok: true, action, result }, origin);
    }

    if (action === "adjust_wallet") {
      const result = await adjustRuntimeWalletBalance({
        appCode,
        accountRef: asString(body?.account_ref),
        deviceId: asString(body?.device_id) || null,
        softDelta: Number(body?.soft_delta ?? 0),
        premiumDelta: Number(body?.premium_delta ?? 0),
        note: asString(body?.note) || null,
        metadata: typeof body?.metadata === "object" && body?.metadata ? body.metadata : { source: "runtime_ops_function" },
      });
      return opsJson(200, { ok: true, action, result }, origin);
    }

    if (action === "account_snapshot") {
      const result = await getAccountSnapshot({
        appCode,
        accountRef: asString(body?.account_ref),
        deviceId: asString(body?.device_id) || null,
      });
      return opsJson(200, { ok: true, action, result }, origin);
    }

    if (action === "redeem_preview") {
      const result = await getRedeemPreview({
        appCode,
        redeemKey: asString(body?.redeem_key),
      });
      return opsJson(200, { ok: true, action, result }, origin);
    }

    if (action === "revoke_session") {
      const result = await updateSessionStatus({
        sessionId: asString(body?.session_id),
        status: "revoked",
        reason: asNullableString(body?.reason),
      });
      return opsJson(200, { ok: true, action, result }, origin);
    }

    if (action === "restore_session") {
      const result = await updateSessionStatus({
        sessionId: asString(body?.session_id),
        status: "active",
      });
      return opsJson(200, { ok: true, action, result }, origin);
    }

    if (action === "hard_delete_session") {
      const result = await hardDeleteSession({
        sessionId: asString(body?.session_id),
      });
      return opsJson(200, { ok: true, action, result }, origin);
    }

    if (action === "revoke_entitlement") {
      const result = await updateEntitlementStatus({
        entitlementId: asString(body?.entitlement_id),
        status: "revoked",
        reason: asNullableString(body?.reason),
      });
      return opsJson(200, { ok: true, action, result }, origin);
    }

    if (action === "restore_entitlement") {
      const result = await updateEntitlementStatus({
        entitlementId: asString(body?.entitlement_id),
        status: "active",
      });
      return opsJson(200, { ok: true, action, result }, origin);
    }

    if (action === "hard_delete_entitlement") {
      const result = await hardDeleteEntitlement({
        entitlementId: asString(body?.entitlement_id),
      });
      return opsJson(200, { ok: true, action, result }, origin);
    }

    return opsJson(400, { ok: false, code: "UNKNOWN_ACTION", message: "Unknown runtime ops action" }, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = Number((error as any)?.status ?? 500);
    const code = asString((error as any)?.code, status >= 500 ? "SERVER_ERROR" : "BAD_REQUEST");
    return opsJson(status, {
      ok: false,
      code,
      message,
      friendly_message: buildFriendlyError(code, message),
    }, origin);
  }
});
