import { createAdminClient, json } from "../_shared/admin.ts";

function asString(value: unknown, fallback = "") {
  const v = String(value ?? fallback).trim();
  return v || fallback;
}

function asInt(value: unknown, fallback = 0) {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function asBool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return fallback;
  const raw = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
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
  } catch {
    // audit must never break client check
  }
}

function isRuntimeRisk(flags: string) {
  return /debugger|frida|xposed|substrate|hook|tracerpid|socket|port|native_/i.test(flags || "");
}

async function getSecurityBlock(supabase: any, appCode: string, deviceId: string, _ipHash: string) {
  // Hotfix: never hard-block public users by IP hash here. IPs are shared by
  // mobile carriers/NAT/proxies; one bad/cracked client can otherwise make many
  // correct keys look invalid. Device blocks still work.
  const device = asString(deviceId);
  if (!device) return null;
  try {
    const { data } = await supabase
      .from("server_app_security_blocks")
      .select("id,enabled,blocked_until,hit_count,reason")
      .eq("app_code", appCode)
      .eq("enabled", true)
      .eq("device_id", device)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const until = String((data as any).blocked_until ?? "").trim();
    if (until && Date.parse(until) <= Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

async function recordVersionRisk(supabase: any, args: { appCode: string; deviceId: string; ipHash: string; riskFlags: string; detail: Record<string, unknown>; policy: any }) {
  try {
    await supabase.from("audit_logs").insert({ action: "FAKE_LAG_VERSION_RISK", license_key: null, detail: args.detail });
  } catch {}

  const enabled = asBool(args.policy?.risk_auto_block_enabled, true);
  if (!enabled || !args.deviceId) return { blocked: false, hit_count: 1, blocked_until: null as string | null };

  const threshold = Math.max(1, asInt(args.policy?.risk_auto_block_threshold, 2));
  const windowSeconds = Math.max(60, asInt(args.policy?.risk_auto_block_window_seconds, 600));
  const nowIso = new Date().toISOString();
  const blockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  try {
    const found = await supabase
      .from("server_app_security_blocks")
      .select("*")
      .eq("app_code", args.appCode)
      .eq("device_id", args.deviceId)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const existing: any = found.data;
    const firstSeenMs = Date.parse(String((existing as any)?.first_seen_at ?? ""));
    const insideWindow = Number.isFinite(firstSeenMs) && Date.now() - firstSeenMs <= windowSeconds * 1000;
    const hitCount = (insideWindow ? Math.max(0, Number((existing as any)?.hit_count ?? 0)) : 0) + 1;
    const blocked = hitCount >= threshold;
    const payload = {
      app_code: args.appCode,
      device_id: args.deviceId || null,
      ip_hash: null,
      reason: "VERSION_RUNTIME_RISK_DEVICE_ONLY",
      enabled: blocked,
      hit_count: hitCount,
      first_seen_at: insideWindow && (existing as any)?.first_seen_at ? (existing as any).first_seen_at : nowIso,
      last_seen_at: nowIso,
      blocked_until: blocked ? blockedUntil : null,
      details: args.detail,
    };
    if ((existing as any)?.id) await supabase.from("server_app_security_blocks").update(payload).eq("id", (existing as any).id);
    else await supabase.from("server_app_security_blocks").insert(payload);
    return { blocked, hit_count: hitCount, blocked_until: blocked ? blockedUntil : null };
  } catch {
    return { blocked: false, hit_count: 1, blocked_until: null as string | null };
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  try {
    if (req.method === "OPTIONS") return json(204, {}, origin);
    // This endpoint is a public app preflight. Keep HTTP 200 for every handled
    // client denial so the APK does not convert it into "Service unavailable".
    if (req.method !== "POST") return json(200, { ok: false, code: "METHOD_NOT_ALLOWED" }, origin);

    const supabase = createAdminClient();
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return json(200, { ok: false, code: "BAD_JSON" }, origin);

    const appCode = asString(body.app_code, "fake-lag").toLowerCase();
    const packageName = asString(body.package_name);
    const versionName = asString(body.version_name);
    const versionCode = asInt(body.version_code, 0);
    const buildId = asString(body.build_id);
    const signatureSha256 = normalizeSha(body.signature_sha256);
    const deviceId = asString(body.device_id);
    const rawIp = getIp(req);
    const ipHash = await sha256Hex(rawIp);
    const riskFlags = asString(body.risk_flags).slice(0, 512);
    const nativeGuard = (body as any).native_guard ?? null;
    const clientWatermark = asString((body as any).client_watermark).slice(0, 128);

    const { data: policy, error } = await supabase
      .from("server_app_version_policies")
      .select("*")
      .eq("app_code", appCode)
      .maybeSingle();

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
      meta: { source: "fake-lag-check", risk_flags: riskFlags || null, native_guard: nativeGuard, client_watermark: clientWatermark || null },
    };

    if (error) {
      await logVersionCheck(supabase, { ...baseAudit, decision: "allow", code: "POLICY_LOAD_SOFT_FAIL", meta: { ...baseAudit.meta, error: error.message } });
      return json(200, { ok: true, allowed: true, decision: "allow", code: "POLICY_LOAD_SOFT_FAIL", update_required: false, hard_blocked: false }, origin);
    }

    if (!policy) {
      if (isRuntimeRisk(riskFlags)) {
        try {
          await supabase.from("audit_logs").insert({ action: "FAKE_LAG_VERSION_RISK", license_key: null, detail: { app_code: appCode, ip_hash: ipHash, device: deviceId || null, risk_flags: riskFlags, package_name: packageName || null, build_id: buildId || null, signature_sha256: signatureSha256 || null, native_guard: nativeGuard, client_watermark: clientWatermark || null, policy: null } });
        } catch {}
      }
      await logVersionCheck(supabase, { ...baseAudit, decision: "allow", code: "NO_POLICY" });
      return json(200, { ok: true, allowed: true, decision: "allow", code: "NO_POLICY", update_required: false, hard_blocked: false, update_url: "https://mityangho.id.vn/free" }, origin);
    }

    let statusHint = 200;
    let result = decisionPayload(policy, "allow", "OK", { update_required: false, hard_blocked: false, http_status_hint: 200 });

    const securityBlock = await getSecurityBlock(supabase, appCode, deviceId, ipHash);
    if (securityBlock) {
      statusHint = 403;
      result = decisionPayload(policy, "blocked", "DEVICE_BLOCKED", { security_blocked: true, http_status_hint: 403 });
    } else if (isRuntimeRisk(riskFlags)) {
      const riskState = await recordVersionRisk(supabase, {
        appCode,
        deviceId,
        ipHash,
        riskFlags,
        policy,
        detail: { app_code: appCode, ip_hash: ipHash, device: deviceId || null, risk_flags: riskFlags, package_name: packageName || null, build_id: buildId || null, signature_sha256: signatureSha256 || null, native_guard: nativeGuard, client_watermark: clientWatermark || null },
      });
      if (riskState.blocked) {
        statusHint = 403;
        result = decisionPayload(policy, "blocked", "DEVICE_BLOCKED", { security_blocked: true, risk_hit_count: riskState.hit_count, blocked_until: riskState.blocked_until, http_status_hint: 403 });
      }
    }

    const strictIdentity = asBool(policy.block_missing_identity, true);
    const requireSignature = asBool(policy.block_unknown_signature, false) || asBool(policy.require_signature_match, false);
    const minVersionCode = asInt(policy.min_version_code, 0);

    if (String(result.decision || "allow") === "allow" && !policy.enabled) {
      statusHint = 403;
      result = decisionPayload(policy, "blocked", "VERSION_GUARD_DISABLED_BY_ADMIN", { http_status_hint: 403 });
    } else if (String(result.decision || "allow") === "allow" && strictIdentity && !packageName) {
      statusHint = 403;
      result = decisionPayload(policy, "blocked", "PACKAGE_MISSING", { http_status_hint: 403 });
    } else if (String(result.decision || "allow") === "allow" && Array.isArray(policy.allowed_package_names) && policy.allowed_package_names.length > 0 && !listIncludesLower(policy.allowed_package_names, packageName)) {
      statusHint = 403;
      result = decisionPayload(policy, "blocked", "PACKAGE_NOT_ALLOWED", { http_status_hint: 403 });
    } else if (String(result.decision || "allow") === "allow" && requireSignature && strictIdentity && !signatureSha256) {
      statusHint = 403;
      result = decisionPayload(policy, "blocked", "SIGNATURE_MISSING", { http_status_hint: 403 });
    } else if (String(result.decision || "allow") === "allow" && requireSignature && Array.isArray(policy.allowed_signature_sha256) && policy.allowed_signature_sha256.length > 0 && !listIncludesSha(policy.allowed_signature_sha256, signatureSha256)) {
      statusHint = 403;
      result = decisionPayload(policy, "blocked", "SIGNATURE_NOT_ALLOWED", { http_status_hint: 403 });
    } else if (String(result.decision || "allow") === "allow" && (listIncludesText(policy.blocked_version_names, versionName) || listIncludesInt(policy.blocked_version_codes, versionCode) || listIncludesText(policy.blocked_build_ids, buildId))) {
      statusHint = 426;
      result = decisionPayload(policy, "update_required", "CLIENT_VERSION_BLOCKED", { http_status_hint: 426 });
    } else if (String(result.decision || "allow") === "allow" && policy.force_update_enabled && minVersionCode > 0 && versionCode <= 0) {
      statusHint = 426;
      result = decisionPayload(policy, "update_required", "CLIENT_VERSION_CODE_MISSING", { http_status_hint: 426 });
    } else if (String(result.decision || "allow") === "allow" && policy.force_update_enabled && minVersionCode > 0 && versionCode < minVersionCode) {
      statusHint = 426;
      result = decisionPayload(policy, "update_required", "CLIENT_VERSION_CODE_TOO_OLD", { http_status_hint: 426 });
    } else if (String(result.decision || "allow") === "allow" && policy.force_update_enabled && asString(policy.min_version_name) && versionName && compareVersionText(versionName, policy.min_version_name) < 0) {
      statusHint = 426;
      result = decisionPayload(policy, "update_required", "CLIENT_VERSION_TOO_OLD", { http_status_hint: 426 });
    }

    await logVersionCheck(supabase, {
      ...baseAudit,
      decision: String(result.decision || "allow"),
      code: String(result.code || "OK"),
      meta: { source: "fake-lag-check", result, http_status_hint: statusHint, risk_flags: riskFlags || null, native_guard: nativeGuard, client_watermark: clientWatermark || null },
    });

    return json(200, result, origin);
  } catch (err) {
    // Last-resort fail-open for preflight only. The actual license endpoint remains authoritative.
    return json(200, { ok: true, allowed: true, decision: "allow", code: "CHECK_EXCEPTION_SOFT_ALLOW", update_required: false, hard_blocked: false, detail: String((err as any)?.message ?? err) }, origin);
  }
});
