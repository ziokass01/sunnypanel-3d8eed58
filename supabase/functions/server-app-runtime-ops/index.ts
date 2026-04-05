import { assertAdmin, json } from "../_shared/admin.ts";
import { handleOptions } from "../_shared/cors.ts";
import { adjustRuntimeWalletBalance, cleanupRuntimeOps } from "../_shared/server_app_runtime.ts";

type OpsAction = "cleanup" | "adjust_wallet";

function asString(value: unknown, fallback = "") {
  const v = String(value ?? fallback).trim();
  return v || fallback;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";

  if (req.method === "OPTIONS") {
    return handleOptions(req);
  }

  if (req.method !== "POST") {
    return json(405, { ok: false, code: "METHOD_NOT_ALLOWED" }, origin);
  }

  const adminCheck = await assertAdmin(req);
  if (!adminCheck.ok) {
    return json(adminCheck.status, adminCheck.body, origin);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = asString(body?.action).toLowerCase() as OpsAction;
    const appCode = asString(body?.app_code);
    if (!appCode) {
      return json(400, { ok: false, code: "MISSING_APP_CODE" }, origin);
    }

    if (action === "cleanup") {
      const result = await cleanupRuntimeOps(appCode);
      return json(200, { ok: true, action, result }, origin);
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
      return json(200, { ok: true, action, result }, origin);
    }

    return json(400, { ok: false, code: "UNKNOWN_ACTION" }, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = Number((error as any)?.status ?? 500);
    const code = asString((error as any)?.code, status >= 500 ? "SERVER_ERROR" : "BAD_REQUEST");
    return json(status, { ok: false, code, message }, origin);
  }
});
