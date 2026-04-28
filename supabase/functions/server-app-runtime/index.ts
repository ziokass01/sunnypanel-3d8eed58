import { resolveClientIp } from "../_shared/client-ip.ts";
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
  const accountRef = text(body.account_ref).toLowerCase();
  const deviceId = text(body.device_id);
  const clientVersion = text(body.client_version || body.client_build_id || body.client_build);
  const ip = resolveClientIp(req) ?? "";
  const ipHash = ip ? await sha256Hex(ip) : null;

  try {
    if (action === "health") return ok({ app_code: appCode, status: "ok" }, origin);

    if (action === "me" || action === "catalog") {
      const boot = await bootstrapRuntimeState(appCode, { sessionToken, accountRef, deviceId, clientVersion, ipHash });
      return ok({ state: boot.state, session_token: boot.sessionToken, session_bound: boot.sessionBound, account_ref: boot.bootstrapAccountRef, device_id: boot.bootstrapDeviceId }, origin);
    }

    if (action === "heartbeat") {
      if (sessionToken) await touchRuntimeSession(appCode, sessionToken, { clientVersion, ipHash });
      const state = sessionToken
        ? await buildRuntimeState(appCode, { sessionToken, accountRef, deviceId })
        : (await bootstrapRuntimeState(appCode, { accountRef, deviceId, clientVersion, ipHash })).state;
      return ok({ state, session_bound: Boolean(sessionToken), active: Boolean(sessionToken) }, origin);
    }

    if (action === "redeem") {
      const result = await redeemRuntimeKey({
        appCode,
        redeemKey: text(body.redeem_key || body.key),
        traceId: text(body.trace_id),
        accountRef,
        deviceId,
        clientVersion,
        ipHash,
        forceSessionRotate: Boolean(body.force_session_rotate || body.rotate_existing_session || body.redeem_device_rotate),
        rotateExistingSession: Boolean(body.rotate_existing_session || body.redeem_device_rotate),
        recoverAccountEntitlement: Boolean(body.recover_account_entitlement ?? true),
      } as any);
      return ok({ ...result, session_token: (result as any).session_token, session_bound: true }, origin);
    }

    if (action === "consume") {
      const result = await consumeRuntimeFeature({
        appCode,
        sessionToken,
        featureCode: text(body.feature_code),
        walletKind: text(body.wallet_kind, "auto"),
        quantity: Number(body.quantity ?? 1),
        traceId: text(body.trace_id),
      });
      return ok({ ...result, session_bound: true }, origin);
    }

    if (action === "unlock_feature") {
      const result = await unlockRuntimeFeatureAccess({
        appCode,
        sessionToken,
        accessCode: text(body.access_code || body.feature_code),
        walletKind: text(body.wallet_kind, "auto"),
        durationSeconds: Number(body.duration_seconds ?? 0),
        traceId: text(body.trace_id),
      });
      return ok({ ...result, session_bound: true }, origin);
    }

    if (action === "logout") {
      if (sessionToken) await logoutRuntimeSession(appCode, sessionToken);
      return ok({ logged_out: true, session_bound: false }, origin);
    }

    if (action === "cleanup") {
      const result = await cleanupRuntimeOps(appCode);
      return ok({ result }, origin);
    }

    await logRuntimeEvent({ app_code: appCode, event_type: "runtime_bad_action", ok: false, code: "UNKNOWN_ACTION", account_ref: accountRef || null, device_id: deviceId || null, meta: { action } });
    return runtimeJson(200, { ok: false, code: "UNKNOWN_ACTION", msg: "UNKNOWN_ACTION", http_status_hint: 400 }, origin);
  } catch (error) {
    try {
      await logRuntimeEvent({ app_code: appCode, event_type: `runtime_${action}_error`, ok: false, code: codeOf(error), account_ref: accountRef || null, device_id: deviceId || null, meta: { message: String((error as any)?.message ?? error) } });
    } catch {
      // ignore audit failures
    }
    return fail(error, origin);
  }
});
