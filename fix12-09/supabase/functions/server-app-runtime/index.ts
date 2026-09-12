import { resolveClientIp } from "../_shared/client-ip.ts";
import { createAdminClient } from "../_shared/admin.ts";
import {
  bootstrapRuntimeState,
  buildRuntimeState,
  cleanupRuntimeOps,
  consumeRuntimeFeature,
  logRuntimeEvent,
  logoutRuntimeSession,
  redeemRuntimeKey,
  runtimeJson,
  sha256Hex,
  touchRuntimeSession,
  unlockRuntimeFeatureAccess,
} from "../_shared/server_app_runtime.ts";

function text(value: unknown, fallback = "") {
  const raw = String(value ?? fallback).trim();
  return raw || fallback;
}
function lowerText(value: unknown, fallback = "") {
  return text(value, fallback).toLowerCase();
}
function statusOf(error: any) {
  const n = Number(error?.status ?? 500);
  if (!Number.isFinite(n)) return 500;
  return Math.max(200, Math.min(599, Math.trunc(n)));
}
function codeOf(error: any) {
  return String(error?.code ?? error?.message ?? "SERVER_ERROR").trim() || "SERVER_ERROR";
}
function friendly(code: string) {
  switch (code) {
    case "SESSION_BOOTSTRAP_REQUIRED":
    case "SESSION_NOT_FOUND":
    case "SESSION_EXPIRED":
    case "SESSION_INACTIVE":
      return "Phiên làm việc đã hết hạn. Hãy bấm Làm mới từ server rồi thử lại.";
    case "INSUFFICIENT_SOFT_BALANCE":
    case "INSUFFICIENT_PREMIUM_BALANCE":
    case "INSUFFICIENT_BALANCE_FOR_EITHER_WALLET":
      return "Số dư hiện tại chưa đủ để tiếp tục. Hãy chọn ví khác, nhận free hoặc liên hệ admin nạp thêm.";
    case "FEATURE_PLAN_LOCKED":
      return "Gói hiện tại chưa mở quyền cho chức năng này.";
    case "UNLOCK_RULE_NOT_FOUND":
      return "Server chưa có rule mở khóa cho chức năng này. Hãy báo admin đồng bộ Runtime.";
    default:
      return code;
  }
}
function ok(body: Record<string, unknown>, origin?: string | null) {
  return runtimeJson(200, { ok: true, ...body }, origin);
}
function fail(error: any, origin?: string | null) {
  const code = codeOf(error);
  const hint = statusOf(error);
  const business = hint >= 400 && hint < 500;
  return runtimeJson(business ? 200 : hint, { ok: false, code, msg: friendly(code), message: friendly(code), http_status_hint: hint }, origin);
}
function isRetryableSessionError(error: any) {
  const code = codeOf(error);
  return [
    "SESSION_BOOTSTRAP_REQUIRED",
    "SESSION_NOT_FOUND",
    "SESSION_EXPIRED",
    "SESSION_INACTIVE",
    "SESSION_IDLE_TIMEOUT",
    "SESSION_MAX_AGE_EXPIRED",
    "ENTITLEMENT_INACTIVE",
    "ENTITLEMENT_EXPIRED",
    "ENTITLEMENT_REVOKED",
  ].includes(code);
}
function isDuplicateUnlockError(error: any) {
  const blob = `${String(error?.code ?? "")} ${String(error?.message ?? "")} ${String(error?.details ?? "")}`.toLowerCase();
  return blob.includes("23505")
    || blob.includes("duplicate key")
    || blob.includes("server_app_feature_unlocks_active_unique")
    || blob.includes("server_app_feature_unlocks_active_account_unique");
}
function accountAliases(value: unknown) {
  const normalized = lowerText(value);
  if (!normalized) return [] as string[];
  const aliases = new Set<string>();
  aliases.add(normalized);
  const at = normalized.indexOf("@");
  if (at > 0) aliases.add(normalized.slice(0, at));
  return Array.from(aliases.values());
}
function stateHasUnlock(state: any, accessCode: string) {
  const code = lowerText(accessCode);
  const features = Array.isArray(state?.features) ? state.features : [];
  return features.some((feature: any) => {
    const unlockCode = lowerText(feature?.unlock_feature_code || feature?.feature_code);
    return unlockCode === code && Boolean(feature?.unlocked);
  });
}
async function findExistingActiveUnlock(appCode: string, accountRef: string, accessCode: string) {
  const aliases = accountAliases(accountRef);
  const normalizedAccess = lowerText(accessCode);
  if (!aliases.length || !normalizedAccess) return null;
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("server_app_feature_unlocks")
    .select("id,app_code,access_code,account_ref,device_id,status,started_at,expires_at,revoked_at")
    .eq("app_code", appCode)
    .eq("access_code", normalizedAccess)
    .in("account_ref", aliases)
    .eq("status", "active")
    .is("revoked_at", null)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("expires_at", { ascending: false, nullsFirst: true })
    .limit(1);
  if (error) throw error;
  return Array.isArray(data) && data.length ? data[0] as Record<string, unknown> : null;
}
async function rebindExistingUnlockToAccount(unlock: Record<string, unknown>, accountRef: string, traceId?: string | null) {
  const id = text(unlock.id);
  const normalizedAccount = lowerText(accountRef);
  if (!id || !normalizedAccount) return;
  const admin = createAdminClient();
  const patch: Record<string, unknown> = {
    account_ref: normalizedAccount,
    device_id: null,
    updated_at: new Date().toISOString(),
  };
  if (traceId) patch.trace_id = traceId;
  const { error } = await admin
    .from("server_app_feature_unlocks")
    .update(patch)
    .eq("id", id);
  if (error && !isDuplicateUnlockError(error)) throw error;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": origin ?? "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-fp, x-admin-key", "access-control-allow-methods": "POST,OPTIONS", "access-control-max-age": "86400", "vary": "origin" } });
  if (req.method !== "POST") return runtimeJson(405, { ok: false, code: "METHOD_NOT_ALLOWED", msg: "METHOD_NOT_ALLOWED" }, origin);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return runtimeJson(200, { ok: false, code: "BAD_JSON", msg: "BAD_JSON", http_status_hint: 400 }, origin);
  }

  const action = text(body.action || body.mode || "me").toLowerCase();
  const appCode = text(body.app_code, "find-dumps");
  const sessionToken = text(body.session_token);
  const accountRef = lowerText(body.account_ref);
  const deviceId = text(body.device_id);
  const hintedDeviceId = deviceId || text(req.headers.get("x-fp"));
  const clientVersion = text(body.client_version || body.client_build_id || body.client_build);
  const ip = resolveClientIp(req) ?? "";
  const ipHash = ip ? await sha256Hex(ip) : null;

  try {
    const bootstrapForCurrentRequest = async (seedToken?: string | null) => bootstrapRuntimeState(appCode, {
      sessionToken: seedToken || null,
      accountRef: accountRef || null,
      deviceId: hintedDeviceId || null,
      clientVersion,
      ipHash,
    });

    if (action === "health") return ok({ app_code: appCode, status: "ok" }, origin);

    if (action === "me" || action === "catalog") {
      const boot = await bootstrapForCurrentRequest(sessionToken || null);
      return ok({ state: boot.state, session_token: boot.sessionToken, session_bound: boot.sessionBound, account_ref: boot.bootstrapAccountRef, device_id: boot.bootstrapDeviceId }, origin);
    }

    if (action === "heartbeat") {
      if (!sessionToken) {
        const boot = await bootstrapForCurrentRequest(null);
        return ok({ state: boot.state, session_token: boot.sessionToken, session_bound: boot.sessionBound, active: Boolean(boot.sessionToken), recovered: Boolean(boot.sessionToken) }, origin);
      }
      try {
        await touchRuntimeSession(appCode, sessionToken, { clientVersion, ipHash });
        const state = await buildRuntimeState(appCode, { sessionToken, accountRef, deviceId: hintedDeviceId });
        return ok({ state, session_token: sessionToken, session_bound: true, active: true }, origin);
      } catch (error) {
        if (!isRetryableSessionError(error) || !accountRef || !hintedDeviceId) throw error;
        const boot = await bootstrapForCurrentRequest(null);
        return ok({ state: boot.state, session_token: boot.sessionToken, session_bound: boot.sessionBound, active: Boolean(boot.sessionToken), recovered: true, previous_code: codeOf(error) }, origin);
      }
    }

    if (action === "redeem") {
      const result = await redeemRuntimeKey({
        appCode,
        redeemKey: text(body.redeem_key || body.key),
        traceId: text(body.trace_id),
        accountRef,
        deviceId: hintedDeviceId,
        clientVersion,
        ipHash,
        forceSessionRotate: Boolean(body.force_session_rotate || body.rotate_existing_session || body.redeem_device_rotate),
        rotateExistingSession: Boolean(body.rotate_existing_session || body.redeem_device_rotate),
        recoverAccountEntitlement: Boolean(body.recover_account_entitlement ?? true),
      } as any);
      return ok({ ...result, session_token: (result as any).session_token, session_bound: true }, origin);
    }

    if (action === "consume") {
      let effectiveSessionToken = sessionToken;
      const tryConsume = () => consumeRuntimeFeature({
        appCode,
        sessionToken: effectiveSessionToken,
        featureCode: text(body.feature_code),
        walletKind: text(body.wallet_kind, "auto"),
        quantity: Number(body.quantity ?? 1),
        traceId: text(body.trace_id),
      });
      if (!effectiveSessionToken && accountRef && hintedDeviceId) {
        const boot = await bootstrapForCurrentRequest(null);
        effectiveSessionToken = text(boot.sessionToken);
      }
      if (!effectiveSessionToken) throw Object.assign(new Error("SESSION_BOOTSTRAP_REQUIRED"), { status: 409, code: "SESSION_BOOTSTRAP_REQUIRED" });
      try {
        const result = await tryConsume();
        return ok({ ...result, session_token: effectiveSessionToken, session_bound: true }, origin);
      } catch (error) {
        if (!isRetryableSessionError(error) || !accountRef || !hintedDeviceId) throw error;
        const boot = await bootstrapForCurrentRequest(null);
        effectiveSessionToken = text(boot.sessionToken);
        if (!effectiveSessionToken) throw error;
        const result = await tryConsume();
        return ok({ ...result, session_token: effectiveSessionToken, session_bound: true, recovered: true }, origin);
      }
    }

    if (action === "unlock_feature") {
      const accessCode = lowerText(body.access_code || body.feature_code);
      if (!accessCode) throw Object.assign(new Error("MISSING_FEATURE_CODE"), { status: 400, code: "MISSING_FEATURE_CODE" });

      let effectiveSessionToken = sessionToken;
      const traceId = text(body.trace_id);
      const existingUnlock = accountRef ? await findExistingActiveUnlock(appCode, accountRef, accessCode) : null;
      if (existingUnlock) {
        await rebindExistingUnlockToAccount(existingUnlock, accountRef, traceId || null);
        const boot = await bootstrapForCurrentRequest(effectiveSessionToken || null);
        effectiveSessionToken = text(boot.sessionToken || effectiveSessionToken);
        const state = boot.state ?? await buildRuntimeState(appCode, { sessionToken: effectiveSessionToken, accountRef, deviceId: hintedDeviceId });
        if (stateHasUnlock(state, accessCode)) {
          return ok({ access_code: accessCode, unlock_feature_code: accessCode, unlocked: true, expires_at: existingUnlock.expires_at ?? null, state, session_token: effectiveSessionToken, session_bound: Boolean(effectiveSessionToken), recovered_existing_unlock: true }, origin);
        }
      }

      const tryUnlock = () => unlockRuntimeFeatureAccess({
        appCode,
        sessionToken: effectiveSessionToken,
        accessCode,
        walletKind: text(body.wallet_kind, "auto"),
        durationSeconds: Number(body.duration_seconds ?? 0),
        traceId,
      });
      if (!effectiveSessionToken && accountRef && hintedDeviceId) {
        const boot = await bootstrapForCurrentRequest(null);
        effectiveSessionToken = text(boot.sessionToken);
      }
      if (!effectiveSessionToken) throw Object.assign(new Error("SESSION_BOOTSTRAP_REQUIRED"), { status: 409, code: "SESSION_BOOTSTRAP_REQUIRED" });
      try {
        const result = await tryUnlock();
        return ok({ ...result, session_token: effectiveSessionToken, session_bound: true }, origin);
      } catch (error) {
        if ((isRetryableSessionError(error) || isDuplicateUnlockError(error)) && accountRef && hintedDeviceId) {
          const boot = await bootstrapForCurrentRequest(null);
          effectiveSessionToken = text(boot.sessionToken || effectiveSessionToken);
          if (isDuplicateUnlockError(error)) {
            const state = boot.state ?? await buildRuntimeState(appCode, { sessionToken: effectiveSessionToken, accountRef, deviceId: hintedDeviceId });
            if (stateHasUnlock(state, accessCode)) {
              return ok({ access_code: accessCode, unlock_feature_code: accessCode, unlocked: true, state, session_token: effectiveSessionToken, session_bound: Boolean(effectiveSessionToken), recovered_existing_unlock: true, duplicate_recovered: true }, origin);
            }
          }
          if (effectiveSessionToken && isRetryableSessionError(error)) {
            const result = await tryUnlock();
            return ok({ ...result, session_token: effectiveSessionToken, session_bound: true, recovered: true }, origin);
          }
        }
        throw error;
      }
    }

    if (action === "logout") {
      if (sessionToken) await logoutRuntimeSession(appCode, sessionToken);
      return ok({ logged_out: true, session_bound: false }, origin);
    }

    if (action === "cleanup") {
      const result = await cleanupRuntimeOps(appCode);
      return ok({ result }, origin);
    }

    await logRuntimeEvent({ app_code: appCode, event_type: "runtime_bad_action", ok: false, code: "UNKNOWN_ACTION", account_ref: accountRef || null, device_id: hintedDeviceId || null, meta: { action } });
    return runtimeJson(200, { ok: false, code: "UNKNOWN_ACTION", msg: "UNKNOWN_ACTION", http_status_hint: 400 }, origin);
  } catch (error) {
    try {
      await logRuntimeEvent({ app_code: appCode, event_type: `runtime_${action}_error`, ok: false, code: codeOf(error), account_ref: accountRef || null, device_id: hintedDeviceId || null, meta: { message: String((error as any)?.message ?? error) } });
    } catch {
      // ignore audit failures
    }
    return fail(error, origin);
  }
});
