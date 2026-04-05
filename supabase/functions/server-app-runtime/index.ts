import { buildCorsHeaders, handleOptions } from "../_shared/cors.ts";
import {
  buildRuntimeState,
  consumeRuntimeFeature,
  countRuntimeSuccessEvents,
  getRuntimeControls,
  logRuntimeEvent,
  logoutRuntimeSession,
  redeemRuntimeKey,
  runtimeJson,
  sha256Hex,
  touchRuntimeSession,
} from "../_shared/server_app_runtime.ts";

type RuntimeAction = "catalog" | "me" | "redeem" | "consume" | "heartbeat" | "logout";

function getIp(req: Request) {
  return req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-real-ip")
    ?? (req.headers.get("x-forwarded-for") || "").split(",")[0].trim()
    ?? "0.0.0.0";
}

function asBodyString(value: unknown, fallback = "") {
  const v = String(value ?? fallback).trim();
  return v || fallback;
}

function compareVersionText(left: string | null | undefined, right: string | null | undefined) {
  const a = String(left ?? "").trim();
  const b = String(right ?? "").trim();
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const aParts = a.split(/[^0-9]+/).filter(Boolean).map((part) => Number(part));
  const bParts = b.split(/[^0-9]+/).filter(Boolean).map((part) => Number(part));
  const maxLen = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < maxLen; i += 1) {
    const av = Number.isFinite(aParts[i]) ? aParts[i] : 0;
    const bv = Number.isFinite(bParts[i]) ? bParts[i] : 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function todayStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)).toISOString();
}

function makeControlError(code: string, maintenanceNotice?: string | null, status = 409) {
  const detail = maintenanceNotice ? `${code}: ${maintenanceNotice}` : code;
  return Object.assign(new Error(detail), { status, code });
}

async function enforceControls(params: {
  action: RuntimeAction;
  appCode: string;
  accountRef?: string;
  deviceId?: string;
  clientVersion?: string | null;
  ipHash?: string | null;
}) {
  const controls = await getRuntimeControls(params.appCode);
  const action = params.action;
  const accountRef = asBodyString(params.accountRef);
  const deviceId = asBodyString(params.deviceId);
  const clientVersion = asBodyString(params.clientVersion);
  const ipHash = asBodyString(params.ipHash);

  if (action !== "logout" && !controls.runtime_enabled) {
    throw makeControlError("RUNTIME_DISABLED", controls.maintenance_notice, 503);
  }
  if ((action === "catalog" || action === "me") && !controls.catalog_enabled) {
    throw makeControlError("CATALOG_DISABLED", controls.maintenance_notice);
  }
  if (action === "redeem" && !controls.redeem_enabled) {
    throw makeControlError("REDEEM_DISABLED", controls.maintenance_notice);
  }
  if (action === "consume" && !controls.consume_enabled) {
    throw makeControlError("CONSUME_DISABLED", controls.maintenance_notice);
  }
  if (action === "heartbeat" && !controls.heartbeat_enabled) {
    throw makeControlError("HEARTBEAT_DISABLED", controls.maintenance_notice);
  }

  if (clientVersion && controls.min_client_version && compareVersionText(clientVersion, controls.min_client_version) < 0) {
    throw Object.assign(new Error(`CLIENT_VERSION_TOO_OLD: minimum ${controls.min_client_version}`), {
      status: 426,
      code: "CLIENT_VERSION_TOO_OLD",
    });
  }

  if (clientVersion && controls.blocked_client_versions.includes(clientVersion)) {
    throw makeControlError("CLIENT_VERSION_BLOCKED", controls.maintenance_notice, 403);
  }
  if (accountRef && controls.blocked_accounts.includes(accountRef)) {
    throw makeControlError("ACCOUNT_BLOCKED", controls.maintenance_notice, 403);
  }
  if (deviceId && controls.blocked_devices.includes(deviceId)) {
    throw makeControlError("DEVICE_BLOCKED", controls.maintenance_notice, 403);
  }
  if (ipHash && controls.blocked_ip_hashes.includes(ipHash)) {
    throw makeControlError("IP_BLOCKED", controls.maintenance_notice, 403);
  }

  if (action === "redeem") {
    const sinceIso = todayStartIso();
    if (controls.max_daily_redeems_per_account > 0 && accountRef) {
      const accountCount = await countRuntimeSuccessEvents({
        appCode: params.appCode,
        eventType: "redeem",
        accountRef,
        sinceIso,
      });
      if (accountCount >= controls.max_daily_redeems_per_account) {
        throw Object.assign(new Error("REDEEM_DAILY_ACCOUNT_LIMIT"), { status: 429, code: "REDEEM_DAILY_ACCOUNT_LIMIT" });
      }
    }
    if (controls.max_daily_redeems_per_device > 0 && deviceId) {
      const deviceCount = await countRuntimeSuccessEvents({
        appCode: params.appCode,
        eventType: "redeem",
        deviceId,
        sinceIso,
      });
      if (deviceCount >= controls.max_daily_redeems_per_device) {
        throw Object.assign(new Error("REDEEM_DAILY_DEVICE_LIMIT"), { status: 429, code: "REDEEM_DAILY_DEVICE_LIMIT" });
      }
    }
  }

  return controls;
}

