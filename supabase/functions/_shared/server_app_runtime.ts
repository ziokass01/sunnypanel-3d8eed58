import { createAdminClient, json } from "./admin.ts";

export type RuntimePlan = {
  plan_code: string;
  label: string;
  daily_soft_credit: number;
  daily_premium_credit: number;
  soft_cost_multiplier: number;
  premium_cost_multiplier: number;
  device_limit: number;
  account_limit: number;
};

export type RuntimeFeature = {
  feature_code: string;
  title: string;
  description: string | null;
  min_plan: string;
  requires_credit: boolean;
  soft_cost: number;
  premium_cost: number;
  reset_period: string;
  sort_order: number;
};

export type RuntimeAppState = {
  app: {
    code: string;
    label: string;
    description: string | null;
    public_enabled: boolean;
  };
  settings: {
    guest_plan: string;
    gift_tab_label: string;
    key_persist_until_revoked: boolean;
    daily_reset_hour: number;
  };
  current_plan: string;
  current_plan_label: string | null;
  entitlement: {
    id: string;
    plan_code: string;
    status: string;
    starts_at: string;
    expires_at: string | null;
    revoked_at: string | null;
    device_limit: number | null;
    account_limit: number | null;
  } | null;
  wallet: {
    soft_balance: number;
    premium_balance: number;
    last_soft_reset_at: string | null;
    last_premium_reset_at: string | null;
  };
  features: Array<RuntimeFeature & {
    allowed: boolean;
    effective_soft_cost: number;
    effective_premium_cost: number;
  }>;
};

type RuntimeSettings = {
  guest_plan: string;
  gift_tab_label: string;
  key_persist_until_revoked: boolean;
  daily_reset_hour: number;
};

type RuntimeWalletRules = {
  soft_daily_reset_enabled: boolean;
  premium_daily_reset_enabled: boolean;
  soft_daily_reset_amount: number;
  premium_daily_reset_amount: number;
};

type RuntimeControls = {
  runtime_enabled: boolean;
  catalog_enabled: boolean;
  redeem_enabled: boolean;
  consume_enabled: boolean;
  heartbeat_enabled: boolean;
  maintenance_notice: string | null;
  min_client_version: string | null;
  blocked_client_versions: string[];
  blocked_accounts: string[];
  blocked_devices: string[];
  blocked_ip_hashes: string[];
  max_daily_redeems_per_account: number;
  max_daily_redeems_per_device: number;
  max_requests_per_10m_per_ip: number;
  max_requests_per_10m_per_account: number;
  max_requests_per_10m_per_device: number;
  max_failed_redeems_per_hour_per_ip: number;
  max_failed_redeems_per_hour_per_account: number;
  max_failed_redeems_per_hour_per_device: number;
  max_accounts_per_device: number;
  max_devices_per_account: number;
  lock_account_to_first_device: boolean;
  lock_account_to_first_ip: boolean;
  success_health_logs_enabled: boolean;
  success_heartbeat_logs_enabled: boolean;
  session_idle_timeout_minutes: number;
  session_max_age_minutes: number;
  event_retention_days: number;
};

type RuntimeEntitlement = {
  id: string;
  plan_code: string;
  status: string;
  starts_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  device_limit: number | null;
  account_limit: number | null;
};

type RuntimeWallet = {
  id: string;
  soft_balance: number;
  premium_balance: number;
  last_soft_reset_at: string | null;
  last_premium_reset_at: string | null;
};

type RuntimeRewardPackage = {
  id: string;
  package_code: string;
  title: string;
  description: string | null;
  enabled: boolean;
  reward_mode: string;
  plan_code: string | null;
  soft_credit_amount: number;
  premium_credit_amount: number;
  entitlement_days: number;
  device_limit_override: number | null;
  account_limit_override: number | null;
};

type RuntimeRedeemKey = {
  id: string;
  reward_package_id: string | null;
  redeem_key: string;
  enabled: boolean;
  starts_at: string | null;
  expires_at: string | null;
  max_redemptions: number;
  redeemed_count: number;
  reward_mode: string;
  plan_code: string | null;
  soft_credit_amount: number;
  premium_credit_amount: number;
  entitlement_days: number;
  device_limit_override: number | null;
  account_limit_override: number | null;
  blocked_at: string | null;
  blocked_reason: string | null;
};

type RuntimeResolvedReward = {
  reward_mode: string;
  package_code: string | null;
  title: string | null;
  plan_code: string | null;
  soft_credit_amount: number;
  premium_credit_amount: number;
  entitlement_days: number;
  device_limit_override: number | null;
  account_limit_override: number | null;
};

function asString(value: unknown, fallback = "") {
  const v = String(value ?? fallback).trim();
  return v || fallback;
}

function asNullableString(value: unknown): string | null {
  const v = String(value ?? "").trim();
  return v || null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => asString(item)).filter(Boolean)));
  }
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  return Array.from(new Set(raw.split(/[,\n\r]+/).map((item) => item.trim()).filter(Boolean)));
}

function compareVersionText(left: string | null | undefined, right: string | null | undefined) {
  const a = String(left ?? "").trim();
  const b = String(right ?? "").trim();
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

function startOfUtcDayIso(base = new Date()) {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 0, 0, 0, 0)).toISOString();
}

function startOfUtcHourIso(base = new Date()) {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), base.getUTCHours(), 0, 0, 0)).toISOString();
}

function startOfUtcTenMinuteIso(base = new Date()) {
  const minute = base.getUTCMinutes();
  const roundedMinute = Math.floor(minute / 10) * 10;
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), base.getUTCHours(), roundedMinute, 0, 0)).toISOString();
}

function asNumber(value: unknown, fallback = 0) {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

function getNowIso() {
  return new Date().toISOString();
}

function minutesAgoIso(minutes: number) {
  return new Date(Date.now() - Math.max(0, minutes) * 60_000).toISOString();
}

function daysAgoIso(days: number) {
  return new Date(Date.now() - Math.max(0, days) * 86_400_000).toISOString();
}

function getSessionExpiryCode(session: any, controls: RuntimeControls) {
  if (session?.expires_at && !isFutureIso(session.expires_at)) return "SESSION_EXPIRED";
  if (controls.session_idle_timeout_minutes > 0 && session?.last_seen_at) {
    const idleMs = Date.now() - new Date(String(session.last_seen_at)).getTime();
    if (Number.isFinite(idleMs) && idleMs > controls.session_idle_timeout_minutes * 60_000) {
      return "SESSION_IDLE_TIMEOUT";
    }
  }
  if (controls.session_max_age_minutes > 0 && session?.started_at) {
    const ageMs = Date.now() - new Date(String(session.started_at)).getTime();
    if (Number.isFinite(ageMs) && ageMs > controls.session_max_age_minutes * 60_000) {
      return "SESSION_MAX_AGE_EXPIRED";
    }
  }
  return null;
}

async function expireSessionWithCode(sessionId: string, code: string) {
  const admin = createAdminClient();
  const nowIso = getNowIso();
  const patch: Record<string, unknown> = {
    status: "expired",
    updated_at: nowIso,
  };
  if (code === "SESSION_EXPIRED") {
    patch.expires_at = nowIso;
  }
  if (code === "SESSION_IDLE_TIMEOUT") {
    patch.revoke_reason = "Expired by idle timeout";
    patch.expires_at = nowIso;
  }
  if (code === "SESSION_MAX_AGE_EXPIRED") {
    patch.revoke_reason = "Expired by max session age";
    patch.expires_at = nowIso;
  }
  const { error } = await admin.from("server_app_sessions").update(patch).eq("id", sessionId);
  if (error) throw error;
}

async function enforceSessionActiveOrThrow(appCode: string, session: any) {
  const controls = await getRuntimeControls(appCode);
  const expiryCode = getSessionExpiryCode(session, controls);
  if (expiryCode) {
    await expireSessionWithCode(asString(session.id), expiryCode);
    throw Object.assign(new Error(expiryCode), { status: 409, code: expiryCode });
  }
  return controls;
}

function addDaysIso(baseIso: string, days: number) {
  const baseMs = new Date(baseIso).getTime();
  return new Date(baseMs + Math.max(0, days) * 86_400_000).toISOString();
}

function isFutureIso(iso: string | null | undefined) {
  if (!iso) return false;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) && ms > Date.now();
}

function isEntitlementUsable(entitlement: RuntimeEntitlement | null | undefined) {
  if (!entitlement) return false;
  if (asString(entitlement.status, "active") !== "active") return false;
  if (entitlement.revoked_at) return false;
  if (entitlement.expires_at && !isFutureIso(entitlement.expires_at)) return false;
  return true;
}

function getCycleStartIso(now: Date, dailyResetHour: number) {
  const hour = Math.max(0, Math.min(23, Math.trunc(dailyResetHour || 0)));
  const cycle = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    hour,
    0,
    0,
    0,
  ));
  if (now.getTime() < cycle.getTime()) {
    cycle.setUTCDate(cycle.getUTCDate() - 1);
  }
  return cycle.toISOString();
}

function makeSessionToken() {
  return `${crypto.randomUUID().replaceAll("-", "")}.${Date.now().toString(36)}`;
}

