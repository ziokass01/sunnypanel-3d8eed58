// @ts-nocheck
import { createServiceClient } from "./supabase-rest.js";
import { publicFreeBonus, resolveFreeBonus, sortKeyTypesForBonus, freeBonusRuleFor } from "./free-shared/bonus.js";

function text(value, max = 4096) {
  return String(value ?? "").trim().slice(0, max);
}
function getIp(req) {
  return req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-real-ip")
    ?? (req.headers.get("x-forwarded-for") || "").split(",")[0].trim()
    ?? "0.0.0.0";
}
function toHex(bytes) {
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(input) {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(input ?? ""))));
}
function getVietnamDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  return `${parts.find((x) => x.type === "year")?.value}-${parts.find((x) => x.type === "month")?.value}-${parts.find((x) => x.type === "day")?.value}`;
}
function getVietnamDayRangeUtc(day) {
  const [year, month, date] = day.split("-").map(Number);
  const startMs = Date.UTC(year, month - 1, date, 0, 0, 0, 0) - 7 * 3600 * 1000;
  return { startUtcIso: new Date(startMs).toISOString(), nextStartUtcIso: new Date(startMs + 86400000).toISOString() };
}
function normalizeSelectionMode(value) {
  const raw = text(value, 32).toLowerCase();
  return ["package", "credit", "mixed"].includes(raw) ? raw : "none";
}
function sanitizeExternalUrl(value) {
  const url = text(value, 4096);
  return /^https?:\/\//i.test(url) ? url : null;
}
function sanitizeDownloadCards(value) {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => ({
    enabled: Boolean(raw?.enabled ?? true),
    title: text(raw?.title, 200) || null,
    description: text(raw?.description, 1000) || null,
    url: sanitizeExternalUrl(raw?.url),
    button_label: text(raw?.button_label, 120) || null,
    badge: text(raw?.badge, 120) || null,
    icon_url: sanitizeExternalUrl(raw?.icon_url),
  })).filter((x) => x.title || x.description || x.url || x.button_label || x.badge || x.icon_url);
}
function positiveLimit(value) {
  const n = Math.floor(Number(value ?? 0));
  return Number.isFinite(n) && n > 0 ? n : null;
}
async function resolvePerAppQuotaSettings(db, appCodes, fallbackFp, fallbackIp) {
  const unique = [...new Set(appCodes.map((v) => text(v, 64).toLowerCase()).filter(Boolean))];
  const out = {};
  if (!unique.length) return out;
  const res = await db.from("server_app_settings")
    .select("app_code,free_daily_limit_per_fingerprint,free_daily_limit_per_ip")
    .in("app_code", unique);
  const rows = res.error ? [] : (Array.isArray(res.data) ? res.data : []);
  let fakeLagRule = null;
  if (unique.includes("fake-lag")) {
    const r = await db.from("license_access_rules")
      .select("max_devices_per_key,max_ips_per_key,max_verify_per_key,public_enabled")
      .eq("app_code", "fake-lag").maybeSingle();
    if (!r.error) fakeLagRule = r.data;
  }
  for (const code of unique) {
    const hit = rows.find((row) => text(row?.app_code, 64).toLowerCase() === code);
    if (code === "free-fire") {
      out[code] = { free_daily_limit_per_fingerprint: Math.max(0, Number(fallbackFp)), free_daily_limit_per_ip: Math.max(0, Number(fallbackIp)) };
      continue;
    }
    if (code === "fake-lag") {
      out[code] = {
        free_daily_limit_per_fingerprint: positiveLimit(hit?.free_daily_limit_per_fingerprint) ?? positiveLimit(fakeLagRule?.max_devices_per_key) ?? positiveLimit(fakeLagRule?.max_verify_per_key) ?? positiveLimit(fallbackFp) ?? 0,
        free_daily_limit_per_ip: positiveLimit(hit?.free_daily_limit_per_ip) ?? positiveLimit(fakeLagRule?.max_ips_per_key) ?? positiveLimit(fallbackIp) ?? 0,
      };
      continue;
    }
    out[code] = {
      free_daily_limit_per_fingerprint: Math.max(0, Number(hit?.free_daily_limit_per_fingerprint ?? fallbackFp)),
      free_daily_limit_per_ip: Math.max(0, Number(hit?.free_daily_limit_per_ip ?? fallbackIp)),
    };
  }
  return out;
}

