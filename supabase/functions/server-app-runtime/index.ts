import {
  buildRuntimeState,
  bootstrapRuntimeState,
  consumeRuntimeFeature,
  countRuntimeSuccessEvents,
  getRuntimeControls,
  logRuntimeEvent,
  logoutRuntimeSession,
  redeemRuntimeKey,
  runtimeJson,
  sha256Hex,
  touchRuntimeSession,
  unlockRuntimeFeatureAccess,
} from "../_shared/server_app_runtime.ts";

function getAllowedOrigin(origin: string | null | undefined) {
  const incoming = String(origin ?? "").trim();
  const publicBase = String(Deno.env.get("PUBLIC_BASE_URL") ?? "").trim();
  const appBase = String(Deno.env.get("APP_BASE_URL") ?? "").trim();
  return incoming || appBase || publicBase || "*";
}

function runtimeCorsHeaders(origin?: string | null, methods = "POST,OPTIONS") {
  return {
    "access-control-allow-origin": getAllowedOrigin(origin),
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-fp, x-admin-key",
    "access-control-allow-methods": methods,
    "access-control-max-age": "86400",
    "vary": "origin",
  } as Record<string, string>;
}

type RuntimeAction = "health" | "catalog" | "me" | "redeem" | "consume" | "heartbeat" | "logout" | "unlock_feature";

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

function toRuntimeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const anyError = error as Record<string, unknown>;
    const direct = [anyError.msg, anyError.message, anyError.details, anyError.hint]
      .map((item) => String(item ?? "").trim())
      .find(Boolean);
    if (direct) return direct;
    try {
      return JSON.stringify(anyError);
    } catch (_err) {
      return String(anyError);
    }
  }
  return String(error);
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
  if ((action === "consume" || action === "unlock_feature") && !controls.consume_enabled) {
    throw makeControlError(action === "unlock_feature" ? "UNLOCK_DISABLED" : "CONSUME_DISABLED", controls.maintenance_notice);
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
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: runtimeCorsHeaders(origin, "POST,OPTIONS") });
  if (req.method !== "POST") return runtimeJson(405, { ok: false, code: "METHOD_NOT_ALLOWED" }, origin);

  const headers = runtimeCorsHeaders(origin, "POST,OPTIONS");

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
    const quantity = Math.max(1, Math.trunc(Number((body as any).quantity ?? 1) || 1));
    const durationSeconds = Math.max(0, Math.trunc(Number((body as any).duration_seconds ?? 0) || 0));
    const traceId = asBodyString((body as any).trace_id) || null;
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
      trace_id: traceId,
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

    if (!["health", "catalog", "me", "redeem", "consume", "heartbeat", "logout", "unlock_feature"].includes(action)) {
      await logSafe({ ok: false, code: "UNKNOWN_ACTION", message: action || null });
      return runtimeJson(400, { ok: false, code: "UNKNOWN_ACTION", action }, origin);
    }

    if (action === "health") {
      await logSafe({ ok: true, code: "OK", meta: { mode: "health" } });
      return runtimeJson(200, {
        ok: true,
        action,
        app_code: appCode,
        function: "server-app-runtime",
        ts: new Date().toISOString(),
      }, origin);
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
      const boot = await bootstrapRuntimeState(appCode, {
        sessionToken: sessionToken || null,
        accountRef: accountRef || null,
        deviceId: deviceId || req.headers.get("x-fp") || null,
        clientVersion,
        ipHash,
      });
      await logSafe({ ok: true, code: "OK", meta: { session_bound: boot.sessionBound, bootstrap_account: accountRef || null } });
      return runtimeJson(200, {
        ok: true,
        action,
        state: boot.state,
        session_token: boot.sessionToken,
        session_bound: boot.sessionBound,
      }, origin);
    }

    if (action === "heartbeat") {
      const hintedDeviceId = deviceId || req.headers.get("x-fp") || null;
      if (!sessionToken) {
        const boot = await bootstrapRuntimeState(appCode, {
          sessionToken: null,
          accountRef: accountRef || null,
          deviceId: hintedDeviceId,
          clientVersion,
          ipHash,
        });
        await logSafe({ ok: true, code: "OK", meta: { heartbeat_bootstrap: true, session_bound: boot.sessionBound } });
        return runtimeJson(200, {
          ok: true,
          action,
          active: Boolean(boot.sessionToken),
          state: boot.state,
          session_token: boot.sessionToken,
          session_bound: boot.sessionBound,
        }, origin);
      }

      try {
        const touched = await touchRuntimeSession(appCode, sessionToken, { clientVersion, ipHash });
        const state = await buildRuntimeState(appCode, {
          sessionToken,
          accountRef: accountRef || null,
          deviceId: hintedDeviceId,
        });
        await logSafe({ ok: true, code: "OK", session_id: (touched as any)?.id ?? null });
        return runtimeJson(200, {
          ok: true,
          action,
          active: true,
          state,
          session_token: sessionToken,
          session_bound: true,
        }, origin);
      } catch (error) {
        const retryable = ["SESSION_NOT_FOUND", "SESSION_INACTIVE", "ENTITLEMENT_INACTIVE", "ENTITLEMENT_EXPIRED", "ENTITLEMENT_REVOKED"].includes(String((error as any)?.code ?? ""));
        if (!retryable) throw error;

        if (accountRef && hintedDeviceId) {
          const boot = await bootstrapRuntimeState(appCode, {
            sessionToken: null,
            accountRef: accountRef || null,
            deviceId: hintedDeviceId,
            clientVersion,
            ipHash,
          });
          await logSafe({
            ok: true,
            code: "HEARTBEAT_SESSION_RECOVERED",
            meta: { previous_code: String((error as any)?.code ?? "UNKNOWN"), session_bound: boot.sessionBound },
          });
          return runtimeJson(200, {
            ok: true,
            action,
            active: Boolean(boot.sessionToken),
            state: boot.state,
            session_token: boot.sessionToken,
            session_bound: boot.sessionBound,
            recovered: true,
          }, origin);
        }

        const state = await buildRuntimeState(appCode, {
          sessionToken: null,
          accountRef: accountRef || null,
          deviceId: hintedDeviceId,
        });
        await logSafe({ ok: true, code: "HEARTBEAT_SESSION_DROPPED", meta: { previous_code: String((error as any)?.code ?? "UNKNOWN") } });
        return runtimeJson(200, {
          ok: true,
          action,
          active: false,
          state,
          session_token: null,
          session_bound: false,
          recovered: false,
        }, origin);
      }
    }

    if (action === "logout") {
      if (!sessionToken) {
        await logSafe({ ok: true, code: "OK", meta: { logout_no_session: true } });
        return runtimeJson(200, {
          ok: true,
          action,
          logged_out: true,
          already_logged_out: true,
          session: null,
        }, origin);
      }
      try {
        const loggedOut = await logoutRuntimeSession(appCode, sessionToken);
        await logSafe({ ok: true, code: "OK", session_id: (loggedOut as any)?.id ?? null });
        return runtimeJson(200, {
          ok: true,
          action,
          logged_out: true,
          session: loggedOut,
        }, origin);
      } catch (error) {
        const retryable = ["SESSION_NOT_FOUND", "SESSION_INACTIVE"].includes(String((error as any)?.code ?? ""));
        if (!retryable) throw error;
        await logSafe({ ok: true, code: "LOGOUT_IDEMPOTENT", meta: { previous_code: String((error as any)?.code ?? "UNKNOWN") } });
        return runtimeJson(200, {
          ok: true,
          action,
          logged_out: true,
          already_logged_out: true,
          session: null,
        }, origin);
      }
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
        traceId,
        clientVersion,
        ipHash,
      });
      await logSafe({
        ok: true,
        code: "OK",
        session_id: (redeemed as any)?.session?.id ?? null,
        trace_id: (redeemed as any)?.trace_id ?? traceId ?? null,
        meta: { reward: (redeemed as any)?.reward ?? null, source_free_session_id: (redeemed as any)?.source_free_session_id ?? null },
      });
      return runtimeJson(200, {
        ok: true,
        action,
        trace_id: (redeemed as any)?.trace_id ?? traceId ?? null,
        ...redeemed,
      }, origin);
    }

    if (action === "consume") {
      if (!featureCode) return runtimeJson(400, { ok: false, code: "MISSING_FEATURE_CODE" }, origin);
      let effectiveSessionToken = sessionToken || "";
      const tryBootstrapSession = async () => {
        if (!accountRef || !deviceId) return null;
        const boot = await bootstrapRuntimeState(appCode, {
          sessionToken: null,
          accountRef: accountRef || null,
          deviceId: deviceId || req.headers.get("x-fp") || null,
          clientVersion,
          ipHash,
        });
        if (boot.sessionToken) effectiveSessionToken = boot.sessionToken;
        return boot;
      };
      if (!effectiveSessionToken) await tryBootstrapSession();
      if (!effectiveSessionToken) return runtimeJson(409, { ok: false, code: "SESSION_BOOTSTRAP_REQUIRED" }, origin);
      let consumed: any;
      try {
        consumed = await consumeRuntimeFeature({
          appCode,
          sessionToken: effectiveSessionToken,
          featureCode,
          walletKind,
          quantity,
          traceId,
        });
      } catch (error) {
        const retryable = ["SESSION_NOT_FOUND", "SESSION_INACTIVE", "ENTITLEMENT_INACTIVE", "ENTITLEMENT_EXPIRED", "ENTITLEMENT_REVOKED"].includes(String((error as any)?.code ?? ""));
        if (!retryable || !accountRef || !deviceId) throw error;
        await tryBootstrapSession();
        if (!effectiveSessionToken) throw error;
        consumed = await consumeRuntimeFeature({
          appCode,
          sessionToken: effectiveSessionToken,
          featureCode,
          walletKind,
          quantity,
          traceId,
        });
      }
      await logSafe({
        ok: true,
        code: "OK",
        session_id: (consumed as any)?.session?.id ?? null,
        trace_id: (consumed as any)?.trace_id ?? traceId ?? null,
        meta: { balances: (consumed as any)?.wallet ?? null },
      });
      return runtimeJson(200, {
        ok: true,
        action,
        trace_id: (consumed as any)?.trace_id ?? traceId ?? null,
        session_token: effectiveSessionToken,
        session_bound: Boolean(effectiveSessionToken),
        ...consumed,
      }, origin);
    }

    if (action === "unlock_feature") {
      if (!featureCode) return runtimeJson(400, { ok: false, code: "MISSING_FEATURE_CODE" }, origin);
      let effectiveSessionToken = sessionToken || "";
      const tryBootstrapSession = async () => {
        if (!accountRef || !deviceId) return null;
        const boot = await bootstrapRuntimeState(appCode, {
          sessionToken: null,
          accountRef: accountRef || null,
          deviceId: deviceId || req.headers.get("x-fp") || null,
          clientVersion,
          ipHash,
        });
        if (boot.sessionToken) effectiveSessionToken = boot.sessionToken;
        return boot;
      };
      if (!effectiveSessionToken) await tryBootstrapSession();
      if (!effectiveSessionToken) return runtimeJson(409, { ok: false, code: "SESSION_BOOTSTRAP_REQUIRED" }, origin);
      let unlocked: any;
      try {
        unlocked = await unlockRuntimeFeatureAccess({
          appCode,
          sessionToken: effectiveSessionToken,
          accessCode: featureCode,
          walletKind,
          durationSeconds: durationSeconds > 0 ? durationSeconds : null,
          traceId,
        });
      } catch (error) {
        const retryable = ["SESSION_NOT_FOUND", "SESSION_INACTIVE", "ENTITLEMENT_INACTIVE", "ENTITLEMENT_EXPIRED", "ENTITLEMENT_REVOKED"].includes(String((error as any)?.code ?? ""));
        if (!retryable || !accountRef || !deviceId) throw error;
        await tryBootstrapSession();
        if (!effectiveSessionToken) throw error;
        unlocked = await unlockRuntimeFeatureAccess({
          appCode,
          sessionToken: effectiveSessionToken,
          accessCode: featureCode,
          walletKind,
          durationSeconds: durationSeconds > 0 ? durationSeconds : null,
          traceId,
        });
      }
      await logSafe({
        ok: true,
        code: "OK",
        trace_id: traceId ?? null,
        meta: { access_code: featureCode, expires_at: (unlocked as any)?.expires_at ?? null, free_by_plan: (unlocked as any)?.free_by_plan ?? false },
      });
      return runtimeJson(200, {
        ok: true,
        action,
        unlock_feature_code: featureCode,
        session_token: effectiveSessionToken,
        session_bound: Boolean(effectiveSessionToken),
        ...unlocked,
      }, origin);
    }

    await logSafe({ ok: false, code: "UNKNOWN_ACTION", message: action || null });
    return runtimeJson(400, { ok: false, code: "UNKNOWN_ACTION", action }, origin);
  } catch (error) {
    const status = Number((error as any)?.status ?? 500);
    const code = String((error as any)?.code ?? "SERVER_ERROR");
    const msg = toRuntimeErrorMessage(error);

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
            trace_id: asBodyString((body as any).trace_id) || null,
            client_version: asBodyString((body as any).client_version) || null,
            ip_hash: await sha256Hex(getIp(req)),
            meta: { status, quantity: Math.max(1, Math.trunc(Number((body as any).quantity ?? 1) || 1)) },
          });
        }
      }
    } catch (_err) {
      // ignore logging errors in catch path
    }

    return runtimeJson(status, { ok: false, code, msg }, origin);
  }
});