function normalizeSettings(config: any): RuntimeSettings {
  const settings = Array.isArray(config?.settings) ? config.settings[0] : config?.settings;
  return {
    guest_plan: asString(settings?.guest_plan, "classic"),
    gift_tab_label: asString(settings?.gift_tab_label, "Quà tặng"),
    key_persist_until_revoked: Boolean(settings?.key_persist_until_revoked ?? true),
    daily_reset_hour: Math.max(0, Math.min(23, Math.trunc(asNumber(settings?.daily_reset_hour, 0)))),
  };
}

export async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getAppConfig(appCode: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("server_apps")
    .select(`
      code,
      label,
      description,
      public_enabled,
      settings:server_app_settings (
        guest_plan,
        gift_tab_label,
        key_persist_until_revoked,
        daily_reset_hour
      )
    `)
    .eq("code", appCode)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getPlans(appCode: string): Promise<RuntimePlan[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("server_app_plans")
    .select("plan_code,label,daily_soft_credit,daily_premium_credit,soft_cost_multiplier,premium_cost_multiplier,device_limit,account_limit")
    .eq("app_code", appCode)
    .eq("enabled", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    plan_code: asString(row.plan_code),
    label: asString(row.label),
    daily_soft_credit: asNumber(row.daily_soft_credit),
    daily_premium_credit: asNumber(row.daily_premium_credit),
    soft_cost_multiplier: asNumber(row.soft_cost_multiplier, 1),
    premium_cost_multiplier: asNumber(row.premium_cost_multiplier, 1),
    device_limit: Math.max(1, Math.trunc(asNumber(row.device_limit, 1))),
    account_limit: Math.max(1, Math.trunc(asNumber(row.account_limit, 1))),
  }));
}

async function getFeatures(appCode: string): Promise<RuntimeFeature[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("server_app_features")
    .select("feature_code,title,description,min_plan,requires_credit,soft_cost,premium_cost,reset_period,sort_order")
    .eq("app_code", appCode)
    .eq("enabled", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    feature_code: asString(row.feature_code),
    title: asString(row.title),
    description: asNullableString(row.description),
    min_plan: asString(row.min_plan, "classic"),
    requires_credit: Boolean(row.requires_credit),
    soft_cost: asNumber(row.soft_cost),
    premium_cost: asNumber(row.premium_cost),
    reset_period: asString(row.reset_period, "daily"),
    sort_order: Math.trunc(asNumber(row.sort_order)),
  }));
}

async function getWalletRules(appCode: string): Promise<RuntimeWalletRules> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("server_app_wallet_rules")
    .select("soft_daily_reset_enabled,premium_daily_reset_enabled,soft_daily_reset_amount,premium_daily_reset_amount")
    .eq("app_code", appCode)
    .maybeSingle();

  if (error) throw error;
  return {
    soft_daily_reset_enabled: Boolean(data?.soft_daily_reset_enabled ?? false),
    premium_daily_reset_enabled: Boolean(data?.premium_daily_reset_enabled ?? false),
    soft_daily_reset_amount: asNumber(data?.soft_daily_reset_amount),
    premium_daily_reset_amount: asNumber(data?.premium_daily_reset_amount),
  };
}

export async function getRuntimeControls(appCode: string): Promise<RuntimeControls> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("server_app_runtime_controls")
    .select("runtime_enabled,catalog_enabled,redeem_enabled,consume_enabled,heartbeat_enabled,maintenance_notice,min_client_version,blocked_client_versions,blocked_accounts,blocked_devices,blocked_ip_hashes,max_daily_redeems_per_account,max_daily_redeems_per_device,max_requests_per_10m_per_ip,max_requests_per_10m_per_account,max_requests_per_10m_per_device,max_failed_redeems_per_hour_per_ip,max_failed_redeems_per_hour_per_account,max_failed_redeems_per_hour_per_device,max_accounts_per_device,max_devices_per_account,lock_account_to_first_device,lock_account_to_first_ip,success_health_logs_enabled,success_heartbeat_logs_enabled,session_idle_timeout_minutes,session_max_age_minutes,event_retention_days")
    .eq("app_code", appCode)
    .maybeSingle();

  if (error) throw error;
  return {
    runtime_enabled: Boolean(data?.runtime_enabled ?? true),
    catalog_enabled: Boolean(data?.catalog_enabled ?? true),
    redeem_enabled: Boolean(data?.redeem_enabled ?? true),
    consume_enabled: Boolean(data?.consume_enabled ?? true),
    heartbeat_enabled: Boolean(data?.heartbeat_enabled ?? true),
    maintenance_notice: asNullableString(data?.maintenance_notice),
    min_client_version: asNullableString(data?.min_client_version),
    blocked_client_versions: asStringArray(data?.blocked_client_versions),
    blocked_accounts: asStringArray(data?.blocked_accounts),
    blocked_devices: asStringArray(data?.blocked_devices),
    blocked_ip_hashes: asStringArray(data?.blocked_ip_hashes),
    max_daily_redeems_per_account: Math.max(0, Math.trunc(asNumber(data?.max_daily_redeems_per_account, 0))),
    max_daily_redeems_per_device: Math.max(0, Math.trunc(asNumber(data?.max_daily_redeems_per_device, 0))),
    max_requests_per_10m_per_ip: Math.max(0, Math.trunc(asNumber(data?.max_requests_per_10m_per_ip, 0))),
    max_requests_per_10m_per_account: Math.max(0, Math.trunc(asNumber(data?.max_requests_per_10m_per_account, 0))),
    max_requests_per_10m_per_device: Math.max(0, Math.trunc(asNumber(data?.max_requests_per_10m_per_device, 0))),
    max_failed_redeems_per_hour_per_ip: Math.max(0, Math.trunc(asNumber(data?.max_failed_redeems_per_hour_per_ip, 0))),
    max_failed_redeems_per_hour_per_account: Math.max(0, Math.trunc(asNumber(data?.max_failed_redeems_per_hour_per_account, 0))),
    max_failed_redeems_per_hour_per_device: Math.max(0, Math.trunc(asNumber(data?.max_failed_redeems_per_hour_per_device, 0))),
    max_accounts_per_device: Math.max(0, Math.trunc(asNumber(data?.max_accounts_per_device, 0))),
    max_devices_per_account: Math.max(0, Math.trunc(asNumber(data?.max_devices_per_account, 0))),
    lock_account_to_first_device: Boolean(data?.lock_account_to_first_device ?? false),
    lock_account_to_first_ip: Boolean(data?.lock_account_to_first_ip ?? false),
    success_health_logs_enabled: Boolean(data?.success_health_logs_enabled ?? false),
    success_heartbeat_logs_enabled: Boolean(data?.success_heartbeat_logs_enabled ?? false),
    session_idle_timeout_minutes: Math.max(0, Math.trunc(asNumber(data?.session_idle_timeout_minutes, 1440))),
    session_max_age_minutes: Math.max(0, Math.trunc(asNumber(data?.session_max_age_minutes, 43200))),
    event_retention_days: Math.max(1, Math.trunc(asNumber(data?.event_retention_days, 30))),
  };
}

export async function countRuntimeSuccessEvents(params: {
  appCode: string;
  eventType: string;
  accountRef?: string | null;
  deviceId?: string | null;
  sinceIso?: string | null;
}) {
  const admin = createAdminClient();
  let query = admin
    .from("server_app_runtime_events")
    .select("id", { count: "exact", head: true })
    .eq("app_code", params.appCode)
    .eq("event_type", params.eventType)
    .eq("ok", true);

  const accountRef = asNullableString(params.accountRef);
  const deviceId = asNullableString(params.deviceId);
  const sinceIso = asNullableString(params.sinceIso) ?? startOfUtcDayIso();

  if (accountRef) query = query.eq("account_ref", accountRef);
  if (deviceId) query = query.eq("device_id", deviceId);
  if (sinceIso) query = query.gte("created_at", sinceIso);

  const { count, error } = await query;
  if (error) throw error;
  return Number(count ?? 0);
}

export async function logRuntimeEvent(payload: Record<string, unknown>) {
  const admin = createAdminClient();
  const normalized = {
    app_code: asString(payload.app_code),
    event_type: asString(payload.event_type),
    ok: Boolean(payload.ok ?? true),
    code: asNullableString(payload.code),
    message: asNullableString(payload.message),
    account_ref: asNullableString(payload.account_ref),
    device_id: asNullableString(payload.device_id),
    session_id: asNullableString(payload.session_id),
    redeem_key_id: asNullableString(payload.redeem_key_id),
    feature_code: asNullableString(payload.feature_code),
    wallet_kind: asNullableString(payload.wallet_kind),
    ip_hash: asNullableString(payload.ip_hash),
    client_version: asNullableString(payload.client_version),
    meta: typeof payload.meta === "object" && payload.meta != null ? payload.meta : {},
  };

  const { error } = await admin.from("server_app_runtime_events").insert(normalized);
  if (error) throw error;
}

type RuntimeCounterSubjectKind = "ip" | "account" | "device";
type RuntimeCounterWindowKind = "10m" | "1h" | "1d";

function getCounterWindowStart(kind: RuntimeCounterWindowKind, base = new Date()) {
  if (kind === "10m") return startOfUtcTenMinuteIso(base);
  if (kind === "1h") return startOfUtcHourIso(base);
  return startOfUtcDayIso(base);
}

