import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function getClientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "0.0.0.0";
}

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(digest);
}
function normalizeKey(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}
function validFakeLagKey(key: string) {
  return /^FAKELAG-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key);
}
function safeText(value: unknown, max = 128) {
  return String(value ?? "").trim().slice(0, max);
}
function asBool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return fallback;
  const raw = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}
async function readJson(req: Request) {
  try { return await req.json(); } catch { return null; }
}


function isFunctionMissingError(error: any) {
  const code = String(error?.code ?? "").trim();
  const message = String(error?.message ?? error ?? "").toLowerCase();
  return code === "PGRST202" || code === "42883" || message.includes("could not find the function") || message.includes("function public.increment_fake_lag_license_use") || message.includes("does not exist");
}

async function fallbackIncrementFakeLagUse(db: any, licRow: any, ipHash: string) {
  const maxIps = Math.max(1, Number(licRow.max_ips ?? 1));
  const maxVerify = Math.max(1, Number(licRow.max_verify ?? 1));
  let ipCount = 1;
  try {
    const ipWrite = await db
      .from("license_ip_bindings")
      .upsert({ license_id: licRow.id, app_code: "fake-lag", ip_hash: ipHash, last_seen_at: new Date().toISOString() }, { onConflict: "license_id,ip_hash" });
    if (ipWrite.error) throw ipWrite.error;
    const ipRes = await db.from("license_ip_bindings").select("id", { count: "exact", head: true }).eq("license_id", licRow.id);
    ipCount = Number(ipRes.count ?? 1);
    if (ipCount > maxIps) return { ok: false, msg: "IP_LIMIT_EXCEEDED", verify_count: Number(licRow.verify_count ?? 0), ip_count: ipCount };
  } catch {
    ipCount = 1;
  }

  const nextVerify = Number(licRow.verify_count ?? 0) + 1;
  if (nextVerify > maxVerify) return { ok: false, msg: "VERIFY_LIMIT_EXCEEDED", verify_count: nextVerify, ip_count: ipCount };
  try {
    await db.from("licenses").update({ verify_count: nextVerify }).eq("id", licRow.id);
  } catch {}
  return { ok: true, msg: "OK", verify_count: nextVerify, ip_count: ipCount };
}

