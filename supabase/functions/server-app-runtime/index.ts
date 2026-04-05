import { buildCorsHeaders, handleOptions } from "../_shared/cors.ts";
import {
  buildRuntimeState,
  consumeRuntimeFeature,
  logoutRuntimeSession,
  redeemRuntimeKey,
  runtimeJson,
  sha256Hex,
  touchRuntimeSession,
} from "../_shared/server_app_runtime.ts";

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

Deno.serve(async (req) => {
  const publicBaseUrl = Deno.env.get("PUBLIC_BASE_URL") ?? "";
  if (req.method === "OPTIONS") return handleOptions(req, publicBaseUrl, "POST,OPTIONS");
  if (req.method !== "POST") return runtimeJson(405, { ok: false, code: "METHOD_NOT_ALLOWED" }, req.headers.get("origin"));

  const headers = buildCorsHeaders(req, publicBaseUrl, "POST,OPTIONS");

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return new Response(JSON.stringify({ ok: false, code: "BAD_JSON" }), {
        status: 400,
        headers: { ...headers, "content-type": "application/json; charset=utf-8" },
      });
    }

    const action = asBodyString((body as any).action).toLowerCase();
    const appCode = asBodyString((body as any).app_code);
    const sessionToken = asBodyString((body as any).session_token);
    const clientVersion = asBodyString((body as any).client_version) || null;
    const accountRef = asBodyString((body as any).account_ref);
    const deviceId = asBodyString((body as any).device_id);
    const redeemKey = asBodyString((body as any).redeem_key);
    const featureCode = asBodyString((body as any).feature_code);
    const walletKind = asBodyString((body as any).wallet_kind, "auto") || "auto";
    const origin = req.headers.get("origin");

    if (!action) return runtimeJson(400, { ok: false, code: "MISSING_ACTION" }, origin);
    if (!appCode) return runtimeJson(400, { ok: false, code: "MISSING_APP_CODE" }, origin);

    if (action === "catalog" || action === "me") {
      const state = await buildRuntimeState(appCode, { sessionToken: sessionToken || null });
      return runtimeJson(200, {
        ok: true,
        action,
        state,
        session_bound: Boolean(sessionToken),
      }, origin);
    }

    if (action === "heartbeat") {
      if (!sessionToken) return runtimeJson(400, { ok: false, code: "MISSING_SESSION_TOKEN" }, origin);
      const ipHash = await sha256Hex(getIp(req));
      await touchRuntimeSession(appCode, sessionToken, { clientVersion, ipHash });
      const state = await buildRuntimeState(appCode, { sessionToken });
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
      const ipHash = await sha256Hex(getIp(req));
      const redeemed = await redeemRuntimeKey({
        appCode,
        redeemKey,
        accountRef,
        deviceId,
        clientVersion,
        ipHash,
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
      return runtimeJson(200, {
        ok: true,
        action,
        ...consumed,
      }, origin);
    }

    return runtimeJson(400, { ok: false, code: "UNKNOWN_ACTION", action }, origin);
  } catch (error) {
    const status = Number((error as any)?.status ?? 500);
    const code = String((error as any)?.code ?? "SERVER_ERROR");
    const msg = error instanceof Error ? error.message : String(error);
    return runtimeJson(status, { ok: false, code, msg }, req.headers.get("origin"));
  }
});