export async function getRuntimeCounterBucket(params: {
  appCode: string;
  action: string;
  subjectKind: RuntimeCounterSubjectKind;
  subjectValue?: string | null;
  windowKind: RuntimeCounterWindowKind;
  base?: Date;
}) {
  const subjectValue = asNullableString(params.subjectValue);
  if (!subjectValue) return null;
  const admin = createAdminClient();
  const windowStart = getCounterWindowStart(params.windowKind, params.base ?? new Date());
  const { data, error } = await admin
    .from("server_app_runtime_counter_buckets")
    .select("total_count,success_count,failed_count")
    .eq("app_code", params.appCode)
    .eq("action", params.action)
    .eq("subject_kind", params.subjectKind)
    .eq("subject_value", subjectValue)
    .eq("window_kind", params.windowKind)
    .eq("window_start", windowStart)
    .maybeSingle();
  if (error) throw error;
  return {
    total_count: Math.max(0, Math.trunc(asNumber((data as any)?.total_count, 0))),
    success_count: Math.max(0, Math.trunc(asNumber((data as any)?.success_count, 0))),
    failed_count: Math.max(0, Math.trunc(asNumber((data as any)?.failed_count, 0))),
  };
}

export async function bumpRuntimeCounter(params: {
  appCode: string;
  action: string;
  subjectKind: RuntimeCounterSubjectKind;
  subjectValue?: string | null;
  ok: boolean;
  windowKind: RuntimeCounterWindowKind;
  base?: Date;
}) {
  const subjectValue = asNullableString(params.subjectValue);
  if (!subjectValue) return;
  const admin = createAdminClient();
  const windowStart = getCounterWindowStart(params.windowKind, params.base ?? new Date());
  const key = {
    app_code: params.appCode,
    action: params.action,
    subject_kind: params.subjectKind,
    subject_value: subjectValue,
    window_kind: params.windowKind,
    window_start: windowStart,
  };
  const { data: existing, error: readError } = await admin
    .from("server_app_runtime_counter_buckets")
    .select("total_count,success_count,failed_count")
    .match(key)
    .maybeSingle();
  if (readError) throw readError;

  const nextTotal = Math.max(0, Math.trunc(asNumber((existing as any)?.total_count, 0))) + 1;
  const nextSuccess = Math.max(0, Math.trunc(asNumber((existing as any)?.success_count, 0))) + (params.ok ? 1 : 0);
  const nextFailed = Math.max(0, Math.trunc(asNumber((existing as any)?.failed_count, 0))) + (params.ok ? 0 : 1);

  const payload = {
    ...key,
    total_count: nextTotal,
    success_count: nextSuccess,
    failed_count: nextFailed,
    last_seen_at: getNowIso(),
    first_seen_at: (existing as any)?.first_seen_at ?? getNowIso(),
  };

  const { error } = await admin
    .from("server_app_runtime_counter_buckets")
    .upsert(payload, { onConflict: "app_code,action,subject_kind,subject_value,window_kind,window_start" });
  if (error) throw error;
}

export async function trackRuntimeAccountDevice(params: {
  appCode: string;
  accountRef?: string | null;
  deviceId?: string | null;
  ipHash?: string | null;
  controls?: RuntimeControls | null;
}) {
  const appCode = asString(params.appCode);
  const accountRef = asNullableString(params.accountRef);
  const deviceId = asNullableString(params.deviceId);
  const ipHash = asNullableString(params.ipHash);
  if (!appCode || !accountRef || !deviceId) return;

  const controls = params.controls ?? await getRuntimeControls(appCode);
  const admin = createAdminClient();
  const nowIso = getNowIso();

  const { data: binding, error: bindingError } = await admin
    .from("server_app_runtime_account_bindings")
    .select("first_device_id,first_ip_hash,locked_until,lock_reason")
    .eq("app_code", appCode)
    .eq("account_ref", accountRef)
    .maybeSingle();
  if (bindingError) throw bindingError;

  const lockedUntil = asNullableString((binding as any)?.locked_until);
  if (lockedUntil && isFutureIso(lockedUntil)) {
    throw Object.assign(new Error(asNullableString((binding as any)?.lock_reason) || "ACCOUNT_LOCKED_BY_RUNTIME_BINDING"), {
      status: 423,
      code: "ACCOUNT_LOCKED_BY_RUNTIME_BINDING",
    });
  }

  if (controls.lock_account_to_first_device) {
    const firstDeviceId = asNullableString((binding as any)?.first_device_id);
    if (firstDeviceId && firstDeviceId !== deviceId) {
      await admin
        .from("server_app_runtime_account_bindings")
        .upsert({
          app_code: appCode,
          account_ref: accountRef,
          first_device_id: firstDeviceId,
          first_ip_hash: asNullableString((binding as any)?.first_ip_hash),
          last_device_id: deviceId,
          last_ip_hash: ipHash,
          locked_at: nowIso,
          locked_until: nowIso,
          lock_reason: "ACCOUNT_DEVICE_BINDING_MISMATCH",
          metadata: { observed_device_id: deviceId },
        }, { onConflict: "app_code,account_ref" });
      throw Object.assign(new Error("ACCOUNT_DEVICE_BINDING_MISMATCH"), {
        status: 423,
        code: "ACCOUNT_DEVICE_BINDING_MISMATCH",
      });
    }
  }

  if (controls.lock_account_to_first_ip) {
    const firstIpHash = asNullableString((binding as any)?.first_ip_hash);
    if (firstIpHash && ipHash && firstIpHash !== ipHash) {
      await admin
        .from("server_app_runtime_account_bindings")
        .upsert({
          app_code: appCode,
          account_ref: accountRef,
          first_device_id: asNullableString((binding as any)?.first_device_id) ?? deviceId,
          first_ip_hash: firstIpHash,
          last_device_id: deviceId,
          last_ip_hash: ipHash,
          locked_at: nowIso,
          locked_until: nowIso,
          lock_reason: "ACCOUNT_IP_BINDING_MISMATCH",
          metadata: { observed_ip_hash: ipHash },
        }, { onConflict: "app_code,account_ref" });
      throw Object.assign(new Error("ACCOUNT_IP_BINDING_MISMATCH"), {
        status: 423,
        code: "ACCOUNT_IP_BINDING_MISMATCH",
      });
    }
  }

  const { data: existingAccountDevice, error: existingAccountDeviceError } = await admin
    .from("server_app_runtime_account_devices")
    .select("device_id", { count: "exact", head: false })
    .eq("app_code", appCode)
    .eq("account_ref", accountRef)
    .eq("device_id", deviceId);
  if (existingAccountDeviceError) throw existingAccountDeviceError;
  const hasAccountDevice = Array.isArray(existingAccountDevice) && existingAccountDevice.length > 0;
  if (!hasAccountDevice && controls.max_devices_per_account > 0) {
    const { count, error: countError } = await admin
      .from("server_app_runtime_account_devices")
      .select("device_id", { count: "exact", head: true })
      .eq("app_code", appCode)
      .eq("account_ref", accountRef);
    if (countError) throw countError;
    if (Number(count ?? 0) >= controls.max_devices_per_account) {
      throw Object.assign(new Error("ACCOUNT_DEVICE_LIMIT_REACHED"), { status: 429, code: "ACCOUNT_DEVICE_LIMIT_REACHED" });
    }
  }

  const { data: existingDeviceAccount, error: existingDeviceAccountError } = await admin
    .from("server_app_runtime_device_accounts")
    .select("account_ref")
    .eq("app_code", appCode)
    .eq("device_id", deviceId)
    .eq("account_ref", accountRef)
    .maybeSingle();
  if (existingDeviceAccountError) throw existingDeviceAccountError;
  if (!existingDeviceAccount && controls.max_accounts_per_device > 0) {
    const { count, error: countError } = await admin
      .from("server_app_runtime_device_accounts")
      .select("account_ref", { count: "exact", head: true })
      .eq("app_code", appCode)
      .eq("device_id", deviceId);
    if (countError) throw countError;
    if (Number(count ?? 0) >= controls.max_accounts_per_device) {
      throw Object.assign(new Error("DEVICE_ACCOUNT_LIMIT_REACHED"), { status: 429, code: "DEVICE_ACCOUNT_LIMIT_REACHED" });
    }
  }

  await admin.from("server_app_runtime_account_bindings").upsert({
    app_code: appCode,
    account_ref: accountRef,
    first_device_id: asNullableString((binding as any)?.first_device_id) ?? deviceId,
    first_ip_hash: asNullableString((binding as any)?.first_ip_hash) ?? ipHash,
    last_device_id: deviceId,
    last_ip_hash: ipHash,
    lock_reason: null,
    locked_at: null,
    locked_until: null,
    metadata: {
      linked_device_id: deviceId,
      linked_ip_hash: ipHash,
      last_seen_at: nowIso,
    },
  }, { onConflict: "app_code,account_ref" });

  await admin.from("server_app_runtime_account_devices").upsert({
    app_code: appCode,
    account_ref: accountRef,
    device_id: deviceId,
    first_ip_hash: ipHash,
    last_ip_hash: ipHash,
    last_seen_at: nowIso,
  }, { onConflict: "app_code,account_ref,device_id" });

  await admin.from("server_app_runtime_device_accounts").upsert({
    app_code: appCode,
    device_id: deviceId,
    account_ref: accountRef,
    first_ip_hash: ipHash,
    last_ip_hash: ipHash,
    last_seen_at: nowIso,
  }, { onConflict: "app_code,device_id,account_ref" });
}