async function checkVersionPolicy(db: any, input: any) {
  const appCode = "fake-lag";
  const { data } = await db.from("server_app_version_policies").select("*").eq("app_code", appCode).maybeSingle();
  if (!data || asBool(data.enabled, true) === false) {
    return { allowed: true, update_required: false, hard_blocked: false, update_url: "https://mityangho.id.vn/free" };
  }

  const versionCode = Number(input?.version_code ?? 0);
  const versionName = safeText(input?.version_name, 64);
  const buildId = safeText(input?.build_id, 128);
  const packageName = safeText(input?.package_name, 128);
  const signatureSha256 = safeText(input?.signature_sha256, 128).toUpperCase();
  const blockedCodes = Array.isArray(data.blocked_version_codes) ? data.blocked_version_codes.map((x: any) => Number(x)) : [];
  const blockedNames = Array.isArray(data.blocked_version_names) ? data.blocked_version_names.map((x: any) => String(x).trim()) : [];
  const blockedBuilds = Array.isArray(data.blocked_build_ids) ? data.blocked_build_ids.map((x: any) => String(x).trim()) : [];
  const allowedPackages = Array.isArray(data.allowed_package_names) ? data.allowed_package_names.map((x: any) => String(x).trim()).filter(Boolean) : [];
  const allowedSignatures = Array.isArray(data.allowed_signature_sha256) ? data.allowed_signature_sha256.map((x: any) => String(x).trim().toUpperCase()).filter(Boolean) : [];
  const minVersionCode = Number(data.min_version_code ?? 0);
  const minVersionName = String(data.min_version_name ?? "").trim();
  const requireSignature = asBool(data.require_signature_match, false);

  let hardBlocked = false;
  let updateRequired = false;
  let reason = "OK";
  if (blockedCodes.includes(versionCode)) { hardBlocked = true; reason = "VERSION_CODE_BLOCKED"; }
  else if (blockedNames.includes(versionName)) { hardBlocked = true; reason = "VERSION_NAME_BLOCKED"; }
  else if (buildId && blockedBuilds.includes(buildId)) { hardBlocked = true; reason = "BUILD_ID_BLOCKED"; }
  else if (allowedPackages.length && !allowedPackages.includes(packageName)) { hardBlocked = true; reason = "PACKAGE_NOT_ALLOWED"; }
  else if (requireSignature && allowedSignatures.length && !allowedSignatures.includes(signatureSha256)) { hardBlocked = true; reason = "SIGNATURE_NOT_ALLOWED"; }
  else if (minVersionCode > 0 && versionCode > 0 && versionCode < minVersionCode) { updateRequired = true; reason = "VERSION_CODE_TOO_OLD"; }
  else if (minVersionName && versionName && versionName < minVersionName) { updateRequired = true; reason = "VERSION_NAME_TOO_OLD"; }

  try {
    await db.from("server_app_version_audit_logs").insert({
      app_code: appCode,
      version_name: versionName || null,
      version_code: Number.isFinite(versionCode) ? versionCode : null,
      build_id: buildId || null,
      package_name: packageName || null,
      signature_sha256: signatureSha256 || null,
      device_id: safeText(input?.device, 128) || null,
      allowed: !(hardBlocked || updateRequired),
      update_required: updateRequired,
      hard_blocked: hardBlocked,
      reason,
      meta: { source: "fake-lag-auth" },
    });
  } catch {}

  return {
    allowed: !(hardBlocked || updateRequired),
    update_required: updateRequired,
    hard_blocked: hardBlocked,
    reason,
    title: data.update_title || "Yêu cầu cập nhật",
    message: data.update_message || "Phiên bản bạn đang dùng đã cũ hoặc đã bị chặn. Vui lòng cập nhật để tiếp tục sử dụng.",
    update_url: data.update_url || "https://mityangho.id.vn/free",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, msg: "METHOD_NOT_ALLOWED" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) return json({ ok: false, msg: "SERVER_NOT_READY" }, 503);

  const input = await readJson(req);
  if (!input) return json({ ok: false, msg: "INVALID_JSON" }, 400);

  const key = normalizeKey(input.key);
  const mode = safeText(input.mode, 24).toLowerCase() === "refresh" ? "refresh" : "login";
  const device = safeText(input.device, 128);
  const deviceName = safeText(input.device_name, 128);
  const ip = getClientIp(req);
  const now = new Date();

  if (!validFakeLagKey(key)) return json({ ok: false, msg: "INVALID_KEY_FORMAT" }, 200);
  if (!device) return json({ ok: false, msg: "DEVICE_REQUIRED" }, 200);

  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const version = await checkVersionPolicy(db, input);
  if (!version.allowed) return json({ ok: false, msg: version.reason || "UPDATE_REQUIRED", ...version }, 200);

  const ipHash = await sha256Hex(ip);
  try {
    const ipRl = await db.rpc("check_ip_rate_limit", { p_ip: ip, p_limit: 180, p_window_seconds: 60 });
    const allowed = ipRl.error ? true : Boolean(ipRl.data?.[0]?.allowed);
    if (!allowed) return json({ ok: false, msg: "RATE_LIMIT" }, 429);
  } catch {}

  const lic = await db
    .from("licenses")
    .select("id,key,is_active,expires_at,max_devices,max_ips,max_verify,verify_count,deleted_at,starts_on_first_use,duration_seconds,activated_at,start_on_first_use,duration_days,first_used_at,app_code")
    .eq("key", key)
    .maybeSingle();

  if (lic.error || !lic.data) {
    await db.from("audit_logs").insert({ action: "VERIFY", license_key: key, detail: { ip, device, ok: false, app_code: "fake-lag", msg: "KEY_NOT_FOUND" } });
    return json({ ok: false, msg: "KEY_NOT_FOUND" }, 200);
  }

  const licRow: any = lic.data;
  const appCode = String(licRow.app_code || "fake-lag").trim().toLowerCase();
  if (appCode !== "fake-lag" && !key.startsWith("FAKELAG-")) return json({ ok: false, msg: "KEY_NOT_FOUND" }, 200);
  if (licRow.deleted_at) {
    await db.from("audit_logs").insert({ action: "VERIFY", license_key: key, detail: { ip, device, ok: false, app_code: "fake-lag", msg: "KEY_DELETED" } });
    return json({ ok: false, msg: "KEY_NOT_FOUND" }, 200);
  }
  if (!licRow.is_active) {
    await db.from("audit_logs").insert({ action: "VERIFY", license_key: key, detail: { ip, device, ok: false, app_code: "fake-lag", msg: "KEY_BLOCKED" } });
    return json({ ok: false, msg: "KEY_BLOCKED" }, 200);
  }

  const startsOnFirstUse = Boolean(licRow.start_on_first_use ?? licRow.starts_on_first_use);
  const firstUsedAt: string | null = licRow.first_used_at ?? licRow.activated_at ?? null;
  const durationSecondsRaw = Number(licRow.duration_seconds ?? 0);
  const durationDaysRaw = Number(licRow.duration_days ?? 0);
  const effectiveDurationSeconds = durationSecondsRaw > 0 ? durationSecondsRaw : durationDaysRaw > 0 ? durationDaysRaw * 86400 : null;
  if (!(startsOnFirstUse && !firstUsedAt) && licRow.expires_at) {
    const expMs = new Date(licRow.expires_at).getTime();
    if (Number.isFinite(expMs) && expMs < now.getTime()) {
      await db.from("audit_logs").insert({ action: "VERIFY", license_key: key, detail: { ip, device, ok: false, app_code: "fake-lag", msg: "KEY_EXPIRED" } });
      return json({ ok: false, msg: "KEY_EXPIRED" }, 200);
    }
  }

  const existingDevice = await db.from("license_devices").select("id").eq("license_id", licRow.id).eq("device_id", device).maybeSingle();
  if (existingDevice.error) return json({ ok: false, msg: "SERVER_ERROR" }, 500);

  if (mode === "refresh") {
    if (!existingDevice.data) {
      await db.from("audit_logs").insert({ action: "VERIFY", license_key: key, detail: { ip, device, ok: false, app_code: "fake-lag", msg: "DEVICE_NOT_REGISTERED", mode } });
      return json({ ok: false, msg: "DEVICE_NOT_REGISTERED" }, 200);
    }
    try { await db.from("license_devices").update({ last_seen: now.toISOString() }).eq("id", existingDevice.data.id); } catch {}
  } else {
    if (!existingDevice.data) {
      const count = await db.from("license_devices").select("id", { count: "exact", head: true }).eq("license_id", licRow.id);
      const used = Number(count.count ?? 0);
      const maxDevices = Math.max(1, Number(licRow.max_devices ?? 1));
      if (used >= maxDevices) {
        await db.from("audit_logs").insert({ action: "VERIFY", license_key: key, detail: { ip, device, ok: false, app_code: "fake-lag", msg: "DEVICE_LIMIT" } });
        return json({ ok: false, msg: "DEVICE_LIMIT" }, 200);
      }
    }

    const upsertPayload: Record<string, unknown> = { license_id: licRow.id, device_id: device, last_seen: now.toISOString() };
    if (deviceName) upsertPayload.device_name = deviceName;
    const up = await db.from("license_devices").upsert(upsertPayload, { onConflict: "license_id,device_id" }).select("id").maybeSingle();
    if (up.error) return json({ ok: false, msg: "SERVER_ERROR" }, 500);
  }

  let guardRow: any = { ok: true, msg: "OK", verify_count: Number(licRow.verify_count ?? 0), ip_count: null };
  if (mode !== "refresh") {
    const useGuard = await db.rpc("increment_fake_lag_license_use", { p_license_id: licRow.id, p_app_code: "fake-lag", p_ip_hash: ipHash });
    guardRow = Array.isArray(useGuard.data) ? useGuard.data[0] : useGuard.data;
    if (useGuard.error && isFunctionMissingError(useGuard.error)) {
      guardRow = await fallbackIncrementFakeLagUse(db, licRow, ipHash);
    } else if (useGuard.error || !guardRow?.ok) {
      const msg = useGuard.error ? "SERVER_ERROR" : String(guardRow?.msg || "FAKE_LAG_RULE_BLOCKED");
      await db.from("audit_logs").insert({ action: "VERIFY", license_key: key, detail: { ip, device, ok: false, app_code: "fake-lag", msg } });
      return json({ ok: false, msg }, useGuard.error ? 500 : 200);
    }
    if (!guardRow?.ok) {
      const msg = String(guardRow?.msg || "FAKE_LAG_RULE_BLOCKED");
      await db.from("audit_logs").insert({ action: "VERIFY", license_key: key, detail: { ip, device, ok: false, app_code: "fake-lag", msg } });
      return json({ ok: false, msg }, 200);
    }
  }

  let effectiveExpiresAt: string | null = licRow.expires_at;
  let effectiveFirstUsedAt: string | null = firstUsedAt;
  let started = Boolean(effectiveFirstUsedAt);
  if (startsOnFirstUse) {
    if (!effectiveDurationSeconds || effectiveDurationSeconds <= 0) return json({ ok: false, msg: "LICENSE_MISCONFIGURED" }, 200);
    if (firstUsedAt && !licRow.expires_at) {
      const fuMs = new Date(firstUsedAt).getTime();
      if (Number.isFinite(fuMs)) {
        const healedExpiresAt = new Date(fuMs + effectiveDurationSeconds * 1000).toISOString();
        const heal = await db.from("licenses").update({ expires_at: healedExpiresAt }).eq("id", licRow.id).is("expires_at", null).select("expires_at").maybeSingle();
        effectiveExpiresAt = heal.data?.expires_at ?? healedExpiresAt;
      }
    }
    if (!firstUsedAt) {
      const newExpiresAt = new Date(now.getTime() + effectiveDurationSeconds * 1000).toISOString();
      const activation = await db.from("licenses").update({ first_used_at: now.toISOString(), activated_at: now.toISOString(), expires_at: newExpiresAt }).eq("id", licRow.id).is("first_used_at", null).select("expires_at,first_used_at").maybeSingle();
      if (!activation.error && activation.data?.expires_at) {
        effectiveExpiresAt = activation.data.expires_at;
        effectiveFirstUsedAt = activation.data.first_used_at;
      } else {
        const latest = await db.from("licenses").select("expires_at,first_used_at").eq("id", licRow.id).maybeSingle();
        if (!latest.error && latest.data) {
          effectiveExpiresAt = latest.data.expires_at ?? effectiveExpiresAt;
          effectiveFirstUsedAt = latest.data.first_used_at ?? effectiveFirstUsedAt;
        }
      }
      started = Boolean(effectiveFirstUsedAt);
    }
  }

  await db.from("audit_logs").insert({ action: "VERIFY", license_key: key, detail: { ip, device, device_name: deviceName || null, ok: true, app_code: "fake-lag", mode, license_id: licRow.id } });
  const remainingSeconds = effectiveExpiresAt ? Math.max(0, Math.floor((new Date(effectiveExpiresAt).getTime() - now.getTime()) / 1000)) : startsOnFirstUse && !started && typeof effectiveDurationSeconds === "number" ? effectiveDurationSeconds : null;
  return json({ ok: true, msg: "OK", key, app_code: "fake-lag", expires_at: effectiveExpiresAt, remaining_seconds: remainingSeconds, max_devices: licRow.max_devices, verify_count: guardRow?.verify_count ?? null, ip_count: guardRow?.ip_count ?? null, server_time: now.toISOString() }, 200);
});
