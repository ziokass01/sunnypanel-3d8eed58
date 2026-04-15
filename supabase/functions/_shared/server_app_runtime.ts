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
  category: string;
  group_key: string;
  icon_key: string | null;
  badge_label: string | null;
  visible_to_guest: boolean;
  charge_unit: number;
  charge_on_success_only: boolean;
  client_accumulate_units: boolean;
  unlock_required?: boolean;
  unlocked?: boolean;
  unlock_expires_at?: string | null;
  unlock_label?: string | null;
  unlock_feature_code?: string | null;
  unlock_soft_cost?: number;
  unlock_premium_cost?: number;
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
  plan_meta: {
    label: string | null;
    hint: string | null;
    benefits_text: string | null;
    daily_soft_credit: number;
    daily_premium_credit: number;
    soft_cost_multiplier: number;
    premium_cost_multiplier: number;
    device_limit: number | null;
    account_limit: number | null;
  } | null;
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
  consume_priority: 'soft_first' | 'premium_first';
  soft_daily_reset_mode: 'legacy_floor' | 'debt_floor';
  premium_daily_reset_mode: 'legacy_floor' | 'debt_floor';
  soft_floor_credit: number;
  premium_floor_credit: number;
  soft_allow_negative: boolean;
  premium_allow_negative: boolean;
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
  entitlement_seconds: number;
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
  entitlement_seconds: number;
  device_limit_override: number | null;
  account_limit_override: number | null;
  blocked_at: string | null;
  blocked_reason: string | null;
  metadata: Record<string, unknown>;
};

type RuntimeResolvedReward = {
  reward_mode: string;
  package_code: string | null;
  title: string | null;
  plan_code: string | null;
  soft_credit_amount: number;
  premium_credit_amount: number;
  entitlement_days: number;
  entitlement_seconds: number;
  claim_bound_expires_at: string | null;
  device_limit_override: number | null;
  account_limit_override: number | null;
};
type RuntimeFeatureUnlockRule = {
  access_code: string;
  title: string;
  description: string | null;
  enabled: boolean;
  unlock_required: boolean;
  unlock_duration_seconds: number;
  soft_unlock_cost: number;
  premium_unlock_cost: number;
  soft_unlock_cost_7d: number;
  premium_unlock_cost_7d: number;
  soft_unlock_cost_30d: number;
  premium_unlock_cost_30d: number;
  free_for_plans: string[];
  guarded_feature_codes: string[];
  renewable: boolean;
  revalidate_online: boolean;
  notes: string | null;
};

type RuntimeFeatureUnlockState = {
  id: string;
  access_code: string;
  status: string;
  started_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};


function asString(value: unknown, fallback = "") {
  const v = String(value ?? fallback).trim();
  return v || fallback;
}

function asNullableString(value: unknown): string | null {
  const v = String(value ?? "").trim();
  return v || null;
}


function normalizePlanCode(value: unknown, fallback = "classic") {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw || fallback;
}

function normalizeAccountRef(value: unknown, fallback = "") {
  return asString(value, fallback).trim().toLowerCase();
}

function getAccountRefAliases(value: unknown, fallback = "") {
  const normalized = normalizeAccountRef(value, fallback);
  if (!normalized) return [] as string[];
  const aliases = new Set<string>();
  aliases.add(normalized);
  const at = normalized.indexOf("@");
  if (at > 0) aliases.add(normalized.slice(0, at));
  return Array.from(aliases.values());
}

function normalizeDeviceId(value: unknown): string | null {
  const normalized = asNullableString(value);
  if (!normalized) return null;
  const trimmed = normalized.trim();
  return trimmed.length ? trimmed : null;
}