export function shouldSkipSuccessRuntimeEventLog(action: string, controls?: RuntimeControls | null) {
  const normalized = asString(action).toLowerCase();
  if (normalized === "health") return !(controls?.success_health_logs_enabled ?? false);
  if (normalized === "heartbeat") return !(controls?.success_heartbeat_logs_enabled ?? false);
  return false;
}

function getPlanRank(planCode: string) {
  const normalized = asString(planCode, "classic").toLowerCase();
  switch (normalized) {
    case "classic": return 10;
    case "go": return 20;
    case "plus": return 30;
    case "pro": return 40;
    default: return 0;
  }
}

async function findSession(appCode: string, sessionToken: string) {
  const admin = createAdminClient();
  const tokenHash = await sha256Hex(sessionToken);
  const { data, error } = await admin
    .from("server_app_sessions")
    .select("id,app_code,account_ref,device_id,entitlement_id,redeem_key_id,status,started_at,last_seen_at,expires_at,revoked_at,client_version")
    .eq("app_code", appCode)
    .eq("session_token_hash", tokenHash)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getEntitlementById(entitlementId: string | null): Promise<RuntimeEntitlement | null> {
  if (!entitlementId) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("server_app_entitlements")
    .select("id,plan_code,status,starts_at,expires_at,revoked_at,device_limit,account_limit")
    .eq("id", entitlementId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    id: asString((data as any).id),
    plan_code: asString((data as any).plan_code),
    status: asString((data as any).status, "active"),
    starts_at: asString((data as any).starts_at),
    expires_at: asNullableString((data as any).expires_at),
    revoked_at: asNullableString((data as any).revoked_at),
    device_limit: (data as any).device_limit == null ? null : Math.trunc(asNumber((data as any).device_limit)),
    account_limit: (data as any).account_limit == null ? null : Math.trunc(asNumber((data as any).account_limit)),
  };
}

async function getLatestActiveEntitlement(appCode: string, accountRef: string): Promise<RuntimeEntitlement | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("server_app_entitlements")
    .select("id,plan_code,status,starts_at,expires_at,revoked_at,device_limit,account_limit")
    .eq("app_code", appCode)
    .eq("account_ref", accountRef)
    .eq("status", "active")
    .order("starts_at", { ascending: false });

  if (error) throw error;
  const now = Date.now();
  const row = (data ?? []).find((item: any) => {
    if (item?.revoked_at) return false;
    if (!item?.expires_at) return true;
    return new Date(String(item.expires_at)).getTime() > now;
  }) ?? null;
  if (!row) return null;
  return {
    id: asString(row.id),
    plan_code: asString(row.plan_code),
    status: asString(row.status, "active"),
    starts_at: asString(row.starts_at),
    expires_at: asNullableString(row.expires_at),
    revoked_at: asNullableString(row.revoked_at),
    device_limit: row.device_limit == null ? null : Math.trunc(asNumber(row.device_limit)),
    account_limit: row.account_limit == null ? null : Math.trunc(asNumber(row.account_limit)),
  };
}

async function getWalletRecord(appCode: string, accountRef: string): Promise<RuntimeWallet | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("server_app_wallet_balances")
    .select("id,soft_balance,premium_balance,last_soft_reset_at,last_premium_reset_at")
    .eq("app_code", appCode)
    .eq("account_ref", accountRef)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    id: asString((data as any).id),
    soft_balance: asNumber((data as any).soft_balance),
    premium_balance: asNumber((data as any).premium_balance),
    last_soft_reset_at: asNullableString((data as any).last_soft_reset_at),
    last_premium_reset_at: asNullableString((data as any).last_premium_reset_at),
  };
}

async function ensureWalletRecord(appCode: string, accountRef: string, deviceId?: string | null): Promise<RuntimeWallet> {
  const existing = await getWalletRecord(appCode, accountRef);
  if (existing) return existing;

  const admin = createAdminClient();
  const payload = {
    app_code: appCode,
    account_ref: accountRef,
    device_id: asNullableString(deviceId),
    soft_balance: 0,
    premium_balance: 0,
    updated_by_source: "runtime_bootstrap",
  };

  const { error } = await admin
    .from("server_app_wallet_balances")
    .upsert(payload, { onConflict: "app_code,account_ref" });

  if (error) throw error;
  const fresh = await getWalletRecord(appCode, accountRef);
  if (!fresh) {
    throw Object.assign(new Error("WALLET_BOOTSTRAP_FAILED"), { status: 500, code: "WALLET_BOOTSTRAP_FAILED" });
  }
  return fresh;
}

async function insertWalletTransaction(payload: Record<string, unknown>) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("server_app_wallet_transactions")
    .insert(payload);
  if (error) throw error;
}

async function ensureWalletFresh(appCode: string, accountRef: string, currentPlan: RuntimePlan | null, settings: RuntimeSettings, deviceId?: string | null) {
  const walletRules = await getWalletRules(appCode);
  const wallet = await ensureWalletRecord(appCode, accountRef, deviceId);
  const cycleStartIso = getCycleStartIso(new Date(), settings.daily_reset_hour);
  const admin = createAdminClient();

  let nextSoftBalance = wallet.soft_balance;
  let nextPremiumBalance = wallet.premium_balance;
  let nextSoftResetAt = wallet.last_soft_reset_at;
  let nextPremiumResetAt = wallet.last_premium_reset_at;
  let touched = false;

  const softTarget = round2(Math.max(
    walletRules.soft_daily_reset_enabled ? walletRules.soft_daily_reset_amount : 0,
    currentPlan?.daily_soft_credit ?? 0,
  ));
  const premiumTarget = round2(Math.max(
    walletRules.premium_daily_reset_enabled ? walletRules.premium_daily_reset_amount : 0,
    currentPlan?.daily_premium_credit ?? 0,
  ));

  if (walletRules.soft_daily_reset_enabled && (!wallet.last_soft_reset_at || wallet.last_soft_reset_at < cycleStartIso)) {
    const prev = nextSoftBalance;
    nextSoftBalance = round2(Math.max(nextSoftBalance, softTarget));
    nextSoftResetAt = getNowIso();
    touched = true;
    if (nextSoftBalance !== prev) {
      await insertWalletTransaction({
        app_code: appCode,
        wallet_balance_id: wallet.id,
        account_ref: accountRef,
        device_id: asNullableString(deviceId),
        transaction_type: "reset",
        wallet_kind: "soft",
        soft_delta: round2(nextSoftBalance - prev),
        premium_delta: 0,
        soft_balance_after: nextSoftBalance,
        premium_balance_after: nextPremiumBalance,
        note: `Daily soft reset at hour ${settings.daily_reset_hour}`,
        metadata: { plan_code: currentPlan?.plan_code ?? null, cycle_start: cycleStartIso },
      });
    }
  }

  if (walletRules.premium_daily_reset_enabled && (!wallet.last_premium_reset_at || wallet.last_premium_reset_at < cycleStartIso)) {
    const prev = nextPremiumBalance;
    nextPremiumBalance = round2(Math.max(nextPremiumBalance, premiumTarget));
    nextPremiumResetAt = getNowIso();
    touched = true;
    if (nextPremiumBalance !== prev) {
      await insertWalletTransaction({
        app_code: appCode,
        wallet_balance_id: wallet.id,
        account_ref: accountRef,
        device_id: asNullableString(deviceId),
        transaction_type: "reset",
        wallet_kind: "premium",
        soft_delta: 0,
        premium_delta: round2(nextPremiumBalance - prev),
        soft_balance_after: nextSoftBalance,
        premium_balance_after: nextPremiumBalance,
        note: `Daily premium reset at hour ${settings.daily_reset_hour}`,
        metadata: { plan_code: currentPlan?.plan_code ?? null, cycle_start: cycleStartIso },
      });
    }
  }

  if (touched) {
    const { error } = await admin
      .from("server_app_wallet_balances")
      .update({
        soft_balance: nextSoftBalance,
        premium_balance: nextPremiumBalance,
        last_soft_reset_at: nextSoftResetAt,
        last_premium_reset_at: nextPremiumResetAt,
        updated_by_source: "runtime_daily_reset",
        updated_at: getNowIso(),
      })
      .eq("id", wallet.id);
    if (error) throw error;
  }

  return await getWalletRecord(appCode, accountRef) ?? wallet;
}

async function getRewardPackageById(packageId: string | null): Promise<RuntimeRewardPackage | null> {
  if (!packageId) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("server_app_reward_packages")
    .select("id,package_code,title,description,enabled,reward_mode,plan_code,soft_credit_amount,premium_credit_amount,entitlement_days,device_limit_override,account_limit_override")
    .eq("id", packageId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    id: asString((data as any).id),
    package_code: asString((data as any).package_code),
    title: asString((data as any).title),
    description: asNullableString((data as any).description),
    enabled: Boolean((data as any).enabled ?? true),
    reward_mode: asString((data as any).reward_mode, "plan"),
    plan_code: asNullableString((data as any).plan_code),
    soft_credit_amount: asNumber((data as any).soft_credit_amount),
    premium_credit_amount: asNumber((data as any).premium_credit_amount),
    entitlement_days: Math.max(0, Math.trunc(asNumber((data as any).entitlement_days))),
    device_limit_override: (data as any).device_limit_override == null ? null : Math.trunc(asNumber((data as any).device_limit_override)),
    account_limit_override: (data as any).account_limit_override == null ? null : Math.trunc(asNumber((data as any).account_limit_override)),
  };
}

