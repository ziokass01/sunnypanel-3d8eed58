import { createAdminClient, json } from "../_shared/admin.ts";

function asString(value: unknown, fallback = "") {
  const v = String(value ?? fallback).trim();
  return v || fallback;
}

function asInt(value: unknown, fallback = 0) {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function normalizeSha(value: unknown) {
  return asString(value).replace(/[^0-9a-fA-F]/g, "").toUpperCase();
}

function normalizeLower(value: unknown) {
  return asString(value).toLowerCase();
}

function getIp(req: Request) {
  return req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-real-ip")
    ?? (req.headers.get("x-forwarded-for") || "").split(",")[0].trim()
    ?? "0.0.0.0";
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function compareVersionText(left: string | null | undefined, right: string | null | undefined) {
  const a = asString(left);
  const b = asString(right);
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

function listIncludesText(list: unknown, value: string) {
  const target = asString(value);
  if (!target) return false;
  return Array.isArray(list) && list.map((item) => asString(item)).includes(target);
}

function listIncludesLower(list: unknown, value: string) {
  const target = normalizeLower(value);
  if (!target) return false;
  return Array.isArray(list) && list.map((item) => normalizeLower(item)).includes(target);
}

function listIncludesInt(list: unknown, value: number) {
  if (!Number.isFinite(value)) return false;
  return Array.isArray(list) && list.map((item) => asInt(item, -1)).includes(value);
}

function listIncludesSha(list: unknown, value: string) {
  const target = normalizeSha(value);
  if (!target) return false;
  return Array.isArray(list) && list.map((item) => normalizeSha(item)).includes(target);
}

function decisionPayload(policy: any, decision: string, code: string, extra: Record<string, unknown> = {}) {
  const updateUrl = asString(policy?.update_url, "https://mityangho.id.vn/free");
  const updateTitle = asString(policy?.update_title, "Yêu cầu cập nhật");
  const updateMessage = asString(policy?.update_message, "Phiên bản bạn đang dùng đã cũ. Vui lòng cập nhật để tiếp tục sử dụng.");
  return {
    ok: decision === "allow",
    allowed: decision === "allow",
    decision,
    code,
    update_required: decision === "update_required",
    hard_blocked: decision === "blocked",
    update_url: updateUrl,
    title: updateTitle,
    message: updateMessage,
    latest_version_name: policy?.latest_version_name ?? null,
    latest_version_code: policy?.latest_version_code ?? null,
    min_version_name: policy?.min_version_name ?? null,
    min_version_code: policy?.min_version_code ?? null,
    ...extra,
  };
}

async function logVersionCheck(supabase: any, payload: Record<string, unknown>) {
  try {
    await supabase.from("server_app_version_audit_logs").insert(payload);
  } catch (_err) {
    // audit must never break client check
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return json(204, {}, origin);
  if (req.method !== "POST") return json(405, { ok: false, code: "METHOD_NOT_ALLOWED" }, origin);

  const supabase = createAdminClient();
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return json(400, { ok: false, code: "BAD_JSON" }, origin);

  const appCode = asString(body.app_code, "fake-lag").toLowerCase();
  const packageName = asString(body.package_name);
  const versionName = asString(body.version_name);
  const versionCode = asInt(body.version_code, 0);
  const buildId = asString(body.build_id);
  const signatureSha256 = normalizeSha(body.signature_sha256);
  const deviceId = asString(body.device_id);
  const ipHash = await sha256Hex(getIp(req));

  const { data: policy, error } = await supabase
    .from("server_app_version_policies")
    .select("*")
    .eq("app_code", appCode)
    .maybeSingle();

  if (error) {
    return json(503, { ok: false, code: "POLICY_LOAD_FAILED", message: error.message }, origin);
  }

  const baseAudit = {
    app_code: appCode,
    package_name: packageName || null,
    version_name: versionName || null,
    version_code: versionCode || null,
    build_id: buildId || null,
    signature_sha256: signatureSha256 || null,
    device_id: deviceId || null,
    ip_hash: ipHash,
    user_agent: req.headers.get("user-agent") || null,
    meta: { source: "fake-lag-check" },
  };

  if (!policy) {
    await logVersionCheck(supabase, { ...baseAudit, decision: "allow", code: "NO_POLICY" });
    return json(200, {
      ok: true,
      allowed: true,
      decision: "allow",
      code: "NO_POLICY",
      update_required: false,
      hard_blocked: false,
      update_url: "https://mityangho.id.vn/free",
    }, origin);
  }

  let status = 200;
  let result = decisionPayload(policy, "allow", "OK", { update_required: false, hard_blocked: false });

  if (!policy.enabled) {
    status = 403;
    result = decisionPayload(policy, "blocked", "VERSION_GUARD_DISABLED_BY_ADMIN");
  } else if (Array.isArray(policy.allowed_package_names) && policy.allowed_package_names.length > 0 && !listIncludesLower(policy.allowed_package_names, packageName)) {
    status = 403;
    result = decisionPayload(policy, "blocked", "PACKAGE_NOT_ALLOWED");
  } else if (policy.block_unknown_signature && Array.isArray(policy.allowed_signature_sha256) && policy.allowed_signature_sha256.length > 0 && !listIncludesSha(policy.allowed_signature_sha256, signatureSha256)) {
    status = 403;
    result = decisionPayload(policy, "blocked", "SIGNATURE_NOT_ALLOWED");
  } else if (listIncludesText(policy.blocked_version_names, versionName) || listIncludesInt(policy.blocked_version_codes, versionCode) || listIncludesText(policy.blocked_build_ids, buildId)) {
    status = 426;
    result = decisionPayload(policy, "update_required", "CLIENT_VERSION_BLOCKED");
  } else if (policy.force_update_enabled && asInt(policy.min_version_code, 0) > 0 && versionCode > 0 && versionCode < asInt(policy.min_version_code, 0)) {
    status = 426;
    result = decisionPayload(policy, "update_required", "CLIENT_VERSION_CODE_TOO_OLD");
  } else if (policy.force_update_enabled && asString(policy.min_version_name) && versionName && compareVersionText(versionName, policy.min_version_name) < 0) {
    status = 426;
    result = decisionPayload(policy, "update_required", "CLIENT_VERSION_TOO_OLD");
  }

  await logVersionCheck(supabase, {
    ...baseAudit,
    decision: String(result.decision || "allow"),
    code: String(result.code || "OK"),
    meta: { source: "fake-lag-check", result },
  });

  return json(status, result, origin);
});
