import { supabase } from "@/integrations/supabase/client";

export function asNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function planRank(planCode?: string | null) {
  switch (String(planCode || "classic").trim().toLowerCase()) {
    case "pro":
      return 40;
    case "plus":
      return 30;
    case "go":
      return 20;
    case "classic":
      return 10;
    default:
      return 0;
  }
}

export function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean)));
}

export async function insertAdminAuditLog(input: {
  appCode: string;
  accountRef?: string | null;
  targetKind?: string;
  targetValue?: string | null;
  action: string;
  reason?: string | null;
  payload?: Record<string, unknown>;
}) {
  const userRes = await supabase.auth.getUser();
  const createdBy = userRes.data.user?.id ?? null;
  return supabase.from("server_app_admin_audit_logs").insert({
    app_code: input.appCode,
    account_ref: input.accountRef ?? null,
    target_kind: input.targetKind ?? "account",
    target_value: input.targetValue ?? input.accountRef ?? null,
    action: input.action,
    reason: input.reason ?? null,
    payload: input.payload ?? {},
    created_by: createdBy,
  });
}

export async function insertRuntimeAdminEvent(input: {
  appCode: string;
  accountRef?: string | null;
  deviceId?: string | null;
  code: string;
  message: string;
  meta?: Record<string, unknown>;
}) {
  return supabase.from("server_app_runtime_events").insert({
    app_code: input.appCode,
    event_type: "admin_control",
    ok: true,
    code: input.code,
    message: input.message,
    account_ref: input.accountRef ?? null,
    device_id: input.deviceId ?? null,
    meta: input.meta ?? {},
  });
}