async function getRedeemKeyByValue(appCode: string, redeemKey: string): Promise<RuntimeRedeemKey | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("server_app_redeem_keys")
    .select("id,reward_package_id,redeem_key,enabled,starts_at,expires_at,max_redemptions,redeemed_count,reward_mode,plan_code,soft_credit_amount,premium_credit_amount,entitlement_days,device_limit_override,account_limit_override,blocked_at,blocked_reason")
    .eq("app_code", appCode)
    .eq("redeem_key", redeemKey)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    id: asString((data as any).id),
    reward_package_id: asNullableString((data as any).reward_package_id),
    redeem_key: asString((data as any).redeem_key),
    enabled: Boolean((data as any).enabled ?? true),
    starts_at: asNullableString((data as any).starts_at),
    expires_at: asNullableString((data as any).expires_at),
    max_redemptions: Math.max(1, Math.trunc(asNumber((data as any).max_redemptions, 1))),
    redeemed_count: Math.max(0, Math.trunc(asNumber((data as any).redeemed_count, 0))),
    reward_mode: asString((data as any).reward_mode, "package"),
    plan_code: asNullableString((data as any).plan_code),
    soft_credit_amount: asNumber((data as any).soft_credit_amount),
    premium_credit_amount: asNumber((data as any).premium_credit_amount),
    entitlement_days: Math.max(0, Math.trunc(asNumber((data as any).entitlement_days))),
    device_limit_override: (data as any).device_limit_override == null ? null : Math.trunc(asNumber((data as any).device_limit_override)),
    account_limit_override: (data as any).account_limit_override == null ? null : Math.trunc(asNumber((data as any).account_limit_override)),
    blocked_at: asNullableString((data as any).blocked_at),
    blocked_reason: asNullableString((data as any).blocked_reason),
  };
}

function resolveRewardPackage(keyRow: RuntimeRedeemKey, pkg: RuntimeRewardPackage | null): RuntimeResolvedReward {
  if (keyRow.reward_package_id && pkg) {
    return {
      reward_mode: asString(pkg.reward_mode, keyRow.reward_mode),
      package_code: pkg.package_code,
      title: pkg.title,
      plan_code: pkg.plan_code,
      soft_credit_amount: round2(pkg.soft_credit_amount),
      premium_credit_amount: round2(pkg.premium_credit_amount),
      entitlement_days: Math.max(0, pkg.entitlement_days),
      device_limit_override: pkg.device_limit_override,
      account_limit_override: pkg.account_limit_override,
    };
  }

  return {
    reward_mode: asString(keyRow.reward_mode, "mixed"),
    package_code: null,
    title: null,
    plan_code: keyRow.plan_code,
    soft_credit_amount: round2(keyRow.soft_credit_amount),
    premium_credit_amount: round2(keyRow.premium_credit_amount),
    entitlement_days: Math.max(0, keyRow.entitlement_days),
    device_limit_override: keyRow.device_limit_override,
    account_limit_override: keyRow.account_limit_override,
  };
}

async function reserveRedeemKeyUse(keyRow: RuntimeRedeemKey, accountRef: string, deviceId: string) {
  const nowIso = getNowIso();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("server_app_redeem_keys")
    .update({
      redeemed_count: keyRow.redeemed_count + 1,
      last_redeemed_at: nowIso,
      updated_at: nowIso,
      metadata: {
        last_account_ref: accountRef,
        last_device_id: deviceId,
        last_redeemed_at: nowIso,
      },
    })
    .eq("id", keyRow.id)
    .eq("redeemed_count", keyRow.redeemed_count)
    .select("id,redeemed_count")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("REDEEM_KEY_BUSY"), { status: 409, code: "REDEEM_KEY_BUSY" });
  }
}

async function revokeActiveDeviceSessions(appCode: string, accountRef: string, deviceId: string, reason: string) {
  const admin = createAdminClient();
  const nowIso = getNowIso();
  const { error } = await admin
    .from("server_app_sessions")
    .update({
      status: "revoked",
      revoked_at: nowIso,
      revoke_reason: reason,
      last_seen_at: nowIso,
      updated_at: nowIso,
    })
    .eq("app_code", appCode)
    .eq("account_ref", accountRef)
    .eq("device_id", deviceId)
    .eq("status", "active");

  if (error) throw error;
}

async function countOtherActiveDevices(appCode: string, accountRef: string, currentDeviceId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("server_app_sessions")
    .select("device_id")
    .eq("app_code", appCode)
    .eq("account_ref", accountRef)
    .eq("status", "active");

  if (error) throw error;
  const devices = new Set<string>();
  for (const row of data ?? []) {
    const deviceId = asString((row as any).device_id);
    if (deviceId && deviceId !== currentDeviceId) devices.add(deviceId);
  }
  return devices.size;
}

async function createRuntimeSession(params: {
  appCode: string;
  accountRef: string;
  deviceId: string;
  entitlementId: string | null;
  redeemKeyId: string | null;
  clientVersion?: string | null;
  ipHash?: string | null;
}) {
  const admin = createAdminClient();
  const sessionToken = makeSessionToken();
  const tokenHash = await sha256Hex(sessionToken);
  const nowIso = getNowIso();

  const payload = {
    app_code: params.appCode,
    account_ref: params.accountRef,
    device_id: params.deviceId,
    entitlement_id: params.entitlementId,
    redeem_key_id: params.redeemKeyId,
    session_token_hash: tokenHash,
    status: "active",
    started_at: nowIso,
    last_seen_at: nowIso,
    expires_at: null,
    revoked_at: null,
    revoke_reason: null,
    client_version: asNullableString(params.clientVersion),
    ip_hash: asNullableString(params.ipHash),
  };

  const { data, error } = await admin
    .from("server_app_sessions")
    .insert(payload)
    .select("id,started_at,last_seen_at")
    .single();

  if (error) throw error;
  return {
    session_token: sessionToken,
    session: {
      id: asString((data as any).id),
      started_at: asString((data as any).started_at),
      last_seen_at: asString((data as any).last_seen_at),
      account_ref: params.accountRef,
      device_id: params.deviceId,
    },
  };
}

async function patchEntitlementUsage(entitlementId: string | null, patch: Record<string, unknown>) {
  if (!entitlementId) return;
  const admin = createAdminClient();
  const { error } = await admin
    .from("server_app_entitlements")
    .update({ ...patch, updated_at: getNowIso() })
    .eq("id", entitlementId);
  if (error) throw error;
}

async function upsertRuntimeEntitlement(params: {
  appCode: string;
  accountRef: string;
  deviceId: string;
  existing: RuntimeEntitlement | null;
  reward: RuntimeResolvedReward;
  planDefaults: RuntimePlan | null;
  redeemKeyId: string;
  rewardPackageId: string | null;
  settings: RuntimeSettings;
}) {
  const shouldGrantEntitlement = Boolean(
    params.reward.plan_code ||
    params.reward.entitlement_days > 0 ||
    params.reward.device_limit_override != null ||
    params.reward.account_limit_override != null,
  );
  if (!shouldGrantEntitlement) return null;

  const admin = createAdminClient();
  const nowIso = getNowIso();
  const usableExisting = isEntitlementUsable(params.existing) ? params.existing : null;
  const planCode = asString(
    params.reward.plan_code ?? usableExisting?.plan_code ?? params.settings.guest_plan,
    params.settings.guest_plan,
  );

  const deviceLimit = params.reward.device_limit_override
    ?? params.planDefaults?.device_limit
    ?? usableExisting?.device_limit
    ?? null;
  const accountLimit = params.reward.account_limit_override
    ?? params.planDefaults?.account_limit
    ?? usableExisting?.account_limit
    ?? null;

  const baseExpiry = usableExisting?.expires_at && isFutureIso(usableExisting.expires_at)
    ? usableExisting.expires_at
    : nowIso;
  const nextExpiry = params.reward.entitlement_days > 0
    ? addDaysIso(baseExpiry, params.reward.entitlement_days)
    : (params.settings.key_persist_until_revoked ? null : usableExisting?.expires_at ?? null);

  const payload = {
    app_code: params.appCode,
    account_ref: params.accountRef,
    device_id: params.deviceId,
    plan_code: planCode,
    source_type: params.rewardPackageId ? "reward_package" : "redeem_key",
    source_redeem_key_id: params.redeemKeyId,
    source_reward_package_id: params.rewardPackageId,
    starts_at: usableExisting?.starts_at ?? nowIso,
    expires_at: nextExpiry,
    revoked_at: null,
    revoke_reason: null,
    device_limit: deviceLimit,
    account_limit: accountLimit,
    status: "active",
    metadata: {
      last_redeem_key_id: params.redeemKeyId,
      last_reward_package_id: params.rewardPackageId,
      granted_at: nowIso,
    },
  };

  if (usableExisting) {
    const { data, error } = await admin
      .from("server_app_entitlements")
      .update({ ...payload, updated_at: nowIso })
      .eq("id", usableExisting.id)
      .select("id,plan_code,status,starts_at,expires_at,revoked_at,device_limit,account_limit")
      .single();
    if (error) throw error;
    return {
      id: asString((data as any).id),
      plan_code: asString((data as any).plan_code),
      status: asString((data as any).status, "active"),
      starts_at: asString((data as any).starts_at),
      expires_at: asNullableString((data as any).expires_at),
      revoked_at: asNullableString((data as any).revoked_at),
      device_limit: (data as any).device_limit == null ? null : Math.trunc(asNumber((data as any).device_limit)),
      account_limit: (data as any).account_limit == null ? null : Math.trunc(asNumber((data as any).account_limit)),
    } satisfies RuntimeEntitlement;
  }

  const { data, error } = await admin
    .from("server_app_entitlements")
    .insert(payload)
    .select("id,plan_code,status,starts_at,expires_at,revoked_at,device_limit,account_limit")
    .single();
  if (error) throw error;
  return {
    id: asString((data as any).id),
    plan_code: asString((data as any).plan_code),
    status: asString((data as any).status, "active"),
    starts_at: asString((data as any).starts_at),
    expires_at: asNullableString((data as any).expires_at),
    revoked_at: asNullableString((data as any).revoked_at),
    device_limit: (data as any).device_limit == null ? null : Math.trunc(asNumber((data as any).device_limit)),
    account_limit: (data as any).account_limit == null ? null : Math.trunc(asNumber((data as any).account_limit)),
  } satisfies RuntimeEntitlement;
}