export async function handleFreeConfig(req, env, ctx) {
  if (req.method !== "GET") return ctx.json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  const db = createServiceClient(env);
  if (!db) return ctx.json({ ok: false, code: "FREE_NOT_READY", msg: "FREE_NOT_READY" }, 503);

  const requestedAppCode = text(req.headers.get("x-app-code"), 64).toLowerCase();
  const settingsRes = await db.from("licenses_free_settings").select("*").eq("id", 1).maybeSingle();
  if (settingsRes.error) return ctx.json({ ok: false, code: "FREE_NOT_READY", msg: settingsRes.error.message }, 503);
  const settings = settingsRes.data ?? {};
  const bonusRuntime = resolveFreeBonus(settings.free_bonus_config);

  let keyQ = db.from("licenses_free_key_types").select("*").eq("enabled", true).order("sort_order", { ascending: true });
  if (requestedAppCode) keyQ = keyQ.eq("app_code", requestedAppCode);
  const keyRes = await keyQ;
  if (keyRes.error) return ctx.json({ ok: false, code: "FREE_NOT_READY", msg: keyRes.error.message }, 503);
  let keyTypes = Array.isArray(keyRes.data) ? keyRes.data : [];
  keyTypes = sortKeyTypesForBonus(keyTypes, bonusRuntime);

  const appCodes = [...new Set(keyTypes.map((k) => text(k?.app_code || "free-fire", 64).toLowerCase() || "free-fire"))];
  const fallbackFp = Math.max(0, Number(settings.free_daily_limit_per_fingerprint ?? 1));
  const fallbackIp = Math.max(0, Number(settings.free_daily_limit_per_ip ?? 0));
  const quotaSettings = await resolvePerAppQuotaSettings(db, requestedAppCode ? [requestedAppCode] : appCodes, fallbackFp, fallbackIp);

  const ip = getIp(req);
  const ipHash = await sha256Hex(ip);
  const fp = text(req.headers.get("x-fp"), 512);
  const fpHash = fp ? await sha256Hex(fp) : "";
  const dayKey = getVietnamDateKey();
  const range = getVietnamDayRangeUtc(dayKey);
  const quotaByApp = {};

  for (const appCode of (requestedAppCode ? [requestedAppCode] : appCodes)) {
    const limits = quotaSettings[appCode] ?? { free_daily_limit_per_fingerprint: fallbackFp, free_daily_limit_per_ip: fallbackIp };
    let fpUsed = 0;
    if (fpHash) {
      const r = await db.from("licenses_free_issues").select("issue_id", { count: "exact", head: true })
        .gte("created_at", range.startUtcIso).lt("created_at", range.nextStartUtcIso)
        .eq("fingerprint_hash", fpHash).eq("app_code", appCode);
      fpUsed = Number(r.count ?? 0);
    }
    const ipR = await db.from("licenses_free_issues").select("issue_id", { count: "exact", head: true })
      .gte("created_at", range.startUtcIso).lt("created_at", range.nextStartUtcIso)
      .eq("ip_hash", ipHash).eq("app_code", appCode);
    const ipUsed = Number(ipR.count ?? 0);
    const fpRemaining = limits.free_daily_limit_per_fingerprint <= 0 ? null : Math.max(0, limits.free_daily_limit_per_fingerprint - fpUsed);
    const ipRemaining = limits.free_daily_limit_per_ip <= 0 ? null : Math.max(0, limits.free_daily_limit_per_ip - ipUsed);
    const finite = [fpRemaining, ipRemaining].filter((v) => v !== null);
    quotaByApp[appCode] = {
      used_fingerprint: fpUsed,
      used_ip: ipUsed,
      remaining_fingerprint: fpRemaining,
      remaining_ip: ipRemaining,
      remaining_today: finite.length ? Math.min(...finite) : null,
      free_daily_limit_per_fingerprint: limits.free_daily_limit_per_fingerprint,
      free_daily_limit_per_ip: limits.free_daily_limit_per_ip,
    };
  }

  let providerCount = 0;
  const providerRes = await db.from("licenses_free_shortlink_providers").select("id", { count: "exact", head: true }).eq("enabled", true);
  if (!providerRes.error) providerCount = Number(providerRes.count ?? 0);

  const findDumpsRewards = {};
  if (!requestedAppCode || requestedAppCode === "find-dumps" || appCodes.includes("find-dumps")) {
    const r = await db.from("server_app_reward_packages")
      .select("package_code,title,reward_mode,plan_code,soft_credit_amount,premium_credit_amount,entitlement_days,entitlement_seconds")
      .eq("app_code", "find-dumps").eq("enabled", true);
    if (!r.error) for (const row of r.data ?? []) {
      const code = text(row?.package_code, 64).toLowerCase();
      if (!code) continue;
      const mode = text(row?.reward_mode, 32).toLowerCase();
      findDumpsRewards[code] = {
        code,
        label: text(row?.title, 200) || code,
        reward_mode: mode,
        plan_code: text(row?.plan_code, 64) || null,
        soft_credit_amount: Number(row?.soft_credit_amount ?? 0),
        premium_credit_amount: Number(row?.premium_credit_amount ?? 0),
        entitlement_days: Math.max(0, Number(row?.entitlement_days ?? 0)),
        entitlement_seconds: Math.max(0, Number(row?.entitlement_seconds ?? 0)),
        wallet_kind: mode === "premium_credit" ? "vip" : mode === "soft_credit" ? "normal" : null,
      };
    }
  }

  let cards = sanitizeDownloadCards(settings.free_download_cards);
  if (!cards.length) {
    const legacy = [];
    if (Boolean(settings.free_download_enabled) && sanitizeExternalUrl(settings.free_download_url)) legacy.push({
      enabled: true, title: text(settings.free_download_name, 200) || "Tệp tải xuống",
      description: text(settings.free_download_info, 1000) || null, url: sanitizeExternalUrl(settings.free_download_url),
      button_label: "Mở liên kết", badge: "Link 1", icon_url: null,
    });
    if (Boolean(settings.free_external_download_enabled) && sanitizeExternalUrl(settings.free_external_download_url)) legacy.push({
      enabled: true, title: text(settings.free_external_download_title, 200) || "Liên kết tải thêm",
      description: text(settings.free_external_download_description, 1000) || null, url: sanitizeExternalUrl(settings.free_external_download_url),
      button_label: text(settings.free_external_download_button_label, 120) || "Mở liên kết",
      badge: text(settings.free_external_download_badge, 120) || "Link 2", icon_url: sanitizeExternalUrl(settings.free_external_download_icon_url),
    });
    cards = legacy;
  }

  const requestedQuota = requestedAppCode ? quotaByApp[requestedAppCode] ?? null : null;
  const missing = [];
  if (providerCount <= 0 && !text(settings.free_outbound_url, 4096)) missing.push("shortlink_provider");
  if (!keyTypes.length) missing.push("no_key_types_enabled");

  return ctx.json({
    ok: true,
    public_base_url: String(env?.FREE_PUBLIC_BASE_URL || env?.PUBLIC_BASE_URL || "https://mityangho.id.vn").replace(/\/+$/, ""),
    destination_gate_url: `${String(env?.FREE_PUBLIC_BASE_URL || env?.PUBLIC_BASE_URL || "https://mityangho.id.vn").replace(/\/+$/, "")}/free/gate`,
    free_enabled: Boolean(settings.free_enabled ?? true),
    free_disabled_message: text(settings.free_disabled_message, 1000) || "Trang GetKey đang tạm đóng.",
    free_outbound_url: null,
    free_outbound_url_pass2: null,
    free_shortlink_provider_count: providerCount,
    free_shortlink_mode: ["random","priority_failover"].includes(text(settings.free_shortlink_mode,32)) ? text(settings.free_shortlink_mode,32) : "round_robin",
    free_secondary_enabled: Boolean(settings.free_secondary_enabled ?? true),
    free_gate_token_life_seconds: Math.min(1800, Math.max(60, Number(settings.free_gate_token_life_seconds ?? 600) || 600)),
    free_link4m_rotate_days: Math.max(1, Number(settings.free_link4m_rotate_days ?? 7)),
    free_session_waiting_limit: Math.max(1, Number(settings.free_session_waiting_limit ?? 2)),
    free_link4m_rotate_nonce_pass1: Math.max(0, Number(settings.free_link4m_rotate_nonce_pass1 ?? 0)),
    free_link4m_rotate_nonce_pass2: Math.max(0, Number(settings.free_link4m_rotate_nonce_pass2 ?? 0)),
    free_min_delay_seconds: Math.max(0, Number(settings.free_min_delay_seconds ?? 0)),
    free_min_delay_seconds_pass2: Math.max(0, Number(settings.free_min_delay_seconds_pass2 ?? settings.free_min_delay_seconds ?? 0)),
    free_return_seconds: Math.max(10, Number(settings.free_return_seconds ?? 10)),
    free_session_absolute_seconds: Math.min(3600, Math.max(120, Number(settings.free_session_absolute_seconds ?? 900) || 900)),
    free_claim_window_seconds: Math.min(900, Math.max(30, Number(settings.free_claim_window_seconds ?? 180) || 180)),
    free_close_deadline_seconds: Math.max(10, Number(settings.free_close_deadline_seconds ?? settings.free_return_seconds ?? 10)),
    free_daily_limit_per_fingerprint: requestedQuota?.free_daily_limit_per_fingerprint ?? fallbackFp,
    free_daily_limit_per_ip: requestedQuota?.free_daily_limit_per_ip ?? fallbackIp,
    free_gate_require_ip_match: Boolean(settings.free_gate_require_ip_match ?? true),
    free_gate_require_ua_match: Boolean(settings.free_gate_require_ua_match ?? true),
    free_require_link4m_referrer: Boolean(settings.free_require_link4m_referrer ?? false),
    free_gate_antibypass_enabled: Boolean(settings.free_gate_antibypass_enabled ?? false),
    free_gate_antibypass_seconds: Math.max(0, Number(settings.free_gate_antibypass_seconds ?? 0)),
    free_quota_timezone: "Asia/Ho_Chi_Minh",
    free_quota_day_key: dayKey,
    free_quota_remaining_today: requestedQuota?.remaining_today ?? null,
    free_quota_by_app: quotaByApp,
    free_public_note: String(settings.free_public_note ?? ""),
    free_public_links: Array.isArray(settings.free_public_links) ? settings.free_public_links : [],
    free_download_enabled: Boolean(settings.free_download_enabled ?? false),
    free_download_name: text(settings.free_download_name, 200) || null,
    free_download_info: text(settings.free_download_info, 1000) || null,
    free_download_url: sanitizeExternalUrl(settings.free_download_url),
    free_download_size: Math.max(0, Number(settings.free_download_size ?? 0)) || null,
    free_download_cards: cards,
    free_notice: {
      enabled: Boolean(settings.free_notice_enabled ?? false) && Boolean(text(settings.free_notice_content, 2000)),
      title: text(settings.free_notice_title, 200) || null,
      content: text(settings.free_notice_content, 2000) || null,
      mode: text(settings.free_notice_mode, 20).toLowerCase() === "inline" ? "inline" : "modal",
      closable: Boolean(settings.free_notice_closable ?? true),
      showOnce: Boolean(settings.free_notice_show_once ?? false),
    },
    free_external_download: {
      enabled: Boolean(settings.free_external_download_enabled ?? false) && Boolean(sanitizeExternalUrl(settings.free_external_download_url)),
      title: text(settings.free_external_download_title, 200) || null,
      description: text(settings.free_external_download_description, 1000) || null,
      url: sanitizeExternalUrl(settings.free_external_download_url),
      button_label: text(settings.free_external_download_button_label, 120) || null,
      badge: text(settings.free_external_download_badge, 120) || null,
      icon_url: sanitizeExternalUrl(settings.free_external_download_icon_url),
    },
    free_bonus: publicFreeBonus(bonusRuntime),
    find_dumps_rewards: findDumpsRewards,
    key_types: keyTypes.map((k) => {
      const rule = freeBonusRuleFor(bonusRuntime, k.code);
      return {
        code: k.code, label: k.label, kind: k.kind, value: k.value,
        duration_seconds: Number(k.duration_seconds ?? 0),
        requires_double_gate: Boolean(k.requires_double_gate ?? false),
        app_code: k.app_code ?? "free-fire", app_label: k.app_label ?? "Free Fire",
        key_signature: k.key_signature ?? "FF", allow_reset: Boolean(k.allow_reset ?? true),
        free_selection_mode: normalizeSelectionMode(k.free_selection_mode),
        free_selection_expand: Boolean(k.free_selection_expand ?? false),
        default_package_code: text(k.default_package_code, 128) || null,
        default_credit_code: text(k.default_credit_code, 128) || null,
        default_wallet_kind: text(k.default_wallet_kind, 32) || null,
        bonus_active: Boolean(bonusRuntime.active && rule?.apply_bonus && (Number(rule?.bonus_seconds ?? 0) > 0 || rule?.replace_same_app)),
        bonus_replacement: Boolean(bonusRuntime.active && rule?.apply_bonus && rule?.replace_same_app),
        bonus_seconds: bonusRuntime.active && rule?.apply_bonus ? Math.max(0, Number(rule?.bonus_seconds ?? 0)) : 0,
      };
    }),
    turnstile_enabled: false,
    turnstile_site_key: null,
    missing,
  }, 200);
}
