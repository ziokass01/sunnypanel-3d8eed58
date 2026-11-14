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

    const replaceSameApp = false; // Bonus adjusts duration; never hides an enabled product.
    const bonusOnly = item.visibility_mode === "bonus_only"; // Explicit opt-in; legacy auto-hidden flags are ignored.
    const bonusSeconds = clampInt(item.bonus_seconds, 0, 0, MAX_BONUS_SECONDS);
    const applyBonus = Boolean(item.enabled ?? item.replace_same_app ?? item.apply_bonus ?? false);

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

export function keyTypeVisibleForBonus(keyType, runtime) {
  if (!keyType || keyType.enabled === false) return false;
  const rule = configuredFreeBonusRuleFor(runtime, keyType.code);
  return !rule?.bonus_only || Boolean(runtime?.active && rule.apply_bonus);
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
  // The list order belongs to licenses_free_key_types, never Bonus rules.
  return list.map((row,index)=>({row,index})).sort((a,b)=>{
    const ao=Number(a.row?.sort_order),bo=Number(b.row?.sort_order);
    const av=Number.isFinite(ao)?ao:a.index,bv=Number.isFinite(bo)?bo:b.index;
    return av-bv||a.index-b.index;
  }).map(item=>item.row);
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
      visibility_mode: rule.bonus_only ? "bonus_only" : "always",
      bonus_only: Boolean(rule.bonus_only),
      replace_same_app: Boolean(rule.replace_same_app),
    })) : [],
  };
}