async function applyWalletTopup(params: {
  appCode: string;
  accountRef: string;
  deviceId: string;
  entitlementId: string | null;
  redeemKeyId: string;
  rewardPackageId: string | null;
  softAmount: number;
  premiumAmount: number;
}) {
  const softAmount = round2(Math.max(0, params.softAmount));
  const premiumAmount = round2(Math.max(0, params.premiumAmount));
  const wallet = await ensureWalletRecord(params.appCode, params.accountRef, params.deviceId);
  if (!softAmount && !premiumAmount) return wallet;

  const nextSoft = round2(wallet.soft_balance + softAmount);
  const nextPremium = round2(wallet.premium_balance + premiumAmount);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("server_app_wallet_balances")
    .update({
      soft_balance: nextSoft,
      premium_balance: nextPremium,
      device_id: params.deviceId,
      updated_by_source: "runtime_redeem",
      updated_at: getNowIso(),
    })
    .eq("id", wallet.id)
    .eq("soft_balance", wallet.soft_balance)
    .eq("premium_balance", wallet.premium_balance)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("WALLET_BALANCE_CONFLICT"), { status: 409, code: "WALLET_BALANCE_CONFLICT" });
  }

  await insertWalletTransaction({
    app_code: params.appCode,
    wallet_balance_id: wallet.id,
    entitlement_id: params.entitlementId,
    redeem_key_id: params.redeemKeyId,
    reward_package_id: params.rewardPackageId,
    account_ref: params.accountRef,
    device_id: params.deviceId,
    transaction_type: "redeem",
    wallet_kind: softAmount && premiumAmount ? "mixed" : softAmount ? "soft" : "premium",
    soft_delta: softAmount,
    premium_delta: premiumAmount,
    soft_balance_after: nextSoft,
    premium_balance_after: nextPremium,
    note: "Redeem key top-up",
  });

  return await getWalletRecord(params.appCode, params.accountRef) ?? wallet;
}

async function getRuntimeContext(appCode: string) {
  const config = await getAppConfig(appCode);
  if (!config) {
    throw Object.assign(new Error("APP_NOT_FOUND"), { status: 404, code: "APP_NOT_FOUND" });
  }
  const settings = normalizeSettings(config);
  const plans = await getPlans(appCode);
  const features = await getFeatures(appCode);
  const planMap = new Map(plans.map((plan) => [plan.plan_code, plan]));
  return { config, settings, plans, planMap, features };
}

export async function buildRuntimeState(appCode: string, opts?: { sessionToken?: string | null }) : Promise<RuntimeAppState> {
  const { config, settings, planMap, features } = await getRuntimeContext(appCode);

  const sessionToken = asNullableString(opts?.sessionToken);
  let session = sessionToken ? await findSession(appCode, sessionToken) : null;
  if (session) {
    if (asString(session.status) !== "active") {
      session = null;
    } else if (session?.revoked_at) {
      session = null;
    } else {
      const controls = await getRuntimeControls(appCode);
      const expiryCode = getSessionExpiryCode(session, controls);
      if (expiryCode) {
        await expireSessionWithCode(asString(session.id), expiryCode);
        session = null;
      }
    }
  }

  let entitlement = session?.entitlement_id
    ? await getEntitlementById(asString(session.entitlement_id))
    : session?.account_ref
      ? await getLatestActiveEntitlement(appCode, asString(session.account_ref))
      : null;

  if (!isEntitlementUsable(entitlement)) {
    entitlement = null;
  }

  let currentPlan = entitlement?.plan_code ? asString(entitlement.plan_code) : settings.guest_plan;
  if (!planMap.has(currentPlan)) currentPlan = settings.guest_plan;
  const activePlan = planMap.get(currentPlan) ?? null;
  const currentPlanRank = getPlanRank(currentPlan);

  const walletRow = session?.account_ref
    ? await ensureWalletFresh(appCode, asString(session.account_ref), activePlan, settings, asNullableString(session.device_id))
    : null;
  const wallet = {
    soft_balance: asNumber(walletRow?.soft_balance),
    premium_balance: asNumber(walletRow?.premium_balance),
    last_soft_reset_at: asNullableString(walletRow?.last_soft_reset_at),
    last_premium_reset_at: asNullableString(walletRow?.last_premium_reset_at),
  };

  const decoratedFeatures = features.map((feature) => {
    const minRank = getPlanRank(feature.min_plan);
    const softMultiplier = activePlan?.soft_cost_multiplier ?? 1;
    const premiumMultiplier = activePlan?.premium_cost_multiplier ?? 1;
    return {
      ...feature,
      allowed: currentPlanRank >= minRank,
      effective_soft_cost: round2(feature.soft_cost * softMultiplier),
      effective_premium_cost: round2(feature.premium_cost * premiumMultiplier),
    };
  });

  return {
    app: {
      code: asString((config as any).code),
      label: asString((config as any).label),
      description: asNullableString((config as any).description),
      public_enabled: Boolean((config as any).public_enabled),
    },
    settings,
    current_plan: currentPlan,
    current_plan_label: activePlan?.label ?? null,
    entitlement: entitlement ? {
      id: asString(entitlement.id),
      plan_code: asString(entitlement.plan_code),
      status: asString(entitlement.status),
      starts_at: asString(entitlement.starts_at),
      expires_at: asNullableString(entitlement.expires_at),
      revoked_at: asNullableString(entitlement.revoked_at),
      device_limit: entitlement.device_limit == null ? null : Math.trunc(asNumber(entitlement.device_limit)),
      account_limit: entitlement.account_limit == null ? null : Math.trunc(asNumber(entitlement.account_limit)),
    } : null,
    wallet,
    features: decoratedFeatures,
  };
}

export async function touchRuntimeSession(appCode: string, sessionToken: string, meta?: { clientVersion?: string | null; ipHash?: string | null }) {
  const session = await findSession(appCode, sessionToken);
  if (!session) {
    throw Object.assign(new Error("SESSION_NOT_FOUND"), { status: 404, code: "SESSION_NOT_FOUND" });
  }

  const nowIso = getNowIso();
  if (session.status !== "active") {
    throw Object.assign(new Error("SESSION_INACTIVE"), { status: 409, code: "SESSION_INACTIVE" });
  }

  await enforceSessionActiveOrThrow(appCode, session);
  const controls = await getRuntimeControls(appCode);
  await trackRuntimeAccountDevice({
    appCode,
    accountRef: asString(session.account_ref),
    deviceId: asNullableString(session.device_id),
    ipHash: meta?.ipHash ?? null,
    controls,
  });

  const entitlement = session.entitlement_id ? await getEntitlementById(asString(session.entitlement_id)) : null;
  if (entitlement?.revoked_at) {
    throw Object.assign(new Error("ENTITLEMENT_REVOKED"), { status: 409, code: "ENTITLEMENT_REVOKED" });
  }
  if (entitlement?.expires_at && new Date(entitlement.expires_at).getTime() <= Date.now()) {
    throw Object.assign(new Error("ENTITLEMENT_EXPIRED"), { status: 409, code: "ENTITLEMENT_EXPIRED" });
  }

  const admin = createAdminClient();
  const patch: Record<string, unknown> = {
    last_seen_at: nowIso,
    updated_at: nowIso,
  };
  if (meta?.clientVersion) patch.client_version = meta.clientVersion;
  if (meta?.ipHash) patch.ip_hash = meta.ipHash;

  const { error } = await admin
    .from("server_app_sessions")
    .update(patch)
    .eq("id", session.id);

  if (error) throw error;
  return session;
}