function isMissingRelationError(error: any, relationName: string) {
  const code = String(error?.code ?? "");
  const msg = String(error?.message ?? error?.details ?? "").toLowerCase();
  const relation = String(relationName || "").toLowerCase();
  if (code === "PGRST205" || code === "42P01") return true;
  if (!relation) return false;
  return msg.includes("could not find the table") || msg.includes("relation") && msg.includes(relation) && msg.includes("does not exist");
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

function asNumber(value: unknown, fallback = 0) {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

const RUNTIME_CONSUME_MAX_DEBT_OVERAGE = 2;

type WalletChargePlan = {
  wallet_kind: "none" | "soft" | "premium" | "mixed";
  soft_delta: number;
  premium_delta: number;
  charged_soft: number;
  charged_premium: number;
  next_soft: number;
  next_premium: number;
  used_debt: boolean;
};

function buildWalletChargeCandidates(params: {
  softBalance: number;
  premiumBalance: number;
  softCost: number;
  premiumCost: number;
  allowDebt: boolean;
  maxDebtOverage?: number;
}) {
  const softBalance = round2(asNumber(params.softBalance, 0));
  const premiumBalance = round2(asNumber(params.premiumBalance, 0));
  const softCost = round2(Math.max(0, asNumber(params.softCost, 0)));
  const premiumCost = round2(Math.max(0, asNumber(params.premiumCost, 0)));
  const allowDebt = Boolean(params.allowDebt);
  const maxDebtOverage = round2(Math.max(0, asNumber(params.maxDebtOverage, 0)));
  const plans = new Map<string, WalletChargePlan>();

  const add = (plan: WalletChargePlan | null) => {
    if (!plan) return;
    const key = [plan.wallet_kind, plan.soft_delta, plan.premium_delta, plan.next_soft, plan.next_premium, plan.used_debt].join("|");
    if (!plans.has(key)) plans.set(key, plan);
  };

  if (softCost <= 0 && premiumCost <= 0) {
    add({ wallet_kind: "none", soft_delta: 0, premium_delta: 0, charged_soft: 0, charged_premium: 0, next_soft: softBalance, next_premium: premiumBalance, used_debt: false });
    return Array.from(plans.values());
  }

  if (softCost > 0 && softBalance >= softCost) {
    add({ wallet_kind: "soft", soft_delta: round2(-softCost), premium_delta: 0, charged_soft: softCost, charged_premium: 0, next_soft: round2(softBalance - softCost), next_premium: premiumBalance, used_debt: false });
  }
  if (premiumCost > 0 && premiumBalance >= premiumCost) {
    add({ wallet_kind: "premium", soft_delta: 0, premium_delta: round2(-premiumCost), charged_soft: 0, charged_premium: premiumCost, next_soft: softBalance, next_premium: round2(premiumBalance - premiumCost), used_debt: false });
  }

  if (softCost > 0 && premiumCost > 0 && softBalance > 0 && softBalance < softCost) {
    const softUsed = round2(Math.min(softBalance, softCost));
    const remainingRatio = round2((softCost - softUsed) / softCost);
    const premiumNeeded = round2(premiumCost * remainingRatio);
    if (premiumNeeded > 0 && premiumBalance >= premiumNeeded) {
      add({ wallet_kind: "mixed", soft_delta: round2(-softUsed), premium_delta: round2(-premiumNeeded), charged_soft: softUsed, charged_premium: premiumNeeded, next_soft: round2(softBalance - softUsed), next_premium: round2(premiumBalance - premiumNeeded), used_debt: false });
    } else if (allowDebt) {
      const shortfall = round2(softCost - softUsed);
      if (shortfall > 0 && shortfall <= maxDebtOverage) {
        add({ wallet_kind: "soft", soft_delta: round2(-softCost), premium_delta: 0, charged_soft: softCost, charged_premium: 0, next_soft: round2(softBalance - softCost), next_premium: premiumBalance, used_debt: true });
      }
    }
  }

  if (premiumCost > 0 && softCost > 0 && premiumBalance > 0 && premiumBalance < premiumCost) {
    const premiumUsed = round2(Math.min(premiumBalance, premiumCost));
    const remainingRatio = round2((premiumCost - premiumUsed) / premiumCost);
    const softNeeded = round2(softCost * remainingRatio);
    if (softNeeded > 0 && softBalance >= softNeeded) {
      add({ wallet_kind: "mixed", soft_delta: round2(-softNeeded), premium_delta: round2(-premiumUsed), charged_soft: softNeeded, charged_premium: premiumUsed, next_soft: round2(softBalance - softNeeded), next_premium: round2(premiumBalance - premiumUsed), used_debt: false });
    } else if (allowDebt) {
      const shortfall = round2(premiumCost - premiumUsed);
      if (shortfall > 0 && shortfall <= maxDebtOverage) {
        add({ wallet_kind: "premium", soft_delta: 0, premium_delta: round2(-premiumCost), charged_soft: 0, charged_premium: premiumCost, next_soft: softBalance, next_premium: round2(premiumBalance - premiumCost), used_debt: true });
      }
    }
  }

  return Array.from(plans.values());
}

function pickWalletChargePlan(params: {
  requestedWalletKind: "auto" | "soft" | "premium";
  consumePriority: "soft_first" | "premium_first";
  candidates: WalletChargePlan[];
}) {
  const order = params.requestedWalletKind === "soft"
    ? ["soft", "mixed", "premium"]
    : params.requestedWalletKind === "premium"
      ? ["premium", "mixed", "soft"]
      : params.consumePriority === "premium_first"
        ? ["premium", "mixed", "soft"]
        : ["soft", "mixed", "premium"];
  for (const kind of order) {
    const plan = params.candidates.find((item) => item.wallet_kind === kind && !item.used_debt);
    if (plan) return plan;
  }
  for (const kind of order) {
    const plan = params.candidates.find((item) => item.wallet_kind === kind && item.used_debt);
    if (plan) return plan;
  }
  return null;
}

function applyResetFloorWithDebt(prevBalance: number, target: number, mode: "legacy_floor" | "debt_floor") {
  const safeTarget = round2(Math.max(0, target));
  const prev = round2(prevBalance);
  if (safeTarget <= 0) return prev;
  if (mode === "legacy_floor") {
    return round2(Math.max(prev, safeTarget));
  }
  if (prev >= safeTarget) return prev;
  if (prev >= 0) return safeTarget;
  return round2(prev + safeTarget);
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

function addSecondsIso(baseIso: string, seconds: number) {
  const baseMs = new Date(baseIso).getTime();
  return new Date(baseMs + Math.max(0, Math.trunc(seconds)) * 1000).toISOString();
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
    guest_plan: normalizePlanCode(settings?.guest_plan, "classic"),
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

  if (error) {
    if (isMissingRelationError(error, "server_apps") || isMissingRelationError(error, "server_app_settings")) {
      return {
        code: appCode,
        label: appCode,
        description: null,
        public_enabled: true,
        settings: {
          guest_plan: "classic",
          gift_tab_label: "Quà tặng",
          key_persist_until_revoked: true,
          daily_reset_hour: 0,
        },
      };
    }
    throw error;
  }
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

  if (error) {
    if (isMissingRelationError(error, "server_app_plans")) return [];
    throw error;
  }
  return (data ?? []).map((row: any) => ({
    plan_code: normalizePlanCode(row.plan_code),
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
    .select("feature_code,title,description,min_plan,requires_credit,soft_cost,premium_cost,reset_period,sort_order,category,group_key,icon_key,badge_label,visible_to_guest,charge_unit,charge_on_success_only,client_accumulate_units")
    .eq("app_code", appCode)
    .eq("enabled", true)
    .order("sort_order", { ascending: true });

  if (error) {
    if (isMissingRelationError(error, "server_app_features")) return [];
    throw error;
  }
  return (data ?? []).map((row: any) => ({
    feature_code: asString(row.feature_code),
    title: asString(row.title),
    description: asNullableString(row.description),
    min_plan: normalizePlanCode(row.min_plan, "classic"),
    requires_credit: Boolean(row.requires_credit),
    soft_cost: asNumber(row.soft_cost),
    premium_cost: asNumber(row.premium_cost),
    reset_period: asString(row.reset_period, "daily"),
    sort_order: Math.trunc(asNumber(row.sort_order)),
    category: asString(row.category, "tools"),
    group_key: asString(row.group_key, "general"),
    icon_key: asNullableString(row.icon_key),
    badge_label: asNullableString(row.badge_label),
    visible_to_guest: Boolean(row.visible_to_guest ?? true),
    charge_unit: Math.max(1, Math.trunc(asNumber(row.charge_unit, 1))),
    charge_on_success_only: Boolean(row.charge_on_success_only ?? true),
    client_accumulate_units: Boolean(row.client_accumulate_units ?? false),
  }));
}

async function getFeatureUnlockRules(appCode: string): Promise<RuntimeFeatureUnlockRule[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("server_app_feature_unlock_rules")
    .select("access_code,title,description,enabled,unlock_required,unlock_duration_seconds,soft_unlock_cost,premium_unlock_cost,soft_unlock_cost_7d,premium_unlock_cost_7d,soft_unlock_cost_30d,premium_unlock_cost_30d,free_for_plans,guarded_feature_codes,renewable,revalidate_online,notes")
    .eq("app_code", appCode)
    .eq("enabled", true)
    .order("sort_order", { ascending: true });

  if (error) {
    if (isMissingRelationError(error, "server_app_feature_unlock_rules")) return [];
    throw error;
  }
  return (data ?? []).map((row: any) => ({
    access_code: asString(row.access_code),
    title: asString(row.title, asString(row.access_code)),
    description: asNullableString(row.description),
    enabled: Boolean(row.enabled ?? true),
    unlock_required: Boolean(row.unlock_required ?? true),
    unlock_duration_seconds: Math.max(3600, Math.trunc(asNumber(row.unlock_duration_seconds, 86400))),
    soft_unlock_cost: asNumber(row.soft_unlock_cost, 0),
    premium_unlock_cost: asNumber(row.premium_unlock_cost, 0),
    soft_unlock_cost_7d: asNumber(row.soft_unlock_cost_7d, asNumber(row.soft_unlock_cost, 0)),
    premium_unlock_cost_7d: asNumber(row.premium_unlock_cost_7d, asNumber(row.premium_unlock_cost, 0)),
    soft_unlock_cost_30d: asNumber(row.soft_unlock_cost_30d, asNumber(row.soft_unlock_cost, 0)),
    premium_unlock_cost_30d: asNumber(row.premium_unlock_cost_30d, asNumber(row.premium_unlock_cost, 0)),
    free_for_plans: asStringArray(row.free_for_plans).map((item) => item.toLowerCase()),
    guarded_feature_codes: asStringArray(row.guarded_feature_codes).map((item) => item.toLowerCase()),
    renewable: Boolean(row.renewable ?? true),
    revalidate_online: Boolean(row.revalidate_online ?? true),
    notes: asNullableString(row.notes),
  }));
}

async function getLatestFeatureUnlockStates(appCode: string, accountRef: string, deviceId?: string | null) {
  const aliases = getAccountRefAliases(accountRef);
  if (!aliases.length) return [];
  const admin = createAdminClient();
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  const allRows: any[] = [];
  const seen = new Set<string>();
  for (const alias of aliases) {
    let query = admin
      .from("server_app_feature_unlocks")
      .select("id,access_code,status,started_at,expires_at,revoked_at,device_id")
      .eq("app_code", appCode)
      .ilike("account_ref", alias)
      .eq("status", "active")
      .is("revoked_at", null)
      .order("started_at", { ascending: false })
      .limit(200);
    const { data, error } = await query;
    if (error) {
      if (isMissingRelationError(error, "server_app_feature_unlocks")) return [];
      throw error;
    }
    for (const row of data ?? []) {
      const id = asString((row as any)?.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      allRows.push(row);
    }
  }
  const chosen = new Map<string, RuntimeFeatureUnlockState>();
  const now = Date.now();
  for (const row of allRows) {
    const accessCode = asString((row as any).access_code).toLowerCase();
    if (!accessCode || chosen.has(accessCode)) continue;
    const rowDeviceId = normalizeDeviceId((row as any).device_id);
    if (normalizedDeviceId && rowDeviceId && rowDeviceId != normalizedDeviceId) continue;
    const expiresAt = asNullableString((row as any).expires_at);
    if (expiresAt && new Date(expiresAt).getTime() <= now) continue;
    chosen.set(accessCode, {
      id: asString((row as any).id),
      access_code: accessCode,
      status: asString((row as any).status, "active"),
      started_at: asString((row as any).started_at),
      expires_at: expiresAt,
      revoked_at: asNullableString((row as any).revoked_at),
    });
  }
  return Array.from(chosen.values());
}

async function findExistingFeatureUnlockRecord(appCode: string, accountRef: string, accessCode: string, deviceId?: string | null) {
  const admin = createAdminClient();
  const aliases = getAccountRefAliases(accountRef);
  if (!aliases.length) return null;
  const normalizedAccessCode = asString(accessCode).toLowerCase();
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  const rows: any[] = [];
  const seen = new Set<string>();
  for (const alias of aliases) {
    const { data, error } = await admin
      .from("server_app_feature_unlocks")
      .select("id,access_code,status,started_at,expires_at,revoked_at,device_id")
      .eq("app_code", appCode)
      .eq("access_code", normalizedAccessCode)
      .ilike("account_ref", alias)
      .eq("status", "active")
      .is("revoked_at", null)
      .order("started_at", { ascending: false })
      .limit(20);
    if (error) {
      if (isMissingRelationError(error, "server_app_feature_unlocks")) return null;
      throw error;
    }
    for (const row of data ?? []) {
      const id = asString((row as any)?.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      rows.push(row);
    }
  }
  for (const row of rows) {
    const rowDeviceId = normalizeDeviceId((row as any).device_id);
    const deviceMatches = !normalizedDeviceId || !rowDeviceId || rowDeviceId === normalizedDeviceId;
    if (!deviceMatches) continue;
    return row;
  }
  return null;
}

function resolveFeatureUnlockMeta(featureCode: string, currentPlan: string, plan: RuntimePlan | null, unlockRules: RuntimeFeatureUnlockRule[], unlockMap: Map<string, RuntimeFeatureUnlockState>) {
  const normalizedCode = asString(featureCode).toLowerCase();
  const directRule = unlockRules.find((rule) => rule.access_code.toLowerCase() === normalizedCode);
  const guardedRule = directRule ?? unlockRules.find((rule) => rule.guarded_feature_codes.includes(normalizedCode));
  if (!guardedRule) {
    return {
      unlock_required: false,
      unlocked: false,
      unlock_expires_at: null,
      unlock_label: null,
      unlock_feature_code: null,
      unlock_soft_cost: 0,
      unlock_premium_cost: 0,
    };
  }
  const planCode = asString(currentPlan, "classic").toLowerCase();
  const freeByPlan = guardedRule.free_for_plans.includes(planCode);
  const activeUnlock = unlockMap.get(guardedRule.access_code.toLowerCase()) ?? null;
  const unlocked = freeByPlan || Boolean(activeUnlock);
  const softMultiplier = plan?.soft_cost_multiplier ?? 1;
  const premiumMultiplier = plan?.premium_cost_multiplier ?? 1;
  return {
    unlock_required: Boolean(guardedRule.unlock_required),
    unlocked,
    unlock_expires_at: freeByPlan ? null : (activeUnlock?.expires_at ?? null),
    unlock_label: guardedRule.title,
    unlock_feature_code: guardedRule.access_code,
    unlock_soft_cost: freeByPlan ? 0 : round2(guardedRule.soft_unlock_cost * softMultiplier),
    unlock_premium_cost: freeByPlan ? 0 : round2(guardedRule.premium_unlock_cost * premiumMultiplier),
  };
}

async function chargeWalletForUnlockAccess(params: {
  appCode: string;
  session: any;
  accessCode: string;
  ruleTitle: string;
  walletKind?: string | null;
  softCost: number;
  premiumCost: number;
  traceId?: string | null;
  settings: RuntimeSettings & { wallet_rules: RuntimeWalletRules };
  currentPlanCode: string;
  currentPlan: RuntimePlan | null;
}) {
  const softCost = round2(Math.max(0, asNumber(params.softCost, 0)));
  const premiumCost = round2(Math.max(0, asNumber(params.premiumCost, 0)));
  if (softCost <= 0 && premiumCost <= 0) {
    return { wallet_kind: "none", charged_soft: 0, charged_premium: 0 };
  }

  const wallet = await ensureWalletFresh(
    params.appCode,
    normalizeAccountRef(params.session.account_ref),
    params.currentPlan,
    params.settings,
    normalizeDeviceId(params.session.device_id),
  );

  const normalizedWalletKind = asString(params.walletKind, "auto").trim().toLowerCase();
  const requestedWalletKind = normalizedWalletKind === "vip" || normalizedWalletKind === "premium"
    ? "premium"
    : normalizedWalletKind === "normal" || normalizedWalletKind === "soft"
      ? "soft"
      : "auto";

  const plan = pickWalletChargePlan({
    requestedWalletKind,
    consumePriority: params.settings.wallet_rules.consume_priority,
    candidates: buildWalletChargeCandidates({
      softBalance: wallet.soft_balance,
      premiumBalance: wallet.premium_balance,
      softCost,
      premiumCost,
      allowDebt: false,
      maxDebtOverage: 0,
    }),
  });
  if (!plan) {
    throw Object.assign(new Error("INSUFFICIENT_BALANCE"), { status: 409, code: "INSUFFICIENT_BALANCE" });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("server_app_wallet_balances")
    .update({
      soft_balance: plan.next_soft,
      premium_balance: plan.next_premium,
      updated_by_source: "runtime_unlock",
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
    entitlement_id: asNullableString(params.session.entitlement_id),
    redeem_key_id: asNullableString(params.session.redeem_key_id),
    account_ref: normalizeAccountRef(params.session.account_ref),
    device_id: normalizeDeviceId(params.session.device_id),
    feature_code: params.accessCode,
    transaction_type: "consume",
    wallet_kind: plan.wallet_kind,
    consume_quantity: 1,
    soft_delta: plan.soft_delta,
    premium_delta: plan.premium_delta,
    soft_balance_after: plan.next_soft,
    premium_balance_after: plan.next_premium,
    note: `Unlock access: ${params.ruleTitle}`,
    metadata: {
      requested_wallet_kind: requestedWalletKind,
      effective_soft_cost: softCost,
      effective_premium_cost: premiumCost,
      plan_code: params.currentPlanCode,
      unlock_access: true,
      access_code: params.accessCode,
      mixed_wallet_charge: plan.wallet_kind === "mixed",
      trace_id: asNullableString(params.traceId),
    },
  });

  return {
    wallet_kind: plan.wallet_kind,
    charged_soft: plan.charged_soft,
    charged_premium: plan.charged_premium,
  };
}

export async function unlockRuntimeFeatureAccess(params: { appCode: string; sessionToken: string; accessCode: string; walletKind?: string | null; durationSeconds?: number | null; traceId?: string | null }) {
  const session = await findSession(params.appCode, params.sessionToken);
  if (!session) {
    throw Object.assign(new Error("SESSION_NOT_FOUND"), { status: 404, code: "SESSION_NOT_FOUND" });
  }
  if (session.status !== "active") {
    throw Object.assign(new Error("SESSION_INACTIVE"), { status: 409, code: "SESSION_INACTIVE" });
  }
  const accountRef = normalizeAccountRef(session.account_ref);
  if (!accountRef) {
    throw Object.assign(new Error("ACCOUNT_REQUIRED"), { status: 409, code: "ACCOUNT_REQUIRED" });
  }
  const sessionDeviceId = normalizeDeviceId(session.device_id);
  const controls = await enforceSessionActiveOrThrow(params.appCode, session);
  void controls;
  const { settings, planMap } = await getRuntimeContext(params.appCode);
  const entitlement = session.entitlement_id ? await getEntitlementById(asString(session.entitlement_id)) : await getLatestActiveEntitlement(params.appCode, accountRef, sessionDeviceId);
  const currentPlanCode = entitlement?.plan_code ? normalizePlanCode(entitlement.plan_code, settings.guest_plan) : settings.guest_plan;
  const activePlan = planMap.get(currentPlanCode) ?? null;
  const rules = await getFeatureUnlockRules(params.appCode);
  const accessCode = asString(params.accessCode).toLowerCase();
  const rule = rules.find((item) => item.access_code.toLowerCase() === accessCode);
  if (!rule || !rule.enabled) {
    throw Object.assign(new Error("UNLOCK_RULE_NOT_FOUND"), { status: 404, code: "UNLOCK_RULE_NOT_FOUND" });
  }
  const freeByPlan = rule.free_for_plans.includes(currentPlanCode.toLowerCase());
  let existing = await findExistingFeatureUnlockRecord(params.appCode, accountRef, accessCode, sessionDeviceId);
  if (existing && !rule.renewable) {
    return { access_code: accessCode, unlocked: true, expires_at: asNullableString(existing.expires_at), free_by_plan: freeByPlan, state: await buildRuntimeState(params.appCode, { sessionToken: params.sessionToken }) };
  }

  const requestedDays = Math.max(1, Math.round(Math.max(3600, Math.trunc(asNumber(params.durationSeconds, rule.unlock_duration_seconds))) / 86400));
  let baseSoftCost = rule.soft_unlock_cost;
  let basePremiumCost = rule.premium_unlock_cost;
  if (requestedDays >= 30) {
    baseSoftCost = rule.soft_unlock_cost_30d || rule.soft_unlock_cost;
    basePremiumCost = rule.premium_unlock_cost_30d || rule.premium_unlock_cost;
  } else if (requestedDays >= 7) {
    baseSoftCost = rule.soft_unlock_cost_7d || rule.soft_unlock_cost;
    basePremiumCost = rule.premium_unlock_cost_7d || rule.premium_unlock_cost;
  }
  const softCost = freeByPlan ? 0 : round2(baseSoftCost * (activePlan?.soft_cost_multiplier ?? 1));
  const premiumCost = freeByPlan ? 0 : round2(basePremiumCost * (activePlan?.premium_cost_multiplier ?? 1));
  const chargeResult = freeByPlan
    ? { wallet_kind: "none", charged_soft: 0, charged_premium: 0 }
    : await chargeWalletForUnlockAccess({
        appCode: params.appCode,
        session,
        accessCode,
        ruleTitle: rule.title,
        walletKind: params.walletKind,
        softCost,
        premiumCost,
        traceId: params.traceId,
        settings,
        currentPlanCode,
        currentPlan: activePlan,
      });

  const admin = createAdminClient();
  const nowIso = getNowIso();
  const durationSeconds = Math.max(3600, Math.trunc(asNumber(params.durationSeconds, rule.unlock_duration_seconds)));
  const expiresAt = addSecondsIso(nowIso, durationSeconds);
  if (existing) {
    const { error } = await admin.from("server_app_feature_unlocks").update({
      expires_at: expiresAt,
      revoked_at: null,
      status: "active",
      trace_id: asNullableString(params.traceId),
      updated_at: nowIso,
    }).eq("id", asString(existing.id));
    if (error) throw error;
  } else {
    const { error } = await admin.from("server_app_feature_unlocks").insert({
      app_code: params.appCode,
      access_code: accessCode,
      account_ref: accountRef,
      device_id: sessionDeviceId,
      status: "active",
      started_at: nowIso,
      expires_at: expiresAt,
      trace_id: asNullableString(params.traceId),
      unlock_source: freeByPlan ? "plan_free" : "credit_purchase",
    });
    if (error) {
      if (String((error as any)?.code ?? "") === "23505") {
        existing = await findExistingFeatureUnlockRecord(params.appCode, accountRef, accessCode, sessionDeviceId);
        if (existing?.id) {
          const { error: retryError } = await admin.from("server_app_feature_unlocks").update({
            expires_at: expiresAt,
            revoked_at: null,
            status: "active",
            trace_id: asNullableString(params.traceId),
            updated_at: nowIso,
          }).eq("id", asString(existing.id));
          if (retryError) throw retryError;
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }
  }
  await logRuntimeEvent({
    app_code: params.appCode,
    event_type: "unlock_feature",
    ok: true,
    code: "OK",
    account_ref: accountRef,
    device_id: sessionDeviceId,
    session_id: asString(session.id),
    feature_code: accessCode,
    wallet_kind: chargeResult.wallet_kind,
    meta: {
      expires_at: expiresAt,
      free_by_plan: freeByPlan,
      charged_soft: chargeResult.charged_soft,
      charged_premium: chargeResult.charged_premium,
    },
  });
  return { access_code: accessCode, unlocked: true, expires_at: expiresAt, free_by_plan: freeByPlan, state: await buildRuntimeState(params.appCode, { sessionToken: params.sessionToken }) };
}

async function getWalletRules(appCode: string): Promise<RuntimeWalletRules> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("server_app_wallet_rules")
    .select("soft_daily_reset_enabled,premium_daily_reset_enabled,soft_daily_reset_amount,premium_daily_reset_amount,consume_priority,soft_daily_reset_mode,premium_daily_reset_mode,soft_floor_credit,premium_floor_credit,soft_allow_negative,premium_allow_negative")
    .eq("app_code", appCode)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error, "server_app_wallet_rules")) {
      return {
        soft_daily_reset_enabled: false,
        premium_daily_reset_enabled: false,
        soft_daily_reset_amount: 0,
        premium_daily_reset_amount: 0,
        consume_priority: 'soft_first',
        soft_daily_reset_mode: 'debt_floor',
        premium_daily_reset_mode: 'debt_floor',
        soft_floor_credit: 5,
        premium_floor_credit: 5,
        soft_allow_negative: true,
        premium_allow_negative: true,
      };
    }
    throw error;
  }
  return {
    soft_daily_reset_enabled: Boolean(data?.soft_daily_reset_enabled ?? false),
    premium_daily_reset_enabled: Boolean(data?.premium_daily_reset_enabled ?? false),
    soft_daily_reset_amount: asNumber(data?.soft_daily_reset_amount),
    premium_daily_reset_amount: asNumber(data?.premium_daily_reset_amount),
    consume_priority: String(data?.consume_priority ?? 'soft_first').trim() === 'premium_first' ? 'premium_first' : 'soft_first',
    soft_daily_reset_mode: String(data?.soft_daily_reset_mode ?? 'debt_floor').trim() === 'legacy_floor' ? 'legacy_floor' : 'debt_floor',
    premium_daily_reset_mode: String(data?.premium_daily_reset_mode ?? 'debt_floor').trim() === 'legacy_floor' ? 'legacy_floor' : 'debt_floor',
    soft_floor_credit: asNumber(data?.soft_floor_credit, 5),
    premium_floor_credit: asNumber(data?.premium_floor_credit, 5),
    soft_allow_negative: Boolean(data?.soft_allow_negative ?? true),
    premium_allow_negative: Boolean(data?.premium_allow_negative ?? true),
  };
}

export async function getRuntimeControls(appCode: string): Promise<RuntimeControls> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("server_app_runtime_controls")
    .select("runtime_enabled,catalog_enabled,redeem_enabled,consume_enabled,heartbeat_enabled,maintenance_notice,min_client_version,blocked_client_versions,blocked_accounts,blocked_devices,blocked_ip_hashes,max_daily_redeems_per_account,max_daily_redeems_per_device,session_idle_timeout_minutes,session_max_age_minutes,event_retention_days")
    .eq("app_code", appCode)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error, "server_app_runtime_controls")) {
      return {
        runtime_enabled: true,
        catalog_enabled: true,
        redeem_enabled: true,
        consume_enabled: true,
        heartbeat_enabled: true,
        maintenance_notice: null,
        min_client_version: null,
        blocked_client_versions: [],
        blocked_accounts: [],
        blocked_devices: [],
        blocked_ip_hashes: [],
        max_daily_redeems_per_account: 0,
        max_daily_redeems_per_device: 0,
        session_idle_timeout_minutes: 1440,
        session_max_age_minutes: 43200,
        event_retention_days: 30,
      };
    }
    throw error;
  }
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

  if (accountRef) query = query.ilike("account_ref", normalizeAccountRef(accountRef));
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

async function findLatestReusableSession(appCode: string, accountRef: string, deviceId?: string | null) {
  const aliases = getAccountRefAliases(accountRef);
  if (!aliases.length) return null;
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  const admin = createAdminClient();
  const rows: any[] = [];
  const seen = new Set<string>();
  for (const alias of aliases) {
    let query = admin
      .from("server_app_sessions")
      .select("id,app_code,account_ref,device_id,entitlement_id,redeem_key_id,status,started_at,last_seen_at,expires_at,revoked_at,client_version")
      .eq("app_code", appCode)
      .ilike("account_ref", alias)
      .eq("status", "active")
      .is("revoked_at", null)
      .order("last_seen_at", { ascending: false })
      .limit(20);
    if (normalizedDeviceId) query = query.eq("device_id", normalizedDeviceId);
    const { data, error } = await query;
    if (error) throw error;
    for (const row of data ?? []) {
      const id = asString((row as any)?.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      rows.push(row);
    }
  }
  const now = Date.now();
  rows.sort((left: any, right: any) => {
    const rightSeen = right?.last_seen_at ? new Date(String(right.last_seen_at)).getTime() : 0;
    const leftSeen = left?.last_seen_at ? new Date(String(left.last_seen_at)).getTime() : 0;
    return rightSeen - leftSeen;
  });
  for (const row of rows) {
    const expiresAt = asNullableString((row as any).expires_at);
    if (expiresAt && new Date(expiresAt).getTime() <= now) continue;
    return row;
  }
  return null;
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
    plan_code: normalizePlanCode((data as any).plan_code),
    status: asString((data as any).status, "active"),
    starts_at: asString((data as any).starts_at),
    expires_at: asNullableString((data as any).expires_at),
    revoked_at: asNullableString((data as any).revoked_at),
    device_limit: (data as any).device_limit == null ? null : Math.trunc(asNumber((data as any).device_limit)),
    account_limit: (data as any).account_limit == null ? null : Math.trunc(asNumber((data as any).account_limit)),
  };
}

async function getLatestActiveEntitlement(appCode: string, accountRef: string, deviceId?: string | null): Promise<RuntimeEntitlement | null> {
  const aliases = getAccountRefAliases(accountRef);
  if (!aliases.length) return null;
  const admin = createAdminClient();
  const rows: any[] = [];
  const seen = new Set<string>();
  for (const alias of aliases) {
    const { data, error } = await admin
      .from("server_app_entitlements")
      .select("id,plan_code,status,starts_at,expires_at,revoked_at,device_limit,account_limit,device_id,updated_at")
      .eq("app_code", appCode)
      .ilike("account_ref", alias)
      .eq("status", "active");
    if (error) throw error;
    for (const row of data ?? []) {
      const id = asString((row as any)?.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      rows.push(row);
    }
  }
  const now = Date.now();
  const hintedDeviceId = asNullableString(deviceId);
  const usable = rows.filter((item: any) => {
    if (item?.revoked_at) return false;
    if (!item?.expires_at) return true;
    return new Date(String(item.expires_at)).getTime() > now;
  });
  if (!usable.length) return null;

  usable.sort((left: any, right: any) => {
    const leftPlanRank = getPlanRank(asString(left?.plan_code, "classic"));
    const rightPlanRank = getPlanRank(asString(right?.plan_code, "classic"));
    if (rightPlanRank !== leftPlanRank) return rightPlanRank - leftPlanRank;

    const leftDeviceMatch = hintedDeviceId && asString(left?.device_id) === hintedDeviceId ? 1 : 0;
    const rightDeviceMatch = hintedDeviceId && asString(right?.device_id) === hintedDeviceId ? 1 : 0;
    if (rightDeviceMatch !== leftDeviceMatch) return rightDeviceMatch - leftDeviceMatch;

    const leftExpiry = left?.expires_at ? new Date(String(left.expires_at)).getTime() : Number.MAX_SAFE_INTEGER;
    const rightExpiry = right?.expires_at ? new Date(String(right.expires_at)).getTime() : Number.MAX_SAFE_INTEGER;
    if (rightExpiry !== leftExpiry) return rightExpiry > leftExpiry ? 1 : -1;

    const leftUpdated = left?.updated_at ? new Date(String(left.updated_at)).getTime() : 0;
    const rightUpdated = right?.updated_at ? new Date(String(right.updated_at)).getTime() : 0;
    if (rightUpdated !== leftUpdated) return rightUpdated - leftUpdated;

    const leftStarts = left?.starts_at ? new Date(String(left.starts_at)).getTime() : 0;
    const rightStarts = right?.starts_at ? new Date(String(right.starts_at)).getTime() : 0;
    return rightStarts - leftStarts;
  });

  const row = usable[0];
  return {
    id: asString(row.id),
    plan_code: normalizePlanCode(row.plan_code),
    status: asString(row.status, "active"),
    starts_at: asString(row.starts_at),
    expires_at: asNullableString(row.expires_at),
    revoked_at: asNullableString(row.revoked_at),
    device_limit: row.device_limit == null ? null : Math.trunc(asNumber(row.device_limit)),
    account_limit: row.account_limit == null ? null : Math.trunc(asNumber(row.account_limit)),
  };
}

async function syncSessionEntitlement(sessionId: string | null, entitlementId: string | null) {
  if (!sessionId || !entitlementId) return;
  const admin = createAdminClient();
  const { error } = await admin
    .from("server_app_sessions")
    .update({ entitlement_id: entitlementId, updated_at: getNowIso() })
    .eq("id", sessionId)
    .neq("entitlement_id", entitlementId);
  if (error) throw error;
}

async function getWalletRecord(appCode: string, accountRef: string): Promise<RuntimeWallet | null> {
  const aliases = getAccountRefAliases(accountRef);
  if (!aliases.length) return null;
  const admin = createAdminClient();
  for (const alias of aliases) {
    const { data, error } = await admin
      .from("server_app_wallet_balances")
      .select("id,soft_balance,premium_balance,last_soft_reset_at,last_premium_reset_at")
      .eq("app_code", appCode)
      .ilike("account_ref", alias)
      .maybeSingle();

    if (error) throw error;
    if (!data) continue;
    return {
      id: asString((data as any).id),
      soft_balance: asNumber((data as any).soft_balance),
      premium_balance: asNumber((data as any).premium_balance),
      last_soft_reset_at: asNullableString((data as any).last_soft_reset_at),
      last_premium_reset_at: asNullableString((data as any).last_premium_reset_at),
    };
  }
  return null;
}

async function ensureWalletRecord(appCode: string, accountRef: string, deviceId?: string | null): Promise<RuntimeWallet> {
  const existing = await getWalletRecord(appCode, accountRef);
  if (existing) return existing;

  const admin = createAdminClient();
  const payload = {
    app_code: appCode,
    account_ref: normalizeAccountRef(accountRef),
    device_id: normalizeDeviceId(deviceId),
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
    walletRules.soft_daily_reset_enabled ? Math.max(walletRules.soft_daily_reset_amount, walletRules.soft_floor_credit) : 0,
    currentPlan?.daily_soft_credit ?? 0,
  ));
  const premiumTarget = round2(Math.max(
    walletRules.premium_daily_reset_enabled ? Math.max(walletRules.premium_daily_reset_amount, walletRules.premium_floor_credit) : 0,
    currentPlan?.daily_premium_credit ?? 0,
  ));

  if (walletRules.soft_daily_reset_enabled && (!wallet.last_soft_reset_at || wallet.last_soft_reset_at < cycleStartIso)) {
    const prev = nextSoftBalance;
    nextSoftBalance = applyResetFloorWithDebt(nextSoftBalance, softTarget, walletRules.soft_daily_reset_mode);
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
    nextPremiumBalance = applyResetFloorWithDebt(nextPremiumBalance, premiumTarget, walletRules.premium_daily_reset_mode);
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
    .select("id,package_code,title,description,enabled,reward_mode,plan_code,soft_credit_amount,premium_credit_amount,entitlement_days,entitlement_seconds,device_limit_override,account_limit_override")
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
    plan_code: asNullableString(normalizePlanCode((data as any).plan_code, "")) || null,
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
    .select("id,reward_package_id,redeem_key,enabled,starts_at,expires_at,max_redemptions,redeemed_count,reward_mode,plan_code,soft_credit_amount,premium_credit_amount,entitlement_days,entitlement_seconds,device_limit_override,account_limit_override,blocked_at,blocked_reason,metadata")
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
    plan_code: asNullableString(normalizePlanCode((data as any).plan_code, "")) || null,
    soft_credit_amount: asNumber((data as any).soft_credit_amount),
    premium_credit_amount: asNumber((data as any).premium_credit_amount),
    entitlement_days: Math.max(0, Math.trunc(asNumber((data as any).entitlement_days))),
    entitlement_seconds: Math.max(0, Math.trunc(asNumber((data as any).entitlement_seconds))),
    device_limit_override: (data as any).device_limit_override == null ? null : Math.trunc(asNumber((data as any).device_limit_override)),
    account_limit_override: (data as any).account_limit_override == null ? null : Math.trunc(asNumber((data as any).account_limit_override)),
    blocked_at: asNullableString((data as any).blocked_at),
    blocked_reason: asNullableString((data as any).blocked_reason),
    metadata: typeof (data as any).metadata === "object" && (data as any).metadata != null ? (data as any).metadata : {},
  };
}


function inferLegacyFindDumpsAppCode(source: any) {
  const direct = asString((source as any)?.app_code).toLowerCase();
  if (direct) return direct;
  const packageCode = asString((source as any)?.default_package_code).toLowerCase();
  const creditCode = asString((source as any)?.default_credit_code).toLowerCase();
  const code = asString((source as any)?.code).toLowerCase();
  const signature = asString((source as any)?.key_signature).toLowerCase();
  if (packageCode || creditCode) return "find-dumps";
  if (signature === "fd") return "find-dumps";
  if (code.startsWith("fd")) return "find-dumps";
  return "";
}

function resolveLegacyFindDumpsRewardFromKeyType(keyType: any) {
  const packageCode = asString((keyType as any)?.default_package_code).toLowerCase();
  const creditCode = asString((keyType as any)?.default_credit_code).toLowerCase();
  const durationSeconds = Math.max(60, Number((keyType as any)?.duration_seconds ?? 3600));
  const walletKind = asString((keyType as any)?.default_wallet_kind || (creditCode === "credit-vip" ? "vip" : "normal"), "normal").toLowerCase();
  if (packageCode) {
    return {
      reward_mode: "plan",
      plan_code: packageCode,
      soft_credit_amount: 0,
      premium_credit_amount: 0,
      entitlement_days: 0,
      entitlement_seconds: durationSeconds,
      device_limit_override: null,
      account_limit_override: null,
      title: `Legacy Find Dumps ${packageCode}`,
      description: `LEGACY_FREE_BRIDGE package ${packageCode}`,
      package_code: packageCode,
      credit_code: null,
      wallet_kind: null,
    };
  }
  if (creditCode) {
    return {
      reward_mode: creditCode === "credit-vip" ? "premium_credit" : "soft_credit",
      plan_code: null,
      soft_credit_amount: creditCode === "credit-normal" ? 1.5 : 0,
      premium_credit_amount: creditCode === "credit-vip" ? 0.5 : 0,
      entitlement_days: 0,
      entitlement_seconds: 0,
      device_limit_override: null,
      account_limit_override: null,
      title: `Legacy Find Dumps ${creditCode}`,
      description: `LEGACY_FREE_BRIDGE credit ${creditCode}`,
      package_code: null,
      credit_code: creditCode,
      wallet_kind: walletKind,
    };
  }
  return null;
}

async function tryBridgeLegacyLicenseKeyToRedeemKey(appCode: string, redeemKey: string): Promise<RuntimeRedeemKey | null> {
  if (asString(appCode).toLowerCase() !== "find-dumps") return null;
  const admin = createAdminClient();
  let license: any = null;
  {
    const { data, error } = await admin
      .from("licenses")
      .select("id,key,expires_at,is_active,note,deleted_at,duration_seconds")
      .eq("key", redeemKey)
      .maybeSingle();
    if (error) {
      if (isMissingRelationError(error, "licenses")) return null;
      throw error;
    }
    license = data;
  }
  if (!license || license.deleted_at || license.is_active === false) return null;

  const { data: issue, error: issueError } = await admin
    .from("licenses_free_issues")
    .select("issue_id,session_id,server_redeem_key_id,app_code")
    .eq("license_id", asString((license as any).id))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (issueError) {
    if (isMissingRelationError(issueError, "licenses_free_issues")) return null;
    throw issueError;
  }
  if (!issue?.session_id) return null;
  if (issue?.server_redeem_key_id) {
    const existing = await getRedeemKeyByValue(appCode, redeemKey);
    if (existing) return existing;
  }

  const { data: freeSession, error: sessionError } = await admin
    .from("licenses_free_sessions")
    .select("session_id,key_type_code,app_code,expires_at,duration_seconds")
    .eq("session_id", asString((issue as any).session_id))
    .maybeSingle();
  if (sessionError) {
    if (isMissingRelationError(sessionError, "licenses_free_sessions")) return null;
    throw sessionError;
  }
  if (!freeSession?.key_type_code) return null;

  const { data: keyType, error: keyTypeError } = await admin
    .from("licenses_free_key_types")
    .select("code,label,duration_seconds,enabled,app_code,default_package_code,default_credit_code,default_wallet_kind,key_signature")
    .eq("code", asString((freeSession as any).key_type_code))
    .maybeSingle();
  if (keyTypeError) {
    if (isMissingRelationError(keyTypeError, "licenses_free_key_types")) return null;
    throw keyTypeError;
  }
  if (!keyType || keyType.enabled === false) return null;
  const inferredAppCode = inferLegacyFindDumpsAppCode(keyType) || inferLegacyFindDumpsAppCode(freeSession) || inferLegacyFindDumpsAppCode(issue);
  if (inferredAppCode !== "find-dumps") return null;
  const reward = resolveLegacyFindDumpsRewardFromKeyType(keyType);
  if (!reward) return null;

  const nowIso = getNowIso();
  const expiresAt = asNullableString((license as any).expires_at) || asNullableString((freeSession as any).expires_at) || addSecondsIso(nowIso, Math.max(60, Math.trunc(asNumber((keyType as any).duration_seconds, 3600))));
  const existing = await getRedeemKeyByValue(appCode, redeemKey);
  if (existing) return existing;

  const { data: inserted, error: insertError } = await admin
    .from("server_app_redeem_keys")
    .insert({
      app_code: "find-dumps",
      redeem_key: redeemKey,
      title: reward.title,
      description: reward.description,
      enabled: true,
      starts_at: nowIso,
      expires_at: expiresAt,
      max_redemptions: 1,
      redeemed_count: 0,
      reward_mode: reward.reward_mode,
      plan_code: reward.plan_code,
      soft_credit_amount: reward.soft_credit_amount,
      premium_credit_amount: reward.premium_credit_amount,
      entitlement_days: reward.entitlement_days,
      entitlement_seconds: reward.entitlement_seconds,
      source_free_session_id: asString((freeSession as any).session_id),
      notes: `LEGACY_FREE_BRIDGE;KEY_TYPE=${String((keyType as any).code).toUpperCase()};APP=find-dumps`,
      metadata: {
        source: "legacy-free-bridge",
        free_session_id: asString((freeSession as any).session_id),
        key_type_code: asString((keyType as any).code),
        package_code: reward.package_code,
        credit_code: reward.credit_code,
        wallet_kind: reward.wallet_kind,
        claim_starts_entitlement: Boolean(reward.package_code),
        expires_from_claim: true,
      },
    })
    .select("id")
    .single();
  if (insertError) {
    if (String((insertError as any)?.code ?? "") != "23505") throw insertError;
  }
  const redeemRow = await getRedeemKeyByValue(appCode, redeemKey);
  if (!redeemRow) return null;

  try {
    if (inserted?.id) {
      await admin.from("licenses_free_issues").update({ app_code: "find-dumps", server_redeem_key_id: inserted.id }).eq("issue_id", asString((issue as any).issue_id));
      await admin.from("licenses_free_sessions").update({ app_code: "find-dumps", issued_server_redeem_key_id: inserted.id, issued_server_reward_mode: reward.reward_mode }).eq("session_id", asString((freeSession as any).session_id));
    }
  } catch (_err) {
    // bridge note updates are best-effort only
  }
  return redeemRow;
}

function resolveRewardPackage(keyRow: RuntimeRedeemKey, pkg: RuntimeRewardPackage | null): RuntimeResolvedReward {
  const claimStartsEntitlement = Boolean((keyRow.metadata as any)?.claim_starts_entitlement);
  const claimBoundExpiresAt = claimStartsEntitlement ? asNullableString(keyRow.expires_at) : null;
  const remainingClaimSeconds = claimBoundExpiresAt
    ? Math.max(0, Math.floor((new Date(claimBoundExpiresAt).getTime() - Date.now()) / 1000))
    : 0;
  if (keyRow.reward_package_id && pkg) {
    const pkgSeconds = Math.max(0, pkg.entitlement_seconds);
    return {
      reward_mode: asString(pkg.reward_mode, keyRow.reward_mode),
      package_code: pkg.package_code,
      title: pkg.title,
      plan_code: pkg.plan_code ? normalizePlanCode(pkg.plan_code, "") : null,
      soft_credit_amount: round2(pkg.soft_credit_amount),
      premium_credit_amount: round2(pkg.premium_credit_amount),
      entitlement_days: Math.max(0, pkg.entitlement_days),
      entitlement_seconds: claimStartsEntitlement && remainingClaimSeconds > 0 ? remainingClaimSeconds : pkgSeconds,
      claim_bound_expires_at: claimBoundExpiresAt,
      device_limit_override: pkg.device_limit_override,
      account_limit_override: pkg.account_limit_override,
    };
  }

  return {
    reward_mode: asString(keyRow.reward_mode, "mixed"),
    package_code: null,
    title: null,
    plan_code: keyRow.plan_code ? normalizePlanCode(keyRow.plan_code, "") : null,
    soft_credit_amount: round2(keyRow.soft_credit_amount),
    premium_credit_amount: round2(keyRow.premium_credit_amount),
    entitlement_days: Math.max(0, keyRow.entitlement_days),
    entitlement_seconds: claimStartsEntitlement && remainingClaimSeconds > 0 ? remainingClaimSeconds : Math.max(0, keyRow.entitlement_seconds),
    claim_bound_expires_at: claimBoundExpiresAt,
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
  const aliases = getAccountRefAliases(accountRef);
  if (!aliases.length) return;
  const admin = createAdminClient();
  const nowIso = getNowIso();
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  for (const alias of aliases) {
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
      .ilike("account_ref", alias)
      .eq("device_id", normalizedDeviceId)
      .eq("status", "active");

    if (error) throw error;
  }
}

async function countOtherActiveDevices(appCode: string, accountRef: string, currentDeviceId: string) {
  const aliases = getAccountRefAliases(accountRef);
  if (!aliases.length) return 0;
  const admin = createAdminClient();
  const devices = new Set<string>();
  for (const alias of aliases) {
    const { data, error } = await admin
      .from("server_app_sessions")
      .select("device_id")
      .eq("app_code", appCode)
      .ilike("account_ref", alias)
      .eq("status", "active");

    if (error) throw error;
    for (const row of data ?? []) {
      const deviceId = asString((row as any).device_id);
      if (deviceId && deviceId !== currentDeviceId) devices.add(deviceId);
    }
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
    account_ref: normalizeAccountRef(params.accountRef),
    device_id: normalizeDeviceId(params.deviceId),
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
      account_ref: normalizeAccountRef(params.accountRef),
      device_id: normalizeDeviceId(params.deviceId),
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
  const planCode = normalizePlanCode(
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
  const nextExpiry = params.reward.entitlement_seconds > 0
    ? addSecondsIso(baseExpiry, params.reward.entitlement_seconds)
    : params.reward.entitlement_days > 0
      ? addDaysIso(baseExpiry, params.reward.entitlement_days)
      : (params.settings.key_persist_until_revoked ? null : usableExisting?.expires_at ?? null);

  const payload = {
    app_code: params.appCode,
    account_ref: normalizeAccountRef(params.accountRef),
    device_id: normalizeDeviceId(params.deviceId),
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
      plan_code: normalizePlanCode((data as any).plan_code),
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
    plan_code: normalizePlanCode((data as any).plan_code),
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
      device_id: normalizeDeviceId(params.deviceId),
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
    account_ref: normalizeAccountRef(params.accountRef),
    device_id: normalizeDeviceId(params.deviceId),
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
  const walletRules = await getWalletRules(appCode);
  const unlockRules = await getFeatureUnlockRules(appCode);
  const planMap = new Map(plans.map((plan) => [plan.plan_code, plan]));
  return { config, settings: { ...settings, wallet_rules: walletRules }, plans, planMap, features, unlockRules };
}

export async function buildRuntimeState(appCode: string, opts?: { sessionToken?: string | null; accountRef?: string | null; deviceId?: string | null }) : Promise<RuntimeAppState> {
  const { config, settings, planMap, features, unlockRules } = await getRuntimeContext(appCode);

  const sessionToken = asNullableString(opts?.sessionToken);
  const hintedAccountRef = asNullableString(opts?.accountRef)?.toLowerCase() ?? null;
  const hintedDeviceId = asNullableString(opts?.deviceId);
  let session = sessionToken ? await findSession(appCode, sessionToken) : null;
  if (!session && hintedAccountRef) {
    session = await findLatestReusableSession(appCode, hintedAccountRef, hintedDeviceId ?? null);
  }
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

  const effectiveAccountRef = session?.account_ref ? normalizeAccountRef(session.account_ref) : (hintedAccountRef ?? null);
  const effectiveDeviceId = session?.device_id ? normalizeDeviceId(session.device_id) : (hintedDeviceId ?? null);

  let entitlement = session?.entitlement_id
    ? await getEntitlementById(asString(session.entitlement_id))
    : effectiveAccountRef
      ? await getLatestActiveEntitlement(appCode, effectiveAccountRef, effectiveDeviceId)
      : null;

  const bestEntitlement = effectiveAccountRef
    ? await getLatestActiveEntitlement(appCode, effectiveAccountRef, effectiveDeviceId)
    : null;

  if (isEntitlementUsable(bestEntitlement)) {
    const currentRank = isEntitlementUsable(entitlement) ? getPlanRank(asString(entitlement?.plan_code, settings.guest_plan)) : 0;
    const bestRank = getPlanRank(asString(bestEntitlement?.plan_code, settings.guest_plan));
    const shouldPromoteSessionEntitlement = !isEntitlementUsable(entitlement)
      || asString(entitlement?.id) !== asString(bestEntitlement?.id)
      || bestRank > currentRank;
    if (shouldPromoteSessionEntitlement) {
      entitlement = bestEntitlement;
      if (session?.id) {
        await syncSessionEntitlement(asString(session.id), asString(bestEntitlement.id));
        session = { ...session, entitlement_id: asString(bestEntitlement.id) };
      }
    }
  }

  if (!isEntitlementUsable(entitlement)) {
    entitlement = null;
  }

  let currentPlan = entitlement?.plan_code ? normalizePlanCode(entitlement.plan_code, settings.guest_plan) : settings.guest_plan;
  if (!planMap.has(currentPlan)) currentPlan = settings.guest_plan;
  const activePlan = planMap.get(currentPlan) ?? null;
  const currentPlanRank = getPlanRank(currentPlan);

  const walletRow = effectiveAccountRef
    ? await ensureWalletFresh(appCode, effectiveAccountRef, activePlan, settings, effectiveDeviceId)
    : null;
  const wallet = {
    soft_balance: asNumber(walletRow?.soft_balance),
    premium_balance: asNumber(walletRow?.premium_balance),
    last_soft_reset_at: asNullableString(walletRow?.last_soft_reset_at),
    last_premium_reset_at: asNullableString(walletRow?.last_premium_reset_at),
  };

  const unlockStates = effectiveAccountRef
    ? await getLatestFeatureUnlockStates(appCode, effectiveAccountRef, effectiveDeviceId)
    : [];
  const unlockMap = new Map(unlockStates.map((item) => [item.access_code.toLowerCase(), item]));

  const decoratedFeatures = features.map((feature) => {
    const minRank = getPlanRank(feature.min_plan);
    const softMultiplier = activePlan?.soft_cost_multiplier ?? 1;
    const premiumMultiplier = activePlan?.premium_cost_multiplier ?? 1;
    const guestVisible = effectiveAccountRef ? true : feature.visible_to_guest;
    const unlockMeta = resolveFeatureUnlockMeta(feature.feature_code, currentPlan, activePlan, unlockRules, unlockMap);
    return {
      ...feature,
      allowed: guestVisible && currentPlanRank >= minRank,
      effective_soft_cost: round2(feature.soft_cost * softMultiplier),
      effective_premium_cost: round2(feature.premium_cost * premiumMultiplier),
      ...unlockMeta,
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
    plan_meta: activePlan ? {
      label: activePlan.label ?? null,
      hint: `Gói ${activePlan.label ?? currentPlan} đang hoạt động trên tài khoản hiện tại.`,
      benefits_text: `• Credit thường mỗi ngày: ${activePlan.daily_soft_credit}\n• Credit VIP mỗi ngày: ${activePlan.daily_premium_credit}\n• Hệ số soft: x${activePlan.soft_cost_multiplier} • VIP: x${activePlan.premium_cost_multiplier}`,
      daily_soft_credit: activePlan.daily_soft_credit,
      daily_premium_credit: activePlan.daily_premium_credit,
      soft_cost_multiplier: activePlan.soft_cost_multiplier,
      premium_cost_multiplier: activePlan.premium_cost_multiplier,
      device_limit: activePlan.device_limit,
      account_limit: activePlan.account_limit,
    } : null,
    entitlement: entitlement ? {
      id: asString(entitlement.id),
      plan_code: normalizePlanCode(entitlement.plan_code),
      status: asString(entitlement.status),
      starts_at: asString(entitlement.starts_at),
      expires_at: asNullableString(entitlement.expires_at),
      revoked_at: asNullableString(entitlement.revoked_at),
      device_limit: entitlement.device_limit == null ? null : Math.trunc(asNumber(entitlement.device_limit)),
      account_limit: entitlement.account_limit == null ? null : Math.trunc(asNumber(entitlement.account_limit)),
    } : null,
    account: effectiveAccountRef ? { account_ref: effectiveAccountRef } : null,
    device_id: effectiveDeviceId,
    wallet,
    features: decoratedFeatures,
  } as RuntimeAppState;
}

export async function bootstrapRuntimeState(appCode: string, opts?: { sessionToken?: string | null; accountRef?: string | null; deviceId?: string | null; clientVersion?: string | null; ipHash?: string | null }) {
  const hintedAccountRef = asNullableString(opts?.accountRef)?.toLowerCase() ?? null;
  const hintedDeviceId = asNullableString(opts?.deviceId);
  let sessionToken = asNullableString(opts?.sessionToken) ?? null;
  let session = sessionToken ? await findSession(appCode, sessionToken) : null;

  if (sessionToken && !session) {
    sessionToken = null;
  }

  if (!session && hintedAccountRef) {
    session = await findLatestReusableSession(appCode, hintedAccountRef, hintedDeviceId ?? null);
  }

  const bestEntitlement = hintedAccountRef
    ? await getLatestActiveEntitlement(appCode, hintedAccountRef, hintedDeviceId ?? null)
    : null;

  if (session && isEntitlementUsable(bestEntitlement) && asString((session as any).entitlement_id) !== asString((bestEntitlement as any).id)) {
    await syncSessionEntitlement(asString((session as any).id), asString((bestEntitlement as any).id));
    session = { ...session, entitlement_id: asString((bestEntitlement as any).id) };
  }

  if (!sessionToken && hintedAccountRef && hintedDeviceId) {
    const reusableEntitlement = session?.entitlement_id
      ? await getEntitlementById(asString((session as any).entitlement_id))
      : null;
    const chosenEntitlement = isEntitlementUsable(bestEntitlement)
      ? bestEntitlement
      : (isEntitlementUsable(reusableEntitlement) ? reusableEntitlement : null);

    await revokeActiveDeviceSessions(appCode, hintedAccountRef, hintedDeviceId, "bootstrap_rotate");

    const created = await createRuntimeSession({
      appCode,
      accountRef: hintedAccountRef,
      deviceId: hintedDeviceId,
      entitlementId: chosenEntitlement ? asString((chosenEntitlement as any).id) : null,
      redeemKeyId: session?.redeem_key_id ? asString((session as any).redeem_key_id) : null,
      clientVersion: asNullableString(opts?.clientVersion),
      ipHash: asNullableString(opts?.ipHash),
    });
    sessionToken = created.session_token;
    session = await findSession(appCode, sessionToken);
  }

  const state = await buildRuntimeState(appCode, {
    sessionToken,
    accountRef: hintedAccountRef,
    deviceId: hintedDeviceId,
  });

  return {
    state,
    sessionToken: sessionToken ?? null,
    sessionBound: Boolean(sessionToken),
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
  let keyRow = await getRedeemKeyByValue(appCode, redeemKey);
  if (!keyRow) {
    keyRow = await tryBridgeLegacyLicenseKeyToRedeemKey(appCode, redeemKey);
  }
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

  const existingEntitlement = await getLatestActiveEntitlement(appCode, accountRef, deviceId);
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

  const effectivePlan = normalizePlanCode(entitlement?.plan_code ?? settings.guest_plan, settings.guest_plan);
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
      entitlement_seconds: reward.entitlement_seconds,
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
  quantity?: number | null;
  traceId?: string | null;
  overrideCost?: { softCost?: number | null; premiumCost?: number | null } | null;
}) {
  const appCode = asString(params.appCode);
  const sessionToken = asString(params.sessionToken);
  const featureCode = asString(params.featureCode);
  const requestedWalletKind = asString(params.walletKind, "auto").toLowerCase();
  const quantity = Math.max(1, Math.trunc(asNumber(params.quantity, 1)));
  if (!sessionToken) throw Object.assign(new Error("MISSING_SESSION_TOKEN"), { status: 400, code: "MISSING_SESSION_TOKEN" });
  if (!featureCode) throw Object.assign(new Error("MISSING_FEATURE_CODE"), { status: 400, code: "MISSING_FEATURE_CODE" });

  const session = await findSession(appCode, sessionToken);
  if (!session) throw Object.assign(new Error("SESSION_NOT_FOUND"), { status: 404, code: "SESSION_NOT_FOUND" });
  if (asString(session.status) !== "active") throw Object.assign(new Error("SESSION_INACTIVE"), { status: 409, code: "SESSION_INACTIVE" });
  await enforceSessionActiveOrThrow(appCode, session);

  const { settings, planMap, features } = await getRuntimeContext(appCode);
  const entitlement = session.entitlement_id
    ? await getEntitlementById(asString(session.entitlement_id))
    : await getLatestActiveEntitlement(appCode, asString(session.account_ref), asNullableString(session.device_id));
  if (session.entitlement_id && !isEntitlementUsable(entitlement)) {
    throw Object.assign(new Error("ENTITLEMENT_INACTIVE"), { status: 409, code: "ENTITLEMENT_INACTIVE" });
  }

  const currentPlanCode = isEntitlementUsable(entitlement) ? normalizePlanCode(entitlement?.plan_code, settings.guest_plan) : settings.guest_plan;
  const currentPlan = planMap.get(currentPlanCode) ?? null;
  const feature = features.find((item) => item.feature_code === featureCode);
  if (!feature) throw Object.assign(new Error("FEATURE_NOT_FOUND"), { status: 404, code: "FEATURE_NOT_FOUND" });

  const currentPlanRank = getPlanRank(currentPlanCode);
  const minRank = getPlanRank(feature.min_plan);
  if (currentPlanRank < minRank) {
    throw Object.assign(new Error("FEATURE_PLAN_LOCKED"), { status: 403, code: "FEATURE_PLAN_LOCKED" });
  }

  const wallet = await ensureWalletFresh(appCode, asString(session.account_ref), currentPlan, settings, asNullableString(session.device_id));
  const effectiveSoftCost = params.overrideCost
    ? round2(asNumber(params.overrideCost?.softCost, 0) * quantity)
    : round2(feature.soft_cost * (currentPlan?.soft_cost_multiplier ?? 1) * quantity);
  const effectivePremiumCost = params.overrideCost
    ? round2(asNumber(params.overrideCost?.premiumCost, 0) * quantity)
    : round2(feature.premium_cost * (currentPlan?.premium_cost_multiplier ?? 1) * quantity);

  let chargeKind: "none" | "soft" | "premium" | "mixed" = "none";
  let softDelta = 0;
  let premiumDelta = 0;
  let chargedSoft = 0;
  let chargedPremium = 0;

  let nextSoft = wallet.soft_balance;
  let nextPremium = wallet.premium_balance;

  if (feature.requires_credit) {
    const plan = pickWalletChargePlan({
      requestedWalletKind: requestedWalletKind === "premium" ? "premium" : requestedWalletKind === "soft" ? "soft" : "auto",
      consumePriority: settings.wallet_rules.consume_priority,
      candidates: buildWalletChargeCandidates({
        softBalance: wallet.soft_balance,
        premiumBalance: wallet.premium_balance,
        softCost: effectiveSoftCost,
        premiumCost: effectivePremiumCost,
        allowDebt: true,
        maxDebtOverage: RUNTIME_CONSUME_MAX_DEBT_OVERAGE,
      }),
    });
    if (!plan) {
      throw Object.assign(new Error("INSUFFICIENT_BALANCE"), { status: 409, code: "INSUFFICIENT_BALANCE" });
    }
    chargeKind = plan.wallet_kind;
    softDelta = plan.soft_delta;
    premiumDelta = plan.premium_delta;
    chargedSoft = plan.charged_soft;
    chargedPremium = plan.charged_premium;
    nextSoft = plan.next_soft;
    nextPremium = plan.next_premium;
  }

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
    consume_quantity: quantity,
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
      quantity,
      charge_unit: feature.charge_unit,
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
      charge_unit: feature.charge_unit,
      charge_on_success_only: feature.charge_on_success_only,
      client_accumulate_units: feature.client_accumulate_units,
    },
    wallet_kind: chargeKind,
    quantity,
    charged_soft: chargedSoft,
    charged_premium: chargedPremium,
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
