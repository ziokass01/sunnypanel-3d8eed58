// @ts-nocheck
const BONUS_TIMEZONE = "Asia/Ho_Chi_Minh";
const DEFAULT_NOTICE_SECONDS = 3600;
const MAX_BONUS_SECONDS = 30 * 86400;

function clampInt(value, fallback, min, max) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeTime(value, fallback) {
  const raw = String(value ?? "").trim();
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(raw);
  return match ? raw : fallback;
}

function normalizeAppCode(value) {
  return String(value ?? "").trim().toLowerCase().slice(0, 64);
}

function minuteOfDay(value) {
  const [h, m] = String(value).split(":").map(Number);
  return h * 60 + m;
}

function vietnamParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BONUS_TIMEZONE,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  let hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  if (hour === 24) hour = 0;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { hour, minute, minuteOfDay: hour * 60 + minute };
}

export function normalizeFreeBonusConfig(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const rawRules = Array.isArray(source.rules) ? source.rules : [];
  const seen = new Set();
  const rules = [];

  for (const item of rawRules) {
    if (!item || typeof item !== "object") continue;
    const keyTypeCode = String(item.key_type_code ?? "").trim().slice(0, 128);
    if (!keyTypeCode || seen.has(keyTypeCode)) continue;
    seen.add(keyTypeCode);

    const replaceSameApp = Boolean(item.replace_same_app ?? false);
    const bonusOnly = Boolean(item.bonus_only ?? replaceSameApp);
    const bonusSeconds = clampInt(item.bonus_seconds, 0, 0, MAX_BONUS_SECONDS);
    const applyBonus = Boolean(item.apply_bonus ?? item.enabled ?? false) || replaceSameApp || bonusSeconds > 0;

    rules.push({
      key_type_code: keyTypeCode,
      app_code: normalizeAppCode(item.app_code),
      apply_bonus: applyBonus,
      bonus_seconds: bonusSeconds,
      sort_order: clampInt(item.sort_order, rules.length * 10 + 10, 0, 1000000),
      bonus_only: bonusOnly,
      replace_same_app: replaceSameApp,
    });
  }

  return {
    enabled: Boolean(source.enabled ?? false),
    timezone: BONUS_TIMEZONE,
    start_time: normalizeTime(source.start_time, "00:00"),
    end_time: normalizeTime(source.end_time, "12:00"),
    disable_secondary: Boolean(source.disable_secondary ?? true),
    notice_title: String(source.notice_title ?? "Khung giờ Bonus").trim().slice(0, 120) || "Khung giờ Bonus",
    notice_content: String(source.notice_content ?? "Bonus đang diễn ra. Link phụ sẽ mở lại khi hết khung giờ Bonus.").trim().slice(0, 1200),
    notice_dismiss_seconds: clampInt(source.notice_dismiss_seconds, DEFAULT_NOTICE_SECONDS, 60, 86400),
    rules,
  };
}

export function resolveFreeBonus(raw, date = new Date()) {
  const config = normalizeFreeBonusConfig(raw);
  const start = minuteOfDay(config.start_time);
  const end = minuteOfDay(config.end_time);
  const now = vietnamParts(date).minuteOfDay;

  let activeWindow = false;
  if (start === end) activeWindow = true;
  else if (start < end) activeWindow = now >= start && now < end;
  else activeWindow = now >= start || now < end;

  const active = config.enabled && activeWindow;
  return { ...config, active };
}

export function configuredFreeBonusRuleFor(runtime, keyTypeCode) {
  const code = String(keyTypeCode ?? "").trim();
  if (!code) return null;
  return (runtime?.rules || []).find((rule) => rule.key_type_code === code) ?? null;
}

export function freeBonusRuleFor(runtime, keyTypeCode) {
  if (!runtime?.active) return null;
  return configuredFreeBonusRuleFor(runtime, keyTypeCode);
}

