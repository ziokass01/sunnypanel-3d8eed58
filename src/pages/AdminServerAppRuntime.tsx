import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { RefreshCw, RotateCcw, Search, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { postFunction } from "@/lib/functions";

const PLAN_OPTIONS = ["classic", "go", "plus", "pro"] as const;
const REWARD_MODE_OPTIONS = ["package", "plan", "soft_credit", "premium_credit", "mixed"] as const;
const WALLET_KIND_OPTIONS = ["auto", "soft", "premium"] as const;
const SIMULATOR_ACTIONS = ["health", "catalog", "me", "redeem", "consume", "heartbeat", "logout"] as const;
const RUNTIME_TABS = ["simulator", "ops", "controls", "redeem", "entitlements", "wallets", "sessions", "transactions", "events"] as const;

async function getAdminAuthToken() {
  const sess = await supabase.auth.getSession();
  const token = sess.data.session?.access_token ?? null;
  if (!token) {
    const err = new Error("ADMIN_AUTH_REQUIRED") as Error & { code?: string };
    err.code = "ADMIN_AUTH_REQUIRED";
    throw err;
  }
  return token;
}


const FRIENDLY_ERROR_MAP: Record<string, string> = {
  BAD_JSON: "Payload gửi lên bị lỗi JSON.",
  METHOD_NOT_ALLOWED: "Cách gọi function chưa đúng phương thức.",
  MISSING_ACTION: "Thiếu action cần chạy.",
  MISSING_APP_CODE: "Thiếu mã app.",
  MISSING_ACCOUNT_REF: "Thiếu account ref.",
  MISSING_DEVICE_ID: "Thiếu device id.",
  MISSING_REDEEM_KEY: "Thiếu redeem key.",
  MISSING_FEATURE_CODE: "Thiếu feature code. Muốn consume thì phải nhập mã tính năng.",
  MISSING_SESSION_TOKEN: "Thiếu session token. Hãy redeem trước rồi mới heartbeat, consume hoặc logout.",
  REDEEM_KEY_NOT_FOUND: "Redeem key không tồn tại hoặc gõ sai.",
  REDEEM_KEY_DISABLED: "Redeem key đang bị tắt.",
  REDEEM_KEY_BLOCKED: "Redeem key đang bị khóa.",
  REDEEM_KEY_NOT_STARTED: "Redeem key chưa đến giờ bắt đầu.",
  REDEEM_KEY_EXPIRED: "Redeem key đã hết hạn.",
  REDEEM_KEY_LIMIT_REACHED: "Redeem key đã hết lượt dùng tối đa.",
  REDEEM_DAILY_ACCOUNT_LIMIT: "Account này đã chạm giới hạn redeem trong ngày.",
  REDEEM_DAILY_DEVICE_LIMIT: "Thiết bị này đã chạm giới hạn redeem trong ngày.",
  REWARD_PACKAGE_DISABLED: "Reward package đang bị tắt hoặc không còn hợp lệ.",
  DEVICE_LIMIT_REACHED: "Đã chạm giới hạn thiết bị đang hoạt động của entitlement này.",
  SESSION_NOT_FOUND: "Không tìm thấy session token này.",
  SESSION_INACTIVE: "Session này không còn active.",
  SESSION_EXPIRED: "Session đã hết hạn.",
  SESSION_IDLE_TIMEOUT: "Session đã hết hạn do không hoạt động quá lâu.",
  SESSION_MAX_AGE_EXPIRED: "Session đã quá tuổi tối đa.",
  FEATURE_NOT_FOUND: "Không tìm thấy feature code này.",
  FEATURE_PLAN_LOCKED: "Tính năng này bị khóa theo plan hiện tại.",
  INSUFFICIENT_SOFT_BALANCE: "Không đủ credit thường để consume tính năng này.",
  INSUFFICIENT_PREMIUM_BALANCE: "Không đủ credit kim cương để consume tính năng này.",
  PREMIUM_COST_NOT_CONFIGURED: "Tính năng này chưa có giá premium hợp lệ.",
  SOFT_COST_NOT_CONFIGURED: "Tính năng này chưa có giá soft hợp lệ.",
  ACCOUNT_BLOCKED: "Account này đang bị chặn bởi runtime controls.",
  DEVICE_BLOCKED: "Thiết bị này đang bị chặn bởi runtime controls.",
  IP_BLOCKED: "IP hiện tại đang bị chặn bởi runtime controls.",
  CLIENT_VERSION_TOO_OLD: "Phiên bản client quá cũ.",
  CLIENT_VERSION_BLOCKED: "Phiên bản client này đang bị chặn.",
  CATALOG_DISABLED: "Catalog hoặc me đang bị tắt.",
  REDEEM_DISABLED: "Redeem hiện đang bị tắt.",
  CONSUME_DISABLED: "Consume hiện đang bị tắt.",
  HEARTBEAT_DISABLED: "Heartbeat hiện đang bị tắt.",
  RUNTIME_DISABLED: "Runtime hiện đang bị tắt toàn bộ.",
  EMPTY_ADJUSTMENT: "Bạn chưa nhập số cộng hoặc trừ cho ví.",
  NEGATIVE_SOFT_BALANCE: "Không thể làm credit thường âm.",
  NEGATIVE_PREMIUM_BALANCE: "Không thể làm credit kim cương âm.",
  WALLET_BALANCE_CONFLICT: "Ví vừa bị thay đổi ở nơi khác. Hãy tải lại rồi thử lại.",
};

type RewardPackageOption = {
  id: string;
  package_code: string;
  title: string;
  enabled: boolean;
  reward_mode?: string | null;
  plan_code?: string | null;
  soft_credit_amount?: number | string | null;
  premium_credit_amount?: number | string | null;
  entitlement_days?: number | null;
};

type FeatureOption = {
  id?: string;
  feature_code: string;
  title: string;
  enabled: boolean;
};

type RedeemKeyRow = {
  id?: string;
  app_code: string;
  reward_package_id: string | null;
  redeem_key: string;
  title: string;
  description: string;
  enabled: boolean;
  starts_at: string | null;
  expires_at: string | null;
  max_redemptions: number;
  redeemed_count: number;
  reward_mode: string;
  plan_code: string | null;
  soft_credit_amount: string | number;
  premium_credit_amount: string | number;
  entitlement_days: number;
  device_limit_override: number | null;
  account_limit_override: number | null;
  blocked_at: string | null;
  blocked_reason: string;
  notes: string;
};

type EntitlementRow = {
  id: string;
  account_ref: string;
  device_id: string | null;
  plan_code: string;
  status: string;
  starts_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  created_at: string;
};

type WalletRow = {
  id: string;
  account_ref: string;
  device_id: string | null;
  soft_balance: string | number;
  premium_balance: string | number;
  last_soft_reset_at: string | null;
  last_premium_reset_at: string | null;
  updated_at: string;
};

type SessionRow = {
  id: string;
  account_ref: string;
  device_id: string;
  status: string;
  started_at: string;
  last_seen_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  client_version: string | null;
};

type TransactionRow = {
  id: string;
  account_ref: string;
  device_id: string | null;
  feature_code: string | null;
  transaction_type: string;
  wallet_kind: string;
  soft_delta: string | number;
  premium_delta: string | number;
  soft_balance_after: string | number | null;
  premium_balance_after: string | number | null;
  note: string | null;
  created_at: string;
};

type WalletRuleRuntimeRow = {
  app_code: string;
  soft_wallet_label: string | null;
  premium_wallet_label: string | null;
  consume_priority: 'soft_first' | 'premium_first';
};

type ControlRow = {
  app_code: string;
  runtime_enabled: boolean;
  catalog_enabled: boolean;
  redeem_enabled: boolean;
  consume_enabled: boolean;
  heartbeat_enabled: boolean;
  maintenance_notice: string | null;
  min_client_version: string | null;
  blocked_client_versions: string[] | null;
  blocked_accounts: string[] | null;
  blocked_devices: string[] | null;
  blocked_ip_hashes: string[] | null;
  max_daily_redeems_per_account: number;
  max_daily_redeems_per_device: number;
  session_idle_timeout_minutes: number;
  session_max_age_minutes: number;
  event_retention_days: number;
};

type ControlDraft = {
  app_code: string;
  runtime_enabled: boolean;
  catalog_enabled: boolean;
  redeem_enabled: boolean;
  consume_enabled: boolean;
  heartbeat_enabled: boolean;
  maintenance_notice: string;
  min_client_version: string;
  blocked_client_versions_text: string;
  blocked_accounts_text: string;
  blocked_devices_text: string;
  blocked_ip_hashes_text: string;
  max_daily_redeems_per_account: number;
  max_daily_redeems_per_device: number;
  session_idle_timeout_minutes: number;
  session_max_age_minutes: number;
  event_retention_days: number;
};

type EventRow = {
  id: string;
  event_type: string;
  ok: boolean;
  code: string | null;
  message: string | null;
  account_ref: string | null;
  device_id: string | null;
  feature_code: string | null;
  wallet_kind: string | null;
  ip_hash: string | null;
  client_version: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

type SimulatorAction = typeof SIMULATOR_ACTIONS[number];

type SimulatorForm = {
  action: SimulatorAction;
  account_ref: string;
  device_id: string;
  client_version: string;
  redeem_key: string;
  feature_code: string;
  wallet_kind: string;
  session_token: string;
};

type WalletAdjustForm = {
  account_ref: string;
  device_id: string;
  soft_delta: string;
  premium_delta: string;
  note: string;
};

function numericInput(value: unknown) {
  if (value == null) return "";
  return String(value);
}

function normalizeDecimal(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(2));
}

function toLocalDateTimeInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function fromLocalDateTimeInput(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formatTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("vi-VN");
}

function listToTextarea(value: string[] | null | undefined) {
  return (value ?? []).join("\n");
}

function textareaToList(value: string) {
  return Array.from(new Set(String(value ?? "").split(/[\n,]/).map((item) => item.trim()).filter(Boolean)));
}

function normalizeRuntimeTab(value: string | null) {
  return (RUNTIME_TABS as readonly string[]).includes(String(value || "")) ? (value as typeof RUNTIME_TABS[number]) : "simulator";
}

function compactEdgeMessage(message?: string | null) {
  const raw = String(message ?? "").trim();
  if (!raw) return "Có lỗi xảy ra khi gọi runtime.";
  if (raw.includes("Failed to send a request to the Edge Function")) {
    return "Không gửi được yêu cầu tới Edge Function. Kiểm tra deploy, CORS hoặc mạng.";
  }
  if (raw.includes("Edge Function returned a non-2xx status code")) {
    return "Edge Function trả về lỗi. Mở khối kết quả JSON để xem chi tiết.";
  }
  return raw;
}

function formatJsonBlock(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function emptyRedeemKey(appCode: string, index: number): RedeemKeyRow {
  return {
    app_code: appCode,
    reward_package_id: null,
    redeem_key: `REDEEM_${index + 1}`,
    title: "Redeem mới",
    description: "",
    enabled: true,
    starts_at: null,
    expires_at: null,
    max_redemptions: 1,
    redeemed_count: 0,
    reward_mode: "mixed",
    plan_code: null,
    soft_credit_amount: 0,
    premium_credit_amount: 0,
    entitlement_days: 0,
    device_limit_override: null,
    account_limit_override: null,
    blocked_at: null,
    blocked_reason: "",
    notes: "",
  };
}

function defaultControlDraft(appCode: string): ControlDraft {
  return {
    app_code: appCode,
    runtime_enabled: true,
    catalog_enabled: true,
    redeem_enabled: true,
    consume_enabled: true,
    heartbeat_enabled: true,
    maintenance_notice: "",
    min_client_version: "",
    blocked_client_versions_text: "",
    blocked_accounts_text: "",
    blocked_devices_text: "",
    blocked_ip_hashes_text: "",
    max_daily_redeems_per_account: 0,
    max_daily_redeems_per_device: 0,
    session_idle_timeout_minutes: 1440,
    session_max_age_minutes: 43200,
    event_retention_days: 30,
  };
}

function defaultSimulatorForm(): SimulatorForm {
  return {
    action: "health",
    account_ref: "",
    device_id: "",
    client_version: "1.0.0",
    redeem_key: "",
    feature_code: "",
    wallet_kind: "auto",
    session_token: "",
  };
}

function defaultWalletAdjustForm(): WalletAdjustForm {
  return {
    account_ref: "",
    device_id: "",
    soft_delta: "0",
    premium_delta: "0",
    note: "Điều chỉnh ví từ runtime admin",
  };
}

function getErrorCode(error: any) {
  return error?.context?.json?.code ?? error?.code ?? error?.message ?? "UNKNOWN_ERROR";
}

function getErrorMessage(error: any) {
  return error?.context?.json?.message
    ?? error?.context?.json?.msg
    ?? error?.message
    ?? "Unknown error";
}

function formatMutationError(error: any) {
  const code = String(getErrorCode(error));
  const raw = String(getErrorMessage(error));
  const friendly = FRIENDLY_ERROR_MAP[code] ?? raw;
  if (friendly === raw || raw.includes(code)) return `${friendly} (${code})`;
  return `${friendly} (${code})\n${raw}`;
}

function normalizeSearch(value: unknown) {
  return String(value ?? "").toLowerCase();
}

function matchesSearch(search: string, ...parts: Array<unknown>) {
  const q = normalizeSearch(search).trim();
  if (!q) return true;
  return parts.some((part) => normalizeSearch(part).includes(q));
}

function getSimulatorHelp(action: SimulatorAction) {
  switch (action) {
    case "redeem":
      return "Redeem cần account_ref, device_id và redeem_key. Session token sẽ tự đổ vào form sau khi chạy thành công.";
    case "consume":
      return "Consume cần session_token và feature_code. Không dùng redeem_key ở bước này.";
    case "heartbeat":
    case "logout":
      return "Action này cần session_token đã sinh ra từ redeem.";
    case "me":
      return "Me có thể gọi trống hoặc gắn session_token để xem trạng thái user hiện tại.";
    case "catalog":
      return "Catalog trả app, settings và danh sách feature. Không bắt buộc account/device.";
    default:
      return "Health chỉ kiểm tra function còn sống hay không.";
  }
}

function summarizeRewardSource(row: RedeemKeyRow, packageMap: Map<string, RewardPackageOption>) {
  if (row.reward_package_id) {
    const pkg = packageMap.get(row.reward_package_id);
    return {
      title: pkg ? `Đang lấy reward từ package ${pkg.package_code}` : "Đang trỏ tới package reward",
      description: pkg
        ? `Package hiện cho plan ${pkg.plan_code || "-"} · soft ${pkg.soft_credit_amount ?? 0} · premium ${pkg.premium_credit_amount ?? 0} · ${pkg.entitlement_days ?? 0} ngày.`
        : "Nếu muốn dùng credit gõ trực tiếp ở key này, hãy bỏ package hoặc đổi reward mode ra ngoài package rồi lưu lại.",
      variant: "package" as const,
    };
  }
  return {
    title: "Đang lấy reward trực tiếp từ key này",
    description: `Plan ${row.plan_code || "-"} · soft ${row.soft_credit_amount || 0} · premium ${row.premium_credit_amount || 0} · ${row.entitlement_days || 0} ngày.`,
    variant: "inline" as const,
  };
}

export function AdminServerAppRuntimePage() {
  const { appCode = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const runtimeQuery = useQuery({
    queryKey: ["admin-server-app-runtime", appCode],
    enabled: Boolean(appCode),
    queryFn: async () => {
      const sb = supabase as any;
      const [appRes, packageRes, featureRes, redeemRes, entitlementRes, walletRes, sessionRes, txRes, controlsRes, walletRulesRes, eventsRes] = await Promise.all([
        sb.from("server_apps").select("code,label,description,public_enabled").eq("code", appCode).maybeSingle(),
        sb.from("server_app_reward_packages").select("id,package_code,title,enabled,reward_mode,plan_code,soft_credit_amount,premium_credit_amount,entitlement_days").eq("app_code", appCode).order("sort_order", { ascending: true }),
        sb.from("server_app_features").select("id,feature_code,title,enabled").eq("app_code", appCode).order("sort_order", { ascending: true }),
        sb.from("server_app_redeem_keys").select("id,app_code,reward_package_id,redeem_key,title,description,enabled,starts_at,expires_at,max_redemptions,redeemed_count,reward_mode,plan_code,soft_credit_amount,premium_credit_amount,entitlement_days,device_limit_override,account_limit_override,blocked_at,blocked_reason,notes").eq("app_code", appCode).order("created_at", { ascending: false }),
        sb.from("server_app_entitlements").select("id,account_ref,device_id,plan_code,status,starts_at,expires_at,revoked_at,revoke_reason,created_at").eq("app_code", appCode).order("created_at", { ascending: false }).limit(100),
        sb.from("server_app_wallet_balances").select("id,account_ref,device_id,soft_balance,premium_balance,last_soft_reset_at,last_premium_reset_at,updated_at").eq("app_code", appCode).order("updated_at", { ascending: false }).limit(100),
        sb.from("server_app_sessions").select("id,account_ref,device_id,status,started_at,last_seen_at,expires_at,revoked_at,revoke_reason,client_version").eq("app_code", appCode).order("last_seen_at", { ascending: false }).limit(100),
        sb.from("server_app_wallet_transactions").select("id,account_ref,device_id,feature_code,transaction_type,wallet_kind,soft_delta,premium_delta,soft_balance_after,premium_balance_after,note,created_at").eq("app_code", appCode).order("created_at", { ascending: false }).limit(150),
        sb.from("server_app_runtime_controls").select("app_code,runtime_enabled,catalog_enabled,redeem_enabled,consume_enabled,heartbeat_enabled,maintenance_notice,min_client_version,blocked_client_versions,blocked_accounts,blocked_devices,blocked_ip_hashes,max_daily_redeems_per_account,max_daily_redeems_per_device,session_idle_timeout_minutes,session_max_age_minutes,event_retention_days").eq("app_code", appCode).maybeSingle(),
        sb.from("server_app_wallet_rules").select("app_code,soft_wallet_label,premium_wallet_label,consume_priority").eq("app_code", appCode).maybeSingle(),
        sb.from("server_app_runtime_events").select("id,event_type,ok,code,message,account_ref,device_id,feature_code,wallet_kind,ip_hash,client_version,meta,created_at").eq("app_code", appCode).order("created_at", { ascending: false }).limit(150),
      ]);

      const firstError = [appRes, packageRes, featureRes, redeemRes, entitlementRes, walletRes, sessionRes, txRes, controlsRes, walletRulesRes, eventsRes].find((item) => item.error)?.error;
      if (firstError) throw firstError;

      return {
        app: appRes.data,
        rewardPackages: (packageRes.data ?? []) as RewardPackageOption[],
        features: (featureRes.data ?? []) as FeatureOption[],
        redeemKeys: (redeemRes.data ?? []) as RedeemKeyRow[],
        entitlements: (entitlementRes.data ?? []) as EntitlementRow[],
        wallets: (walletRes.data ?? []) as WalletRow[],
        sessions: (sessionRes.data ?? []) as SessionRow[],
        transactions: (txRes.data ?? []) as TransactionRow[],
        controls: (controlsRes.data ?? null) as ControlRow | null,
        walletRules: (walletRulesRes.data ?? null) as WalletRuleRuntimeRow | null,
        events: (eventsRes.data ?? []) as EventRow[],
      };
    },
  });

  const { data, isLoading, error, refetch } = runtimeQuery;
  const [redeemDraft, setRedeemDraft] = useState<RedeemKeyRow[]>([]);
  const [controlDraft, setControlDraft] = useState<ControlDraft>(defaultControlDraft(appCode));
  const [simulatorDraft, setSimulatorDraft] = useState<SimulatorForm>(defaultSimulatorForm());
  const [simulatorResult, setSimulatorResult] = useState("");
  const [simulatorLastPayload, setSimulatorLastPayload] = useState("");
  const [simulatorStatus, setSimulatorStatus] = useState("Chưa chạy simulator.");
  const [opsResult, setOpsResult] = useState("");
  const [opsLastPayload, setOpsLastPayload] = useState("");
  const [opsStatus, setOpsStatus] = useState("Chưa chạy ops.");
  const [walletAdjustDraft, setWalletAdjustDraft] = useState<WalletAdjustForm>(defaultWalletAdjustForm());
  const [accountSearch, setAccountSearch] = useState("");
  const [redeemSearch, setRedeemSearch] = useState("");
  const [logSearch, setLogSearch] = useState("");
  const activeTab = normalizeRuntimeTab(searchParams.get("tab"));

  useEffect(() => {
    setRedeemDraft((data?.redeemKeys ?? []).map((row) => ({
      ...row,
      title: row.title ?? "",
      description: row.description ?? "",
      blocked_reason: row.blocked_reason ?? "",
      notes: row.notes ?? "",
    })));
  }, [data?.redeemKeys]);

  useEffect(() => {
    const row = data?.controls;
    setControlDraft(row ? {
      app_code: row.app_code,
      runtime_enabled: Boolean(row.runtime_enabled),
      catalog_enabled: Boolean(row.catalog_enabled),
      redeem_enabled: Boolean(row.redeem_enabled),
      consume_enabled: Boolean(row.consume_enabled),
      heartbeat_enabled: Boolean(row.heartbeat_enabled),
      maintenance_notice: row.maintenance_notice ?? "",
      min_client_version: row.min_client_version ?? "",
      blocked_client_versions_text: listToTextarea(row.blocked_client_versions ?? []),
      blocked_accounts_text: listToTextarea(row.blocked_accounts ?? []),
      blocked_devices_text: listToTextarea(row.blocked_devices ?? []),
      blocked_ip_hashes_text: listToTextarea(row.blocked_ip_hashes ?? []),
      max_daily_redeems_per_account: Number(row.max_daily_redeems_per_account ?? 0),
      max_daily_redeems_per_device: Number(row.max_daily_redeems_per_device ?? 0),
      session_idle_timeout_minutes: Number(row.session_idle_timeout_minutes ?? 1440),
      session_max_age_minutes: Number(row.session_max_age_minutes ?? 43200),
      event_retention_days: Number(row.event_retention_days ?? 30),
    } : defaultControlDraft(appCode));
  }, [appCode, data?.controls]);

  const packageMap = useMemo(() => new Map((data?.rewardPackages ?? []).map((item) => [item.id, item])), [data?.rewardPackages]);
  const featureOptions = data?.features ?? [];

  const filteredEntitlements = useMemo(
    () => (data?.entitlements ?? []).filter((item) => matchesSearch(accountSearch, item.account_ref, item.device_id, item.plan_code, item.status, item.revoke_reason)),
    [data?.entitlements, accountSearch],
  );
  const filteredWallets = useMemo(
    () => (data?.wallets ?? []).filter((item) => matchesSearch(accountSearch, item.account_ref, item.device_id, item.soft_balance, item.premium_balance)),
    [data?.wallets, accountSearch],
  );
  const filteredSessions = useMemo(
    () => (data?.sessions ?? []).filter((item) => matchesSearch(accountSearch, item.account_ref, item.device_id, item.status, item.client_version, item.revoke_reason)),
    [data?.sessions, accountSearch],
  );
  const filteredTransactions = useMemo(
    () => (data?.transactions ?? []).filter((item) => matchesSearch(logSearch, item.account_ref, item.device_id, item.transaction_type, item.wallet_kind, item.feature_code, item.note)),
    [data?.transactions, logSearch],
  );
  const filteredEvents = useMemo(
    () => (data?.events ?? []).filter((item) => matchesSearch(logSearch, item.account_ref, item.device_id, item.event_type, item.code, item.message, item.feature_code)),
    [data?.events, logSearch],
  );
  const filteredRedeemDraft = useMemo(
    () => redeemDraft.filter((item) => matchesSearch(redeemSearch, item.redeem_key, item.title, item.description, item.reward_mode, item.plan_code, item.blocked_reason)),
    [redeemDraft, redeemSearch],
  );

  const saveRedeemMutation = useMutation({
    mutationFn: async () => {
      const sb = supabase as any;
      const normalized = redeemDraft
        .map((row, index) => {
          const rewardMode = row.reward_mode || "mixed";
          const rewardPackageId = rewardMode === "package" ? (row.reward_package_id || null) : null;
          return {
            id: row.id,
            app_code: appCode,
            reward_package_id: rewardPackageId,
            redeem_key: row.redeem_key.trim(),
            title: row.title.trim() || row.redeem_key.trim() || `redeem_${index + 1}`,
            description: row.description.trim() || null,
            enabled: Boolean(row.enabled),
            starts_at: fromLocalDateTimeInput(row.starts_at),
            expires_at: fromLocalDateTimeInput(row.expires_at),
            max_redemptions: Math.max(1, Math.floor(Number(row.max_redemptions || 1))),
            reward_mode: rewardMode,
            plan_code: row.plan_code && row.plan_code !== "none" ? row.plan_code : null,
            soft_credit_amount: normalizeDecimal(row.soft_credit_amount),
            premium_credit_amount: normalizeDecimal(row.premium_credit_amount),
            entitlement_days: Math.max(0, Math.floor(Number(row.entitlement_days || 0))),
            device_limit_override: row.device_limit_override == null || Number(row.device_limit_override) <= 0 ? null : Math.floor(Number(row.device_limit_override)),
            account_limit_override: row.account_limit_override == null || Number(row.account_limit_override) <= 0 ? null : Math.floor(Number(row.account_limit_override)),
            blocked_at: row.blocked_reason.trim() ? new Date().toISOString() : null,
            blocked_reason: row.blocked_reason.trim() || null,
            notes: row.notes.trim() || null,
          };
        })
        .filter((row) => row.redeem_key);

      const keepIds = new Set(normalized.filter((row) => row.id).map((row) => row.id as string));
      const deleteIds = (data?.redeemKeys ?? []).map((row) => row.id).filter((id) => !keepIds.has(id as string));
      if (deleteIds.length) {
        const { error } = await sb.from("server_app_redeem_keys").delete().in("id", deleteIds);
        if (error) throw error;
      }

      for (const row of normalized.filter((item) => item.id)) {
        const { id, ...payload } = row;
        const { error } = await sb.from("server_app_redeem_keys").update(payload).eq("id", id);
        if (error) throw error;
      }

      const inserts = normalized.filter((item) => !item.id).map(({ id, ...payload }) => payload);
      if (inserts.length) {
        const { error } = await sb.from("server_app_redeem_keys").insert(inserts);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      toast({ title: "Đã lưu redeem keys", description: "Nếu key đang ở mode package thì reward lấy theo package. Các mode khác sẽ lấy credit trực tiếp từ key." });
      await refetch();
    },
    onError: (e: any) => toast({ title: "Lưu redeem thất bại", description: formatMutationError(e), variant: "destructive" }),
  });

  const saveControlsMutation = useMutation({
    mutationFn: async () => {
      const sb = supabase as any;
      const payload = {
        app_code: appCode,
        runtime_enabled: Boolean(controlDraft.runtime_enabled),
        catalog_enabled: Boolean(controlDraft.catalog_enabled),
        redeem_enabled: Boolean(controlDraft.redeem_enabled),
        consume_enabled: Boolean(controlDraft.consume_enabled),
        heartbeat_enabled: Boolean(controlDraft.heartbeat_enabled),
        maintenance_notice: controlDraft.maintenance_notice.trim() || null,
        min_client_version: controlDraft.min_client_version.trim() || null,
        blocked_client_versions: textareaToList(controlDraft.blocked_client_versions_text),
        blocked_accounts: textareaToList(controlDraft.blocked_accounts_text),
        blocked_devices: textareaToList(controlDraft.blocked_devices_text),
        blocked_ip_hashes: textareaToList(controlDraft.blocked_ip_hashes_text),
        max_daily_redeems_per_account: Math.max(0, Math.floor(Number(controlDraft.max_daily_redeems_per_account || 0))),
        max_daily_redeems_per_device: Math.max(0, Math.floor(Number(controlDraft.max_daily_redeems_per_device || 0))),
        session_idle_timeout_minutes: Math.max(0, Math.floor(Number(controlDraft.session_idle_timeout_minutes || 0))),
        session_max_age_minutes: Math.max(0, Math.floor(Number(controlDraft.session_max_age_minutes || 0))),
        event_retention_days: Math.max(1, Math.floor(Number(controlDraft.event_retention_days || 30))),
        updated_at: new Date().toISOString(),
      };
      const { error } = await sb.from("server_app_runtime_controls").upsert(payload, { onConflict: "app_code" });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast({ title: "Đã lưu runtime controls", description: "Các khóa chặn và giới hạn mới đã được cập nhật." });
      await refetch();
    },
    onError: (e: any) => toast({ title: "Lưu runtime controls thất bại", description: formatMutationError(e), variant: "destructive" }),
  });

  const revokeEntitlementMutation = useMutation({
    mutationFn: async (entitlementId: string) => {
      const sb = supabase as any;
      const { error } = await sb.from("server_app_entitlements").update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoke_reason: "Revoked from admin runtime page",
      }).eq("id", entitlementId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast({ title: "Đã revoke entitlement", description: "Người dùng sẽ mất quyền cho đến khi mở lại hoặc redeem lại." });
      await refetch();
    },
    onError: (e: any) => toast({ title: "Revoke entitlement thất bại", description: formatMutationError(e), variant: "destructive" }),
  });

  const restoreEntitlementMutation = useMutation({
    mutationFn: async (entitlementId: string) => {
      const sb = supabase as any;
      const { error } = await sb.from("server_app_entitlements").update({
        status: "active",
        revoked_at: null,
        revoke_reason: null,
        updated_at: new Date().toISOString(),
      }).eq("id", entitlementId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast({ title: "Đã mở lại entitlement", description: "Entitlement đã quay lại trạng thái active." });
      await refetch();
    },
    onError: (e: any) => toast({ title: "Mở lại entitlement thất bại", description: formatMutationError(e), variant: "destructive" }),
  });

  const revokeSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const sb = supabase as any;
      const { error } = await sb.from("server_app_sessions").update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoke_reason: "Revoked from admin runtime page",
        updated_at: new Date().toISOString(),
      }).eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast({ title: "Đã revoke session", description: "Session đã bị khóa." });
      await refetch();
    },
    onError: (e: any) => toast({ title: "Revoke session thất bại", description: formatMutationError(e), variant: "destructive" }),
  });

  const restoreSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const sb = supabase as any;
      const { error } = await sb.from("server_app_sessions").update({
        status: "active",
        revoked_at: null,
        revoke_reason: null,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast({ title: "Đã mở lại session", description: "Session đã quay lại active." });
      await refetch();
    },
    onError: (e: any) => toast({ title: "Mở lại session thất bại", description: formatMutationError(e), variant: "destructive" }),
  });

  const runSimulatorMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        action: simulatorDraft.action,
        app_code: appCode,
        client_version: simulatorDraft.client_version.trim() || null,
      };
      if (simulatorDraft.account_ref.trim()) payload.account_ref = simulatorDraft.account_ref.trim();
      if (simulatorDraft.device_id.trim()) payload.device_id = simulatorDraft.device_id.trim();
      if (simulatorDraft.redeem_key.trim()) payload.redeem_key = simulatorDraft.redeem_key.trim();
      if (simulatorDraft.feature_code.trim()) payload.feature_code = simulatorDraft.feature_code.trim();
      if (simulatorDraft.wallet_kind.trim()) payload.wallet_kind = simulatorDraft.wallet_kind.trim();
      if (simulatorDraft.session_token.trim()) payload.session_token = simulatorDraft.session_token.trim();

      setSimulatorLastPayload(formatJsonBlock(payload));
      setSimulatorStatus(`Đang gọi runtime: ${String(payload.action)}...`);
      setSimulatorResult(formatJsonBlock({ ok: false, pending: true, payload }));

      const { data, error } = await supabase.functions.invoke("server-app-runtime", { body: payload });
      if (error) {
        (error as any).context = { payload, json: data ?? null };
        throw error;
      }
      return { payload, data };
    },
    onSuccess: async ({ payload, data: result }) => {
      setSimulatorStatus(`Simulator chạy xong: ${String(payload.action)}`);
      setSimulatorResult(formatJsonBlock(result));
      const sessionToken = (result as any)?.session_token;
      if (typeof sessionToken === "string" && sessionToken.trim()) {
        setSimulatorDraft((prev) => ({ ...prev, session_token: sessionToken }));
      }
      toast({ title: "Simulator đã chạy", description: `${String(payload.action)} đã trả JSON. Kiểm tra kỹ reward, wallet hoặc session token bên dưới.` });
      await refetch();
    },
    onError: (e: any) => {
      const payload = e?.context?.payload ?? null;
      const json = e?.context?.json ?? null;
      const msg = formatMutationError(e);
      setSimulatorStatus(`Simulator lỗi: ${msg}`);
      setSimulatorResult(formatJsonBlock({ ok: false, friendly_message: msg, error_json: json, payload }));
      toast({ title: "Simulator lỗi", description: msg, variant: "destructive" });
    },
  });

  const cleanupOpsMutation = useMutation({
    mutationFn: async () => {
      const payload = { action: "cleanup", app_code: appCode };
      setOpsLastPayload(formatJsonBlock(payload));
      setOpsStatus("Đang chạy cleanup...");
      setOpsResult(formatJsonBlock({ ok: false, pending: true, payload }));
      const token = await getAdminAuthToken();
      const data = await postFunction("/server-app-runtime-ops", payload, { authToken: token });
      return { payload, data };
    },
    onSuccess: async ({ payload, data: result }) => {
      setOpsStatus(`Cleanup chạy xong: ${String(payload.action)}`);
      setOpsResult(formatJsonBlock(result));
      toast({ title: "Đã dọn runtime", description: "Session cũ và event quá hạn đã được xử lý." });
      await refetch();
    },
    onError: (e: any) => {
      const msg = formatMutationError(e);
      setOpsStatus(`Cleanup lỗi: ${msg}`);
      setOpsResult(formatJsonBlock({ ok: false, friendly_message: msg, error_json: e?.context?.json ?? null, payload: e?.context?.payload ?? null }));
      toast({ title: "Cleanup thất bại", description: msg, variant: "destructive" });
    },
  });

  const adjustWalletMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        action: "adjust_wallet",
        app_code: appCode,
        account_ref: walletAdjustDraft.account_ref.trim(),
        device_id: walletAdjustDraft.device_id.trim() || null,
        soft_delta: Number(walletAdjustDraft.soft_delta || 0),
        premium_delta: Number(walletAdjustDraft.premium_delta || 0),
        note: walletAdjustDraft.note.trim() || null,
      };
      setOpsLastPayload(formatJsonBlock(payload));
      setOpsStatus("Đang chạy adjust_wallet...");
      setOpsResult(formatJsonBlock({ ok: false, pending: true, payload }));
      const token = await getAdminAuthToken();
      const data = await postFunction("/server-app-runtime-ops", payload, { authToken: token });
      return { payload, data };
    },
    onSuccess: async ({ payload, data: result }) => {
      setOpsStatus(`Ops chạy xong: ${String(payload.action)}`);
      setOpsResult(formatJsonBlock(result));
      toast({ title: "Đã chỉnh ví", description: "Số dư runtime đã được cập nhật và transaction cũng đã được ghi." });
      await refetch();
    },
    onError: (e: any) => {
      const msg = formatMutationError(e);
      setOpsStatus(`Chỉnh ví lỗi: ${msg}`);
      setOpsResult(formatJsonBlock({ ok: false, friendly_message: msg, error_json: e?.context?.json ?? null, payload: e?.context?.payload ?? null }));
      toast({ title: "Chỉnh ví thất bại", description: msg, variant: "destructive" });
    },
  });

  const addRedeemKey = () => setRedeemDraft((prev) => [...prev, emptyRedeemKey(appCode, prev.length)]);
  const removeRedeemKey = (index: number) => setRedeemDraft((prev) => prev.filter((_, itemIndex) => itemIndex !== index));

  const setRedeemField = <K extends keyof RedeemKeyRow>(index: number, key: K, value: RedeemKeyRow[K]) => {
    setRedeemDraft((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Đang tải khu runtime app...</div>;
  }

  if (error) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle>Runtime admin chưa sẵn sàng</CardTitle>
          <CardDescription>Kiểm tra migration phase 4-7 rồi tải lại trang này.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div>{(error as Error)?.message || "Unknown error"}</div>
          <Button variant="outline" onClick={() => refetch()}>Tải lại</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <Card className="border-primary/20 shadow-[0_16px_40px_rgba(15,23,42,0.04)]">
        <CardHeader className="space-y-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant={data?.app?.public_enabled ? "secondary" : "outline"}>
                  {data?.app?.public_enabled ? "App đang bật" : "App đang ẩn"}
                </Badge>
                <Badge variant="outline">Runtime riêng</Badge>
              </div>
              <div>
                <CardTitle className="text-2xl sm:text-[2rem]">Runtime · {data?.app?.label || appCode}</CardTitle>
                <CardDescription className="mt-2 max-w-3xl text-sm leading-6">
                  Chia nhỏ từng khu xử lý để mobile gọn hơn: test nhanh, ops, chặn giới hạn, redeem, quyền, ví, session, giao dịch và sự kiện.
                </CardDescription>
              </div>
            </div>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
              Làm mới
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Card><CardContent className="p-4"><div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Redeem</div><div className="mt-1 text-xl font-semibold">{data?.redeemKeys.length ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Quyền</div><div className="mt-1 text-xl font-semibold">{data?.entitlements.length ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Ví</div><div className="mt-1 text-xl font-semibold">{data?.wallets.length ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Session</div><div className="mt-1 text-xl font-semibold">{data?.sessions.length ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Giao dịch</div><div className="mt-1 text-xl font-semibold">{data?.transactions.length ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Sự kiện</div><div className="mt-1 text-xl font-semibold">{data?.events.length ?? 0}</div></CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => {
        const next = new URLSearchParams(searchParams);
        next.set("tab", value);
        setSearchParams(next, { replace: true });
      }} className="space-y-3">
        <TabsList className="flex h-auto w-full flex-nowrap items-center justify-start gap-2 overflow-x-auto rounded-2xl border bg-background p-2">
          <TabsTrigger value="simulator" className="whitespace-nowrap">Test nhanh</TabsTrigger>
          <TabsTrigger value="ops" className="whitespace-nowrap">Ops</TabsTrigger>
          <TabsTrigger value="controls" className="whitespace-nowrap">Chặn / giới hạn</TabsTrigger>
          <TabsTrigger value="redeem" className="whitespace-nowrap">Redeem</TabsTrigger>
          <TabsTrigger value="entitlements" className="whitespace-nowrap">Quyền</TabsTrigger>
          <TabsTrigger value="wallets" className="whitespace-nowrap">Ví</TabsTrigger>
          <TabsTrigger value="sessions" className="whitespace-nowrap">Session</TabsTrigger>
          <TabsTrigger value="transactions" className="whitespace-nowrap">Giao dịch</TabsTrigger>
          <TabsTrigger value="events" className="whitespace-nowrap">Sự kiện</TabsTrigger>
        </TabsList>

        <TabsContent value="simulator">
          <Card>
            <CardHeader>
              <CardTitle>Test nhanh không cần app</CardTitle>
              <CardDescription>{getSimulatorHelp(simulatorDraft.action)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border p-4 text-sm text-muted-foreground">
                <div className="font-medium text-foreground">Flow test chuẩn</div>
                <div className="mt-2 space-y-1">
                  <div>1. `health` để kiểm tra function sống</div>
                  <div>2. `redeem` để lấy `session_token`</div>
                  <div>3. `consume` hoặc `heartbeat` bằng token đó</div>
                  <div>4. `logout` để kết thúc session</div>
                  <div className="pt-2 text-[11px]">Auto wallet hiện theo policy app: <span className="font-medium text-foreground">{data?.walletRules?.consume_priority === 'premium_first' ? 'premium trước, thường sau' : 'thường trước, premium sau'}</span>.</div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Action</div>
                  <Select value={simulatorDraft.action} onValueChange={(value) => setSimulatorDraft((prev) => ({ ...prev, action: value as SimulatorAction }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SIMULATOR_ACTIONS.map((action) => <SelectItem key={action} value={action}>{action}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Account ref</div>
                  <Input value={simulatorDraft.account_ref} onChange={(e) => setSimulatorDraft((prev) => ({ ...prev, account_ref: e.target.value }))} placeholder="user_001" />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Device id</div>
                  <Input value={simulatorDraft.device_id} onChange={(e) => setSimulatorDraft((prev) => ({ ...prev, device_id: e.target.value }))} placeholder="device_001" />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Client version</div>
                  <Input value={simulatorDraft.client_version} onChange={(e) => setSimulatorDraft((prev) => ({ ...prev, client_version: e.target.value }))} placeholder="1.0.0" />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Redeem key</div>
                  <Input value={simulatorDraft.redeem_key} onChange={(e) => setSimulatorDraft((prev) => ({ ...prev, redeem_key: e.target.value }))} placeholder="Chỉ dùng khi action = redeem" />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Feature code</div>
                  <Input value={simulatorDraft.feature_code} onChange={(e) => setSimulatorDraft((prev) => ({ ...prev, feature_code: e.target.value }))} placeholder="Ví dụ: aim_assist hoặc batch_search" list="runtime-feature-codes" />
                  <datalist id="runtime-feature-codes">
                    {featureOptions.map((feature) => <option key={feature.feature_code} value={feature.feature_code}>{feature.title}</option>)}
                  </datalist>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Wallet kind</div>
                  <Select value={simulatorDraft.wallet_kind} onValueChange={(value) => setSimulatorDraft((prev) => ({ ...prev, wallet_kind: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WALLET_KIND_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-muted-foreground">`auto` sẽ theo policy app hiện tại: {data?.walletRules?.consume_priority === 'premium_first' ? 'premium trước, thường sau' : 'thường trước, premium sau'}.</div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Session token</div>
                  <Textarea rows={3} value={simulatorDraft.session_token} onChange={(e) => setSimulatorDraft((prev) => ({ ...prev, session_token: e.target.value }))} placeholder="Sau khi redeem thành công token sẽ tự đổ vào đây" />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => runSimulatorMutation.mutate()} disabled={runSimulatorMutation.isPending}>Chạy simulator</Button>
                <Button variant="outline" onClick={() => {
                  setSimulatorDraft(defaultSimulatorForm());
                  setSimulatorResult("");
                  setSimulatorLastPayload("");
                  setSimulatorStatus("Chưa chạy simulator.");
                }}>Xóa form</Button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Trạng thái simulator</div>
                  <div className="rounded-2xl border bg-muted/40 p-3 text-sm text-muted-foreground">{simulatorStatus}</div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Payload vừa gửi</div>
                  <pre className="min-h-[88px] overflow-auto rounded-2xl border bg-muted p-4 text-[11px] leading-5 text-muted-foreground">{simulatorLastPayload || "Chưa có payload nào được gửi."}</pre>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Kết quả JSON</div>
                <pre className="min-h-[220px] overflow-auto rounded-2xl border bg-muted p-4 text-[11px] leading-5 text-muted-foreground">{simulatorResult || "Chưa có kết quả. Chạy một action để xem phản hồi runtime."}</pre>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ops">
          <div className="grid gap-3 lg:grid-cols-[1.2fr,0.8fr]">
            <Card>
              <CardHeader>
                <CardTitle>Wallet adjust thủ công</CardTitle>
                <CardDescription>Khi chưa có app thật, chỗ này giúp bạn nạp hoặc trừ credit để test server. Mỗi lần chỉnh đều ghi transaction `admin_adjust`.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Account ref</div>
                    <Input value={walletAdjustDraft.account_ref} onChange={(e) => setWalletAdjustDraft((prev) => ({ ...prev, account_ref: e.target.value }))} placeholder="user_001" />
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Device id</div>
                    <Input value={walletAdjustDraft.device_id} onChange={(e) => setWalletAdjustDraft((prev) => ({ ...prev, device_id: e.target.value }))} placeholder="device_001" />
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Soft delta</div>
                    <Input value={walletAdjustDraft.soft_delta} onChange={(e) => setWalletAdjustDraft((prev) => ({ ...prev, soft_delta: e.target.value }))} placeholder="100 hoặc -25" />
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Premium delta</div>
                    <Input value={walletAdjustDraft.premium_delta} onChange={(e) => setWalletAdjustDraft((prev) => ({ ...prev, premium_delta: e.target.value }))} placeholder="10 hoặc -3" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Ghi chú</div>
                  <Textarea rows={3} value={walletAdjustDraft.note} onChange={(e) => setWalletAdjustDraft((prev) => ({ ...prev, note: e.target.value }))} placeholder="Ví dụ: nạp credit để test consume" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => adjustWalletMutation.mutate()} disabled={adjustWalletMutation.isPending}>Cập nhật ví</Button>
                  <Button variant="outline" onClick={() => {
                    setWalletAdjustDraft(defaultWalletAdjustForm());
                    setOpsStatus("Chưa chạy ops.");
                    setOpsLastPayload("");
                    setOpsResult("");
                  }}>Reset form</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cleanup runtime</CardTitle>
                <CardDescription>Dọn session bị quá hạn theo timeout và xóa event cũ hơn số ngày giữ lại trong controls.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border p-4 text-sm text-muted-foreground">
                  Idle timeout: <span className="font-medium text-foreground">{controlDraft.session_idle_timeout_minutes} phút</span><br />
                  Max age: <span className="font-medium text-foreground">{controlDraft.session_max_age_minutes} phút</span><br />
                  Event retention: <span className="font-medium text-foreground">{controlDraft.event_retention_days} ngày</span>
                </div>
                <Button onClick={() => cleanupOpsMutation.mutate()} disabled={cleanupOpsMutation.isPending}>Chạy cleanup ngay</Button>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-3">
            <CardHeader>
              <CardTitle>Kết quả ops</CardTitle>
              <CardDescription>Log JSON của cleanup hoặc chỉnh ví thủ công.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Trạng thái ops</div>
                  <div className="rounded-2xl border bg-muted/40 p-3 text-sm text-muted-foreground">{opsStatus}</div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Payload ops vừa gửi</div>
                  <pre className="min-h-[88px] overflow-auto rounded-2xl border bg-muted p-4 text-[11px] leading-5 text-muted-foreground">{opsLastPayload || "Chưa có payload ops nào được gửi."}</pre>
                </div>
              </div>
              <pre className="min-h-[220px] overflow-auto rounded-2xl border bg-muted p-4 text-[11px] leading-5 text-muted-foreground">{opsResult || "Chưa có thao tác ops nào được chạy."}</pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="controls">
          <Card>
            <CardHeader>
              <CardTitle>Chặn, giới hạn và hardening</CardTitle>
              <CardDescription>Kill switch, chặn version cũ, chặn account hoặc device và giới hạn số lần redeem trong ngày.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-5">
                <div className="rounded-2xl border p-4"><div className="mb-2 text-sm font-medium">Runtime enabled</div><Switch checked={controlDraft.runtime_enabled} onCheckedChange={(value) => setControlDraft((prev) => ({ ...prev, runtime_enabled: value }))} /></div>
                <div className="rounded-2xl border p-4"><div className="mb-2 text-sm font-medium">Catalog / me</div><Switch checked={controlDraft.catalog_enabled} onCheckedChange={(value) => setControlDraft((prev) => ({ ...prev, catalog_enabled: value }))} /></div>
                <div className="rounded-2xl border p-4"><div className="mb-2 text-sm font-medium">Redeem</div><Switch checked={controlDraft.redeem_enabled} onCheckedChange={(value) => setControlDraft((prev) => ({ ...prev, redeem_enabled: value }))} /></div>
                <div className="rounded-2xl border p-4"><div className="mb-2 text-sm font-medium">Consume</div><Switch checked={controlDraft.consume_enabled} onCheckedChange={(value) => setControlDraft((prev) => ({ ...prev, consume_enabled: value }))} /></div>
                <div className="rounded-2xl border p-4"><div className="mb-2 text-sm font-medium">Heartbeat</div><Switch checked={controlDraft.heartbeat_enabled} onCheckedChange={(value) => setControlDraft((prev) => ({ ...prev, heartbeat_enabled: value }))} /></div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Min client version</div>
                  <Input value={controlDraft.min_client_version} onChange={(e) => setControlDraft((prev) => ({ ...prev, min_client_version: e.target.value }))} placeholder="Ví dụ: 1.0.5" />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Thông báo bảo trì / khóa app</div>
                  <Input value={controlDraft.maintenance_notice} onChange={(e) => setControlDraft((prev) => ({ ...prev, maintenance_notice: e.target.value }))} placeholder="Ví dụ: Đang bảo trì runtime 15 phút" />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Redeem tối đa mỗi account / ngày</div>
                  <Input type="number" min={0} value={controlDraft.max_daily_redeems_per_account} onChange={(e) => setControlDraft((prev) => ({ ...prev, max_daily_redeems_per_account: Number(e.target.value) || 0 }))} />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Redeem tối đa mỗi device / ngày</div>
                  <Input type="number" min={0} value={controlDraft.max_daily_redeems_per_device} onChange={(e) => setControlDraft((prev) => ({ ...prev, max_daily_redeems_per_device: Number(e.target.value) || 0 }))} />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2"><div className="text-sm font-medium">Session idle timeout (phút)</div><Input type="number" min={0} value={controlDraft.session_idle_timeout_minutes} onChange={(e) => setControlDraft((prev) => ({ ...prev, session_idle_timeout_minutes: Number(e.target.value) || 0 }))} /></div>
                <div className="space-y-2"><div className="text-sm font-medium">Session max age (phút)</div><Input type="number" min={0} value={controlDraft.session_max_age_minutes} onChange={(e) => setControlDraft((prev) => ({ ...prev, session_max_age_minutes: Number(e.target.value) || 0 }))} /></div>
                <div className="space-y-2"><div className="text-sm font-medium">Giữ event tối đa (ngày)</div><Input type="number" min={1} value={controlDraft.event_retention_days} onChange={(e) => setControlDraft((prev) => ({ ...prev, event_retention_days: Number(e.target.value) || 30 }))} /></div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2"><div className="text-sm font-medium">Blocked client versions</div><Textarea rows={5} value={controlDraft.blocked_client_versions_text} onChange={(e) => setControlDraft((prev) => ({ ...prev, blocked_client_versions_text: e.target.value }))} /></div>
                <div className="space-y-2"><div className="text-sm font-medium">Blocked accounts</div><Textarea rows={5} value={controlDraft.blocked_accounts_text} onChange={(e) => setControlDraft((prev) => ({ ...prev, blocked_accounts_text: e.target.value }))} /></div>
                <div className="space-y-2"><div className="text-sm font-medium">Blocked devices</div><Textarea rows={5} value={controlDraft.blocked_devices_text} onChange={(e) => setControlDraft((prev) => ({ ...prev, blocked_devices_text: e.target.value }))} /></div>
                <div className="space-y-2"><div className="text-sm font-medium">Blocked IP hashes</div><Textarea rows={5} value={controlDraft.blocked_ip_hashes_text} onChange={(e) => setControlDraft((prev) => ({ ...prev, blocked_ip_hashes_text: e.target.value }))} /></div>
              </div>

              <div className="flex justify-end"><Button onClick={() => saveControlsMutation.mutate()} disabled={saveControlsMutation.isPending}>Lưu runtime controls</Button></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="redeem">
          <Card>
            <CardHeader>
              <CardTitle>Redeem keys thật</CardTitle>
              <CardDescription>Mode `package` sẽ lấy reward từ package. Các mode còn lại sẽ lấy trực tiếp plan hoặc credit bạn gõ trên key.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">Tìm redeem key</div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-9" value={redeemSearch} onChange={(e) => setRedeemSearch(e.target.value)} placeholder="Ví dụ: REDEEM_1 hoặc plus_30d" />
                </div>
                <div className="text-xs text-muted-foreground">Chỉ lọc danh sách redeem key của tab này.</div>
              </div>
              {filteredRedeemDraft.length === 0 ? <div className="text-sm text-muted-foreground">Không có redeem key nào khớp ô tìm redeem key.</div> : null}
              {filteredRedeemDraft.map((item) => {
                const index = redeemDraft.findIndex((row) => row === item || row.id === item.id);
                const rewardSource = summarizeRewardSource(item, packageMap);
                return (
                  <div key={`${item.id || "new"}-${index}`} className="space-y-3 rounded-2xl border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="grid flex-1 gap-3 md:grid-cols-3">
                        <Input value={item.redeem_key} onChange={(e) => setRedeemField(index, "redeem_key", e.target.value)} placeholder="redeem_key" />
                        <Input value={item.title} onChange={(e) => setRedeemField(index, "title", e.target.value)} placeholder="Tên hiển thị" />
                        <Select
                          value={item.reward_package_id || "none"}
                          onValueChange={(value) => {
                            setRedeemDraft((prev) => prev.map((row, rowIndex) => rowIndex === index ? {
                              ...row,
                              reward_package_id: value === "none" ? null : value,
                              reward_mode: value === "none" ? row.reward_mode : "package",
                            } : row));
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Reward package" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Không gắn package</SelectItem>
                            {(data?.rewardPackages ?? []).map((pkg) => (
                              <SelectItem key={pkg.id} value={pkg.id}>{pkg.package_code} · {pkg.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Đã dùng {item.redeemed_count}</Badge>
                        <span className="text-xs text-muted-foreground">Bật</span>
                        <Switch checked={item.enabled} onCheckedChange={(value) => setRedeemField(index, "enabled", value)} />
                        <Button variant="outline" size="sm" className="text-destructive" onClick={() => removeRedeemKey(index)}>
                          <Trash2 className="h-4 w-4" />
                          Xóa
                        </Button>
                      </div>
                    </div>

                    <div className={`rounded-2xl border p-3 text-sm ${rewardSource.variant === "package" ? "bg-amber-50" : "bg-muted/40"}`}>
                      <div className="font-medium">{rewardSource.title}</div>
                      <div className="mt-1 text-muted-foreground">{rewardSource.description}</div>
                    </div>

                    <Textarea rows={2} value={item.description} onChange={(e) => setRedeemField(index, "description", e.target.value)} placeholder="Mô tả ngắn cho redeem key" />

                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Reward mode</div>
                        <Select value={item.reward_mode} onValueChange={(value) => {
                          setRedeemDraft((prev) => prev.map((row, rowIndex) => rowIndex === index ? {
                            ...row,
                            reward_mode: value,
                            reward_package_id: value === "package" ? row.reward_package_id : null,
                          } : row));
                        }}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {REWARD_MODE_OPTIONS.map((mode) => <SelectItem key={mode} value={mode}>{mode}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Plan mở ra</div>
                        <Select value={item.plan_code || "none"} onValueChange={(value) => setRedeemField(index, "plan_code", value === "none" ? null : value)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Không gắn plan</SelectItem>
                            {PLAN_OPTIONS.map((plan) => <SelectItem key={plan} value={plan}>{plan}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2"><div className="text-sm font-medium">Bắt đầu</div><Input type="datetime-local" value={toLocalDateTimeInput(item.starts_at)} onChange={(e) => setRedeemField(index, "starts_at", e.target.value)} /></div>
                      <div className="space-y-2"><div className="text-sm font-medium">Hết hạn</div><Input type="datetime-local" value={toLocalDateTimeInput(item.expires_at)} onChange={(e) => setRedeemField(index, "expires_at", e.target.value)} /></div>
                      <div className="space-y-2"><div className="text-sm font-medium">Số lượt dùng tối đa</div><Input type="number" min={1} value={item.max_redemptions} onChange={(e) => setRedeemField(index, "max_redemptions", Number(e.target.value))} /></div>
                      <div className="space-y-2"><div className="text-sm font-medium">Credit thường</div><Input value={numericInput(item.soft_credit_amount)} onChange={(e) => setRedeemField(index, "soft_credit_amount", e.target.value)} /></div>
                      <div className="space-y-2"><div className="text-sm font-medium">Credit kim cương</div><Input value={numericInput(item.premium_credit_amount)} onChange={(e) => setRedeemField(index, "premium_credit_amount", e.target.value)} /></div>
                      <div className="space-y-2"><div className="text-sm font-medium">Ngày entitlement</div><Input type="number" min={0} value={item.entitlement_days} onChange={(e) => setRedeemField(index, "entitlement_days", Number(e.target.value))} /></div>
                      <div className="space-y-2"><div className="text-sm font-medium">Override thiết bị</div><Input type="number" min={0} value={item.device_limit_override ?? 0} onChange={(e) => setRedeemField(index, "device_limit_override", Number(e.target.value) || null)} /></div>
                      <div className="space-y-2"><div className="text-sm font-medium">Override tài khoản</div><Input type="number" min={0} value={item.account_limit_override ?? 0} onChange={(e) => setRedeemField(index, "account_limit_override", Number(e.target.value) || null)} /></div>
                      <div className="space-y-2 md:col-span-2"><div className="text-sm font-medium">Lý do chặn</div><Input value={item.blocked_reason} onChange={(e) => setRedeemField(index, "blocked_reason", e.target.value)} placeholder="Để trống nếu không chặn key này" /></div>
                      <div className="space-y-2 md:col-span-2"><div className="text-sm font-medium">Ghi chú</div><Input value={item.notes} onChange={(e) => setRedeemField(index, "notes", e.target.value)} placeholder="Ví dụ: key quà tặng Plus 30 ngày, credit test tháng này" /></div>
                    </div>
                  </div>
                );
              })}

              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="outline" onClick={addRedeemKey}>Thêm redeem key</Button>
                <Button onClick={() => saveRedeemMutation.mutate()} disabled={saveRedeemMutation.isPending}>Lưu redeem keys</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="entitlements">
          <Card>
            <CardHeader>
              <CardTitle>Quyền gần đây</CardTitle>
              <CardDescription>Từ phase 8 đã có cả revoke lẫn mở lại.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="text-sm font-medium">Tìm tài khoản / thiết bị</div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-9" value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} placeholder="Ví dụ: user_001 hoặc device_001" />
                </div>
                <div className="text-xs text-muted-foreground">Áp dụng cho quyền theo account, plan hoặc thiết bị.</div>
              </div>
              {filteredEntitlements.length === 0 ? <div className="text-sm text-muted-foreground">Không có quyền nào khớp bộ lọc.</div> : null}
              {filteredEntitlements.map((item) => (
                <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border p-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{item.plan_code}</Badge>
                      <Badge variant={item.status === "active" ? "secondary" : "outline"}>{item.status}</Badge>
                      <span className="text-sm font-medium">{item.account_ref}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">Device: {item.device_id || "-"}</div>
                    <div className="text-xs text-muted-foreground">Bắt đầu: {formatTime(item.starts_at)} · Hết hạn: {formatTime(item.expires_at)}</div>
                    {item.revoked_at ? <div className="text-xs text-destructive">Đã revoke lúc {formatTime(item.revoked_at)} · {item.revoke_reason || "Không có ghi chú"}</div> : null}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="text-destructive" disabled={item.status !== "active" || revokeEntitlementMutation.isPending} onClick={() => revokeEntitlementMutation.mutate(item.id)}>Revoke</Button>
                    <Button variant="outline" size="sm" disabled={item.status === "active" || restoreEntitlementMutation.isPending} onClick={() => restoreEntitlementMutation.mutate(item.id)}>
                      <RotateCcw className="mr-2 h-4 w-4" />Mở lại
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wallets">
          <Card>
            <CardHeader>
              <CardTitle>Ví gần đây</CardTitle>
              <CardDescription>Danh sách ví lọc theo ô tìm tài khoản / thiết bị.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="text-sm font-medium">Tìm tài khoản / thiết bị</div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-9" value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} placeholder="Ví dụ: user_001 hoặc device_001" />
                </div>
                <div className="text-xs text-muted-foreground">Áp dụng cho ví thường và premium của tab này.</div>
              </div>
              {filteredWallets.length === 0 ? <div className="text-sm text-muted-foreground">Không có ví nào khớp bộ lọc.</div> : null}
              {filteredWallets.map((item) => (
                <div key={item.id} className="rounded-2xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{item.account_ref}</div>
                      <div className="text-xs text-muted-foreground">Device: {item.device_id || "-"}</div>
                    </div>
                    <div className="grid gap-2 text-right text-sm">
                      <div>Credit thường: <span className="font-semibold">{item.soft_balance}</span></div>
                      <div>Credit kim cương: <span className="font-semibold">{item.premium_balance}</span></div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">Reset thường: {formatTime(item.last_soft_reset_at)} · Reset kim cương: {formatTime(item.last_premium_reset_at)} · Cập nhật: {formatTime(item.updated_at)}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions">
          <Card>
            <CardHeader>
              <CardTitle>Session gần đây</CardTitle>
              <CardDescription>Có thể khóa hoặc mở lại session đã revoke.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="text-sm font-medium">Tìm tài khoản / thiết bị</div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-9" value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} placeholder="Ví dụ: user_001 hoặc device_001" />
                </div>
                <div className="text-xs text-muted-foreground">Áp dụng cho session, phiên bản client và trạng thái.</div>
              </div>
              {filteredSessions.length === 0 ? <div className="text-sm text-muted-foreground">Không có session nào khớp bộ lọc.</div> : null}
              {filteredSessions.map((item) => (
                <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border p-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={item.status === "active" ? "secondary" : "outline"}>{item.status}</Badge>
                      <span className="font-medium">{item.account_ref}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">Device: {item.device_id}</div>
                    <div className="text-xs text-muted-foreground">Client: {item.client_version || "-"}</div>
                    <div className="text-xs text-muted-foreground">Bắt đầu: {formatTime(item.started_at)} · Last seen: {formatTime(item.last_seen_at)} · Hết hạn: {formatTime(item.expires_at)}</div>
                    {item.revoked_at ? <div className="text-xs text-destructive">Đã revoke lúc {formatTime(item.revoked_at)} · {item.revoke_reason || "Không có ghi chú"}</div> : null}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="text-destructive" disabled={item.status !== "active" || revokeSessionMutation.isPending} onClick={() => revokeSessionMutation.mutate(item.id)}>Revoke session</Button>
                    <Button variant="outline" size="sm" disabled={item.status === "active" || restoreSessionMutation.isPending} onClick={() => restoreSessionMutation.mutate(item.id)}>
                      <RotateCcw className="mr-2 h-4 w-4" />Mở lại
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle>Giao dịch gần đây</CardTitle>
              <CardDescription>Nếu redeem có cộng credit, transaction type sẽ là `redeem` và hiện rõ delta.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="text-sm font-medium">Tìm log / lỗi / giao dịch</div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-9" value={logSearch} onChange={(e) => setLogSearch(e.target.value)} placeholder="Ví dụ: redeem, FAIL, SESSION, feature_code" />
                </div>
                <div className="text-xs text-muted-foreground">Chỉ lọc giao dịch của tab này.</div>
              </div>
              {filteredTransactions.length === 0 ? <div className="text-sm text-muted-foreground">Không có giao dịch nào khớp ô tìm kiếm.</div> : null}
              {filteredTransactions.map((item) => (
                <div key={item.id} className="rounded-2xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{item.transaction_type}</Badge>
                        <Badge variant="outline">{item.wallet_kind}</Badge>
                        <span className="font-medium">{item.account_ref}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">Device: {item.device_id || "-"} · Feature: {item.feature_code || "-"}</div>
                    </div>
                    <div className="text-right text-sm">
                      <div>Δ thường: <span className="font-semibold">{item.soft_delta}</span></div>
                      <div>Δ kim cương: <span className="font-semibold">{item.premium_delta}</span></div>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">Sau giao dịch: thường {item.soft_balance_after ?? "-"} · kim cương {item.premium_balance_after ?? "-"} · {formatTime(item.created_at)}</div>
                  {item.note ? <div className="mt-2 text-xs text-muted-foreground">Ghi chú: {item.note}</div> : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events">
          <Card>
            <CardHeader>
              <CardTitle>Sự kiện runtime gần đây</CardTitle>
              <CardDescription>Đây là chỗ đọc lỗi thật. Từ phase 8, khi FAIL nó sẽ hiện code rõ hơn và lọc được theo search.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="text-sm font-medium">Tìm log / lỗi / sự kiện</div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-9" value={logSearch} onChange={(e) => setLogSearch(e.target.value)} placeholder="Ví dụ: redeem, FAIL, SESSION, feature_code" />
                </div>
                <div className="text-xs text-muted-foreground">Chỉ lọc sự kiện của tab này.</div>
              </div>
              {filteredEvents.length === 0 ? <div className="text-sm text-muted-foreground">Không có sự kiện nào khớp ô tìm kiếm.</div> : null}
              {filteredEvents.map((item) => (
                <div key={item.id} className="rounded-2xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={item.ok ? "secondary" : "destructive"}>{item.ok ? "OK" : "FAIL"}</Badge>
                        <Badge variant="outline">{item.event_type}</Badge>
                        {item.code ? <Badge variant="outline">{item.code}</Badge> : null}
                      </div>
                      <div className="text-sm font-medium">{item.account_ref || "guest"}</div>
                      <div className="text-xs text-muted-foreground">Device: {item.device_id || "-"} · Feature: {item.feature_code || "-"} · Wallet: {item.wallet_kind || "-"}</div>
                      <div className="text-xs text-muted-foreground">Client: {item.client_version || "-"} · IP hash: {item.ip_hash || "-"}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">{formatTime(item.created_at)}</div>
                  </div>
                  {(item.message || item.code) ? <div className="mt-3 text-sm text-muted-foreground">{FRIENDLY_ERROR_MAP[item.code || ""] ?? item.message ?? item.code}</div> : null}
                  {item.meta ? <pre className="mt-3 overflow-auto rounded-xl bg-muted p-3 text-[11px] leading-5 text-muted-foreground">{JSON.stringify(item.meta, null, 2)}</pre> : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  );
}