Deno.serve(async (req) => {
  const publicBaseUrl = Deno.env.get("PUBLIC_BASE_URL") ?? "";
  if (req.method === "OPTIONS") return handleOptions(req, publicBaseUrl, "POST,OPTIONS");
  if (req.method !== "POST") return runtimeJson(405, { ok: false, code: "METHOD_NOT_ALLOWED" }, req.headers.get("origin"));

  const headers = buildCorsHeaders(req, publicBaseUrl, "POST,OPTIONS");
  const origin = req.headers.get("origin");

  let parsedBody: any = null;

  try {
    parsedBody = await req.json().catch(() => null);
    const body = parsedBody;
    if (!body || typeof body !== "object") {
      return new Response(JSON.stringify({ ok: false, code: "BAD_JSON" }), {
        status: 400,
        headers: { ...headers, "content-type": "application/json; charset=utf-8" },
      });
    }

    const action = asBodyString((body as any).action).toLowerCase() as RuntimeAction;
    const appCode = asBodyString((body as any).app_code);
    const sessionToken = asBodyString((body as any).session_token);
    const clientVersion = asBodyString((body as any).client_version) || null;
    const accountRef = asBodyString((body as any).account_ref);
    const deviceId = asBodyString((body as any).device_id);
    const redeemKey = asBodyString((body as any).redeem_key);
    const featureCode = asBodyString((body as any).feature_code);
    const walletKind = asBodyString((body as any).wallet_kind, "auto") || "auto";
    const ipHash = await sha256Hex(getIp(req));

    if (!action) return runtimeJson(400, { ok: false, code: "MISSING_ACTION" }, origin);
    if (!appCode) return runtimeJson(400, { ok: false, code: "MISSING_APP_CODE" }, origin);

    const logBase = {
      app_code: appCode,
      event_type: action,
      account_ref: accountRef || null,
      device_id: deviceId || null,
      feature_code: featureCode || null,
      wallet_kind: walletKind || null,
      ip_hash: ipHash,
      client_version: clientVersion,
    };
    const logSafe = async (payload: Record<string, unknown>) => {
      try {
        await logRuntimeEvent({ ...logBase, ...payload });
      } catch (_err) {
        // do not mask main runtime response if event log table is temporarily unavailable
      }
    };

    if (!["catalog", "me", "redeem", "consume", "heartbeat", "logout"].includes(action)) {
      await logSafe({ ok: false, code: "UNKNOWN_ACTION", message: action || null });
      return runtimeJson(400, { ok: false, code: "UNKNOWN_ACTION", action }, origin);
    }

    await enforceControls({
      action,
      appCode,
      accountRef,
      deviceId,
      clientVersion,
      ipHash,
    });

    if (action === "catalog" || action === "me") {
      const state = await buildRuntimeState(appCode, { sessionToken: sessionToken || null });
      await logSafe({ ok: true, code: "OK", meta: { session_bound: Boolean(sessionToken) } });
      return runtimeJson(200, {
        ok: true,
        action,
        state,
        session_bound: Boolean(sessionToken),
      }, origin);
    }

    if (action === "heartbeat") {
      if (!sessionToken) return runtimeJson(400, { ok: false, code: "MISSING_SESSION_TOKEN" }, origin);
      const touched = await touchRuntimeSession(appCode, sessionToken, { clientVersion, ipHash });
      const state = await buildRuntimeState(appCode, { sessionToken });
      await logSafe({ ok: true, code: "OK", session_id: (touched as any)?.id ?? null });
      return runtimeJson(200, {
        ok: true,
        action,
        active: true,
        state,
      }, origin);
    }

    if (action === "logout") {
      if (!sessionToken) return runtimeJson(400, { ok: false, code: "MISSING_SESSION_TOKEN" }, origin);
      const loggedOut = await logoutRuntimeSession(appCode, sessionToken);
      await logSafe({ ok: true, code: "OK", session_id: (loggedOut as any)?.id ?? null });
      return runtimeJson(200, {
        ok: true,
        action,
        logged_out: true,
        session: loggedOut,
      }, origin);
    }

    if (action === "redeem") {
      if (!redeemKey) return runtimeJson(400, { ok: false, code: "MISSING_REDEEM_KEY" }, origin);
      if (!accountRef) return runtimeJson(400, { ok: false, code: "MISSING_ACCOUNT_REF" }, origin);
      if (!deviceId) return runtimeJson(400, { ok: false, code: "MISSING_DEVICE_ID" }, origin);
      const redeemed = await redeemRuntimeKey({
        appCode,
        redeemKey,
        accountRef,
        deviceId,
        clientVersion,
        ipHash,
      });
      await logSafe({
        ok: true,
        code: "OK",
        session_id: (redeemed as any)?.session?.id ?? null,
        meta: { reward: (redeemed as any)?.reward ?? null },
      });
      return runtimeJson(200, {
        ok: true,
        action,
        ...redeemed,
      }, origin);
    }

    if (action === "consume") {
      if (!sessionToken) return runtimeJson(400, { ok: false, code: "MISSING_SESSION_TOKEN" }, origin);
      if (!featureCode) return runtimeJson(400, { ok: false, code: "MISSING_FEATURE_CODE" }, origin);
      const consumed = await consumeRuntimeFeature({
        appCode,
        sessionToken,
        featureCode,
        walletKind,
      });
      await logSafe({
        ok: true,
        code: "OK",
        session_id: (consumed as any)?.session?.id ?? null,
        meta: { balances: (consumed as any)?.wallet ?? null },
      });
      return runtimeJson(200, {
        ok: true,
        action,
        ...consumed,
      }, origin);
    }

    await logSafe({ ok: false, code: "UNKNOWN_ACTION", message: action || null });
    return runtimeJson(400, { ok: false, code: "UNKNOWN_ACTION", action }, origin);
  } catch (error) {
    const status = Number((error as any)?.status ?? 500);
    const code = String((error as any)?.code ?? "SERVER_ERROR");
    const msg = error instanceof Error ? error.message : String(error);

    try {
      const body = parsedBody;
      if (body && typeof body === "object") {
        const appCode = asBodyString((body as any).app_code);
        const action = asBodyString((body as any).action);
        if (appCode && action) {
          await logRuntimeEvent({
            app_code: appCode,
            event_type: action,
            ok: false,
            code,
            message: msg,
            account_ref: asBodyString((body as any).account_ref) || null,
            device_id: asBodyString((body as any).device_id) || null,
            feature_code: asBodyString((body as any).feature_code) || null,
            wallet_kind: asBodyString((body as any).wallet_kind) || null,
            client_version: asBodyString((body as any).client_version) || null,
            ip_hash: await sha256Hex(getIp(req)),
            meta: { status },
          });
        }
      }
    } catch (_err) {
      // ignore logging errors in catch path
    }

    return runtimeJson(status, { ok: false, code, msg }, origin);
  }
});