export async function logoutRuntimeSession(appCode: string, sessionToken: string) {
  const session = await findSession(appCode, sessionToken);
  if (!session) {
    throw Object.assign(new Error("SESSION_NOT_FOUND"), { status: 404, code: "SESSION_NOT_FOUND" });
  }

  const nowIso = getNowIso();
  const admin = createAdminClient();
  const { error } = await admin
    .from("server_app_sessions")
    .update({
      status: "logged_out",
      revoked_at: nowIso,
      revoke_reason: "client_logout",
      last_seen_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", session.id);

  if (error) throw error;
  return { id: session.id, account_ref: session.account_ref, device_id: session.device_id };
}

export async function redeemRuntimeKey(params: {
  appCode: string;
  redeemKey: string;
  accountRef: string;
  deviceId: string;
  clientVersion?: string | null;
  ipHash?: string | null;
}) {
  const appCode = asString(params.appCode);
  const redeemKey = asString(params.redeemKey);
  const accountRef = asString(params.accountRef);
  const deviceId = asString(params.deviceId);
  if (!redeemKey) throw Object.assign(new Error("MISSING_REDEEM_KEY"), { status: 400, code: "MISSING_REDEEM_KEY" });
  if (!accountRef) throw Object.assign(new Error("MISSING_ACCOUNT_REF"), { status: 400, code: "MISSING_ACCOUNT_REF" });
  if (!deviceId) throw Object.assign(new Error("MISSING_DEVICE_ID"), { status: 400, code: "MISSING_DEVICE_ID" });

  const { settings, planMap } = await getRuntimeContext(appCode);
  const keyRow = await getRedeemKeyByValue(appCode, redeemKey);
  if (!keyRow) throw Object.assign(new Error("REDEEM_KEY_NOT_FOUND"), { status: 404, code: "REDEEM_KEY_NOT_FOUND" });
  if (!keyRow.enabled) throw Object.assign(new Error("REDEEM_KEY_DISABLED"), { status: 409, code: "REDEEM_KEY_DISABLED" });
  if (keyRow.blocked_at) throw Object.assign(new Error(keyRow.blocked_reason || "REDEEM_KEY_BLOCKED"), { status: 409, code: "REDEEM_KEY_BLOCKED" });
  if (keyRow.starts_at && new Date(keyRow.starts_at).getTime() > Date.now()) {
    throw Object.assign(new Error("REDEEM_KEY_NOT_STARTED"), { status: 409, code: "REDEEM_KEY_NOT_STARTED" });
  }
  if (keyRow.expires_at && !isFutureIso(keyRow.expires_at)) {
    throw Object.assign(new Error("REDEEM_KEY_EXPIRED"), { status: 409, code: "REDEEM_KEY_EXPIRED" });
  }
  if (keyRow.redeemed_count >= keyRow.max_redemptions) {
    throw Object.assign(new Error("REDEEM_KEY_LIMIT_REACHED"), { status: 409, code: "REDEEM_KEY_LIMIT_REACHED" });
  }

  const rewardPackage = await getRewardPackageById(keyRow.reward_package_id);
  if (keyRow.reward_package_id && (!rewardPackage || !rewardPackage.enabled)) {
    throw Object.assign(new Error("REWARD_PACKAGE_DISABLED"), { status: 409, code: "REWARD_PACKAGE_DISABLED" });
  }
  const reward = resolveRewardPackage(keyRow, rewardPackage);
  const planDefaults = reward.plan_code ? (planMap.get(reward.plan_code) ?? null) : null;
  const controls = await getRuntimeControls(appCode);
  await trackRuntimeAccountDevice({
    appCode,
    accountRef,
    deviceId,
    ipHash: params.ipHash ?? null,
    controls,
  });

  const existingEntitlement = await getLatestActiveEntitlement(appCode, accountRef);
  const predictedDeviceLimit = reward.device_limit_override
    ?? planDefaults?.device_limit
    ?? existingEntitlement?.device_limit
    ?? 1;
  const otherActiveDevicesBeforeRedeem = await countOtherActiveDevices(appCode, accountRef, deviceId);
  if (predictedDeviceLimit > 0 && otherActiveDevicesBeforeRedeem >= predictedDeviceLimit) {
    throw Object.assign(new Error("DEVICE_LIMIT_REACHED"), { status: 409, code: "DEVICE_LIMIT_REACHED" });
  }

  await reserveRedeemKeyUse(keyRow, accountRef, deviceId);

  const entitlement = await upsertRuntimeEntitlement({
    appCode,
    accountRef,
    deviceId,
    existing: existingEntitlement,
    reward,
    planDefaults,
    redeemKeyId: keyRow.id,
    rewardPackageId: rewardPackage?.id ?? null,
    settings,
  });

  const effectivePlan = entitlement?.plan_code ?? settings.guest_plan;
  const effectivePlanRow = planMap.get(effectivePlan) ?? null;
  await ensureWalletFresh(appCode, accountRef, effectivePlanRow, settings, deviceId);
  const wallet = await applyWalletTopup({
    appCode,
    accountRef,
    deviceId,
    entitlementId: entitlement?.id ?? null,
    redeemKeyId: keyRow.id,
    rewardPackageId: rewardPackage?.id ?? null,
    softAmount: reward.soft_credit_amount,
    premiumAmount: reward.premium_credit_amount,
  });

  const deviceLimit = entitlement?.device_limit ?? effectivePlanRow?.device_limit ?? 1;
  await revokeActiveDeviceSessions(appCode, accountRef, deviceId, "redeem_rotate");
  const otherActiveDevices = await countOtherActiveDevices(appCode, accountRef, deviceId);
  if (deviceLimit > 0 && otherActiveDevices >= deviceLimit) {
    throw Object.assign(new Error("DEVICE_LIMIT_REACHED"), { status: 409, code: "DEVICE_LIMIT_REACHED" });
  }

  const created = await createRuntimeSession({
    appCode,
    accountRef,
    deviceId,
    entitlementId: entitlement?.id ?? null,
    redeemKeyId: keyRow.id,
    clientVersion: params.clientVersion,
    ipHash: params.ipHash,
  });

  await patchEntitlementUsage(entitlement?.id ?? null, {
    device_id: deviceId,
    metadata: {
      last_device_id: deviceId,
      last_account_ref: accountRef,
      last_session_started_at: created.session.started_at,
    },
  });

  const state = await buildRuntimeState(appCode, { sessionToken: created.session_token });
  return {
    session_token: created.session_token,
    session: created.session,
    reward: {
      reward_mode: reward.reward_mode,
      package_code: reward.package_code,
      title: reward.title,
      plan_code: reward.plan_code,
      soft_credit_amount: reward.soft_credit_amount,
      premium_credit_amount: reward.premium_credit_amount,
      entitlement_days: reward.entitlement_days,
    },
    wallet,
    state,
  };
}

export async function consumeRuntimeFeature(params: {
  appCode: string;
  sessionToken: string;
  featureCode: string;
  walletKind?: string | null;
}) {
  const appCode = asString(params.appCode);
  const sessionToken = asString(params.sessionToken);
  const featureCode = asString(params.featureCode);
  const requestedWalletKind = asString(params.walletKind, "auto").toLowerCase();
  if (!sessionToken) throw Object.assign(new Error("MISSING_SESSION_TOKEN"), { status: 400, code: "MISSING_SESSION_TOKEN" });
  if (!featureCode) throw Object.assign(new Error("MISSING_FEATURE_CODE"), { status: 400, code: "MISSING_FEATURE_CODE" });

  const session = await findSession(appCode, sessionToken);
  if (!session) throw Object.assign(new Error("SESSION_NOT_FOUND"), { status: 404, code: "SESSION_NOT_FOUND" });
  if (asString(session.status) !== "active") throw Object.assign(new Error("SESSION_INACTIVE"), { status: 409, code: "SESSION_INACTIVE" });
  await enforceSessionActiveOrThrow(appCode, session);
  const controls = await getRuntimeControls(appCode);
  await trackRuntimeAccountDevice({
    appCode,
    accountRef: asString(session.account_ref),
    deviceId: asNullableString(session.device_id),
    controls,
  });

  const { settings, planMap, features } = await getRuntimeContext(appCode);
  const entitlement = session.entitlement_id
    ? await getEntitlementById(asString(session.entitlement_id))
    : await getLatestActiveEntitlement(appCode, asString(session.account_ref));
  if (session.entitlement_id && !isEntitlementUsable(entitlement)) {
    throw Object.assign(new Error("ENTITLEMENT_INACTIVE"), { status: 409, code: "ENTITLEMENT_INACTIVE" });
  }

  const currentPlanCode = isEntitlementUsable(entitlement) ? asString(entitlement?.plan_code, settings.guest_plan) : settings.guest_plan;
  const currentPlan = planMap.get(currentPlanCode) ?? null;
  const feature = features.find((item) => item.feature_code === featureCode);
  if (!feature) throw Object.assign(new Error("FEATURE_NOT_FOUND"), { status: 404, code: "FEATURE_NOT_FOUND" });

  const currentPlanRank = getPlanRank(currentPlanCode);
  const minRank = getPlanRank(feature.min_plan);
  if (currentPlanRank < minRank) {
    throw Object.assign(new Error("FEATURE_PLAN_LOCKED"), { status: 403, code: "FEATURE_PLAN_LOCKED" });
  }

  const wallet = await ensureWalletFresh(appCode, asString(session.account_ref), currentPlan, settings, asNullableString(session.device_id));
  const effectiveSoftCost = round2(feature.soft_cost * (currentPlan?.soft_cost_multiplier ?? 1));
  const effectivePremiumCost = round2(feature.premium_cost * (currentPlan?.premium_cost_multiplier ?? 1));

  let chargeKind: "none" | "soft" | "premium" = "none";
  let softDelta = 0;
  let premiumDelta = 0;

  if (feature.requires_credit) {
    if (requestedWalletKind === "soft") {
      chargeKind = "soft";
    } else if (requestedWalletKind === "premium") {
      chargeKind = "premium";
    } else if (effectivePremiumCost > 0 && wallet.premium_balance >= effectivePremiumCost) {
      chargeKind = "premium";
    } else if (effectiveSoftCost > 0 && wallet.soft_balance >= effectiveSoftCost) {
      chargeKind = "soft";
    } else if (effectivePremiumCost > 0 && effectiveSoftCost <= 0) {
      chargeKind = "premium";
    } else {
      chargeKind = "soft";
    }

    if (chargeKind === "premium") {
      if (effectivePremiumCost <= 0) {
        throw Object.assign(new Error("PREMIUM_COST_NOT_CONFIGURED"), { status: 409, code: "PREMIUM_COST_NOT_CONFIGURED" });
      }
      if (wallet.premium_balance < effectivePremiumCost) {
        throw Object.assign(new Error("INSUFFICIENT_PREMIUM_BALANCE"), { status: 409, code: "INSUFFICIENT_PREMIUM_BALANCE" });
      }
      premiumDelta = round2(-effectivePremiumCost);
    } else {
      if (effectiveSoftCost <= 0) {
        throw Object.assign(new Error("SOFT_COST_NOT_CONFIGURED"), { status: 409, code: "SOFT_COST_NOT_CONFIGURED" });
      }
      if (wallet.soft_balance < effectiveSoftCost) {
        throw Object.assign(new Error("INSUFFICIENT_SOFT_BALANCE"), { status: 409, code: "INSUFFICIENT_SOFT_BALANCE" });
      }
      softDelta = round2(-effectiveSoftCost);
      chargeKind = "soft";
    }
  }

  let nextSoft = wallet.soft_balance;
  let nextPremium = wallet.premium_balance;
  if (chargeKind === "soft") nextSoft = round2(wallet.soft_balance + softDelta);
  if (chargeKind === "premium") nextPremium = round2(wallet.premium_balance + premiumDelta);

  if (chargeKind !== "none") {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("server_app_wallet_balances")
      .update({
        soft_balance: nextSoft,
        premium_balance: nextPremium,
        updated_by_source: "runtime_consume",
        updated_at: getNowIso(),
      })
      .eq("id", wallet.id)
      .eq("soft_balance", wallet.soft_balance)
      .eq("premium_balance", wallet.premium_balance)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      throw Object.assign(new Error("WALLET_BALANCE_CONFLICT"), { status: 409, code: "WALLET_BALANCE_CONFLICT" });
    }
  }

  await insertWalletTransaction({
    app_code: appCode,
    wallet_balance_id: wallet.id,
    entitlement_id: session.entitlement_id,
    redeem_key_id: session.redeem_key_id,
    account_ref: session.account_ref,
    device_id: session.device_id,
    feature_code: featureCode,
    transaction_type: "consume",
    wallet_kind: chargeKind,
    soft_delta: softDelta,
    premium_delta: premiumDelta,
    soft_balance_after: nextSoft,
    premium_balance_after: nextPremium,
    note: feature.title,
    metadata: {
      requested_wallet_kind: requestedWalletKind,
      effective_soft_cost: effectiveSoftCost,
      effective_premium_cost: effectivePremiumCost,
      plan_code: currentPlanCode,
    },
  });

  const state = await buildRuntimeState(appCode, { sessionToken });
  return {
    feature: {
      feature_code: feature.feature_code,
      title: feature.title,
      min_plan: feature.min_plan,
      requires_credit: feature.requires_credit,
      effective_soft_cost: effectiveSoftCost,
      effective_premium_cost: effectivePremiumCost,
    },
    wallet_kind: chargeKind,
    charged_soft: Math.abs(softDelta),
    charged_premium: Math.abs(premiumDelta),
    state,
  };
}

export async function cleanupRuntimeOps(appCode: string) {
  const controls = await getRuntimeControls(appCode);
  const admin = createAdminClient();
  const { data: sessions, error: sessionsError } = await admin
    .from("server_app_sessions")
    .select("id,status,started_at,last_seen_at,expires_at")
    .eq("app_code", appCode)
    .eq("status", "active");

  if (sessionsError) throw sessionsError;

  let expiredSessions = 0;
  const reasons: Record<string, number> = {};
  for (const session of sessions ?? []) {
    const expiryCode = getSessionExpiryCode(session, controls);
    if (!expiryCode) continue;
    await expireSessionWithCode(asString((session as any).id), expiryCode);
    expiredSessions += 1;
    reasons[expiryCode] = (reasons[expiryCode] ?? 0) + 1;
  }

  const pruneBeforeIso = daysAgoIso(controls.event_retention_days);
  const { data: oldEvents, error: oldEventsError } = await admin
    .from("server_app_runtime_events")
    .select("id")
    .eq("app_code", appCode)
    .lt("created_at", pruneBeforeIso);
  if (oldEventsError) throw oldEventsError;

  const oldEventIds = (oldEvents ?? []).map((row: any) => asString(row.id)).filter(Boolean);
  let prunedEvents = 0;
  if (oldEventIds.length) {
    const { error: deleteError } = await admin.from("server_app_runtime_events").delete().in("id", oldEventIds);
    if (deleteError) throw deleteError;
    prunedEvents = oldEventIds.length;
  }

  return {
    app_code: appCode,
    expired_sessions: expiredSessions,
    expired_reasons: reasons,
    pruned_events: prunedEvents,
    controls: {
      session_idle_timeout_minutes: controls.session_idle_timeout_minutes,
      session_max_age_minutes: controls.session_max_age_minutes,
      event_retention_days: controls.event_retention_days,
    },
  };
}

export async function adjustRuntimeWalletBalance(params: {
  appCode: string;
  accountRef: string;
  deviceId?: string | null;
  softDelta?: number | null;
  premiumDelta?: number | null;
  note?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const appCode = asString(params.appCode);
  const accountRef = asString(params.accountRef);
  const deviceId = asNullableString(params.deviceId);
  const softDelta = round2(asNumber(params.softDelta, 0));
  const premiumDelta = round2(asNumber(params.premiumDelta, 0));
  if (!accountRef) throw Object.assign(new Error("MISSING_ACCOUNT_REF"), { status: 400, code: "MISSING_ACCOUNT_REF" });
  if (!softDelta && !premiumDelta) throw Object.assign(new Error("EMPTY_ADJUSTMENT"), { status: 400, code: "EMPTY_ADJUSTMENT" });

  const wallet = await ensureWalletRecord(appCode, accountRef, deviceId);
  const nextSoft = round2(wallet.soft_balance + softDelta);
  const nextPremium = round2(wallet.premium_balance + premiumDelta);
  if (nextSoft < 0) throw Object.assign(new Error("NEGATIVE_SOFT_BALANCE"), { status: 409, code: "NEGATIVE_SOFT_BALANCE" });
  if (nextPremium < 0) throw Object.assign(new Error("NEGATIVE_PREMIUM_BALANCE"), { status: 409, code: "NEGATIVE_PREMIUM_BALANCE" });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("server_app_wallet_balances")
    .update({
      soft_balance: nextSoft,
      premium_balance: nextPremium,
      device_id: deviceId,
      updated_by_source: "admin_adjust",
      updated_at: getNowIso(),
    })
    .eq("id", wallet.id)
    .eq("soft_balance", wallet.soft_balance)
    .eq("premium_balance", wallet.premium_balance)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw Object.assign(new Error("WALLET_BALANCE_CONFLICT"), { status: 409, code: "WALLET_BALANCE_CONFLICT" });

  const walletKind = softDelta && premiumDelta ? "mixed" : softDelta ? "soft" : "premium";
  await insertWalletTransaction({
    app_code: appCode,
    wallet_balance_id: wallet.id,
    entitlement_id: null,
    redeem_key_id: null,
    reward_package_id: null,
    account_ref: accountRef,
    device_id: deviceId,
    feature_code: null,
    transaction_type: "admin_adjust",
    wallet_kind: walletKind,
    soft_delta: softDelta,
    premium_delta: premiumDelta,
    soft_balance_after: nextSoft,
    premium_balance_after: nextPremium,
    note: asNullableString(params.note) ?? "Admin wallet adjust",
    metadata: params.metadata ?? { source: "server_app_runtime_ops" },
  });

  return {
    wallet_id: wallet.id,
    account_ref: accountRef,
    soft_balance: nextSoft,
    premium_balance: nextPremium,
    soft_delta: softDelta,
    premium_delta: premiumDelta,
  };
}

export function runtimeJson(status: number, body: unknown, origin?: string | null) {
  return json(status, body, origin);
}