function replacementCodesForApp(runtime, appCode) {
  const app = normalizeAppCode(appCode);
  if (!runtime?.active || !app) return new Set();

  return new Set(
    (runtime.rules || [])
      .filter((rule) => rule.apply_bonus && rule.replace_same_app && normalizeAppCode(rule.app_code) === app)
      .map((rule) => String(rule.key_type_code)),
  );
}

export function keyTypeVisibleForBonus(keyType, runtime) {
  if (!keyType) return false;

  const code = String(keyType?.code ?? "").trim();
  const appCode = normalizeAppCode(keyType?.app_code || "free-fire") || "free-fire";
  const rule = configuredFreeBonusRuleFor(runtime, code);

  if (!runtime?.active) return !Boolean(rule?.bonus_only);
  if (rule?.bonus_only && !rule?.apply_bonus) return false;

  const replacementCodes = replacementCodesForApp(runtime, appCode);
  if (replacementCodes.size > 0) return replacementCodes.has(code);

  return true;
}

export function filterKeyTypesForBonus(rows, runtime) {
  const list = Array.isArray(rows) ? [...rows] : [];
  return list.filter((row) => keyTypeVisibleForBonus(row, runtime));
}

export function effectiveBonusDuration(baseSeconds, runtime, keyTypeCode) {
  const base = Math.max(60, Math.floor(Number(baseSeconds) || 0));
  const rule = freeBonusRuleFor(runtime, keyTypeCode);

  if (!rule || !rule.apply_bonus || rule.bonus_seconds <= 0) {
    return { base_seconds: base, bonus_seconds: 0, effective_seconds: base, applied: false };
  }

  const bonus = clampInt(rule.bonus_seconds, 0, 0, MAX_BONUS_SECONDS);
  return {
    base_seconds: base,
    bonus_seconds: bonus,
    effective_seconds: Math.min(base + bonus, 90 * 86400),
    applied: bonus > 0,
  };
}

export function sortKeyTypesForBonus(rows, runtime) {
  const list = filterKeyTypesForBonus(rows, runtime);
  if (!runtime?.active || !(runtime.rules || []).length) return list;

  const order = new Map(runtime.rules.map((rule, index) => [
    rule.key_type_code,
    Number.isFinite(Number(rule.sort_order)) ? Number(rule.sort_order) : index * 10 + 10,
  ]));

  return list
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const ao = order.has(String(a.row?.code)) ? order.get(String(a.row?.code)) : 1000000 + a.index;
      const bo = order.has(String(b.row?.code)) ? order.get(String(b.row?.code)) : 1000000 + b.index;
      if (ao !== bo) return ao - bo;
      return a.index - b.index;
    })
    .map((item) => item.row);
}

export function publicFreeBonus(runtime) {
  return {
    enabled: Boolean(runtime?.enabled),
    active: Boolean(runtime?.active),
    timezone: BONUS_TIMEZONE,
    start_time: runtime?.start_time || "00:00",
    end_time: runtime?.end_time || "12:00",
    disable_secondary: Boolean(runtime?.disable_secondary),
    notice_title: String(runtime?.notice_title || "Khung giờ Bonus"),
    notice_content: String(runtime?.notice_content || ""),
    notice_dismiss_seconds: clampInt(runtime?.notice_dismiss_seconds, DEFAULT_NOTICE_SECONDS, 60, 86400),
    rules: Array.isArray(runtime?.rules) ? runtime.rules.map((rule) => ({
      key_type_code: String(rule.key_type_code),
      app_code: normalizeAppCode(rule.app_code),
      apply_bonus: Boolean(rule.apply_bonus),
      bonus_seconds: clampInt(rule.bonus_seconds, 0, 0, MAX_BONUS_SECONDS),
      sort_order: clampInt(rule.sort_order, 0, 0, 1000000),
      bonus_only: Boolean(rule.bonus_only),
      replace_same_app: Boolean(rule.replace_same_app),
    })) : [],
  };
}
