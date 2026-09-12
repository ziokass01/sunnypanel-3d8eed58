// @ts-nocheck
function errorCode(error) { return String(error?.code ?? "").trim(); }
function errorMessage(error) {
  return String(error?.message ?? error?.details ?? error?.hint ?? error ?? "unknown").replace(/\s+/g, " ").trim().slice(0, 700);
}
function positiveInt(value, fallback = 1) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function buildVariants(input) {
  const appCode = String(input.appCode || "free-fire").trim().toLowerCase() || "free-fire";
  const maxDevices = positiveInt(input.maxDevices, 1);
  const maxIps = positiveInt(input.maxIps, 1);
  const maxVerify = positiveInt(input.maxVerify, 1);
  const base = { key: input.key, is_active: true, max_devices: maxDevices, expires_at: input.expiresAt, note: input.note ?? null };
  return [
    { name: "full-current", payload: { ...base, app_code: appCode, max_ips: maxIps, max_verify: maxVerify, verify_count: 0, start_on_first_use: false, starts_on_first_use: false, duration_seconds: null, duration_days: null, first_used_at: null, activated_at: null, public_reset_disabled: false, deleted_at: null } },
    { name: "current-limits", payload: { ...base, app_code: appCode, max_ips: maxIps, max_verify: maxVerify, verify_count: 0 } },
    { name: "current-app", payload: { ...base, app_code: appCode } },
    { name: "legacy-base", payload: base },
  ];
}
export async function insertLicenseCompat(db, input) {
  const attempts = [];
  let lastError = null;
  const rpc = await db.rpc("insert_free_license_compat", {
    p_key: input.key,
    p_app_code: String(input.appCode || "free-fire").trim().toLowerCase() || "free-fire",
    p_expires_at: input.expiresAt,
    p_note: input.note ?? null,
    p_max_devices: positiveInt(input.maxDevices, 1),
    p_max_ips: positiveInt(input.maxIps, 1),
    p_max_verify: positiveInt(input.maxVerify, 1),
  });
  if (!rpc.error) {
    const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
    if (row?.id && row?.key) return { ok: true, data: { id: String(row.id), key: String(row.key) }, attempts };
  } else {
    const code = errorCode(rpc.error), message = errorMessage(rpc.error);
    attempts.push({ variant: "rpc", code, message });
    lastError = rpc.error;
    if (code === "23505" || /duplicate key|unique constraint/i.test(message)) return { ok: false, duplicate: true, error: rpc.error, errorCode: code, errorDetail: message, attempts };
  }
  for (const variant of buildVariants(input)) {
    const result = await db.from("licenses").insert(variant.payload).select("id,key").single();
    if (!result.error && result.data?.id && result.data?.key) return { ok: true, data: { id: String(result.data.id), key: String(result.data.key) }, attempts };
    lastError = result.error;
    const code = errorCode(result.error), message = errorMessage(result.error);
    attempts.push({ variant: variant.name, code, message });
    if (code === "23505" || /duplicate key|unique constraint/i.test(message)) return { ok: false, duplicate: true, error: result.error, errorCode: code, errorDetail: message, attempts };
  }
  return { ok: false, error: lastError, errorCode: errorCode(lastError), errorDetail: errorMessage(lastError), attempts };
}
