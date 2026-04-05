import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Trash2, RefreshCw } from "lucide-react";

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

const PLAN_OPTIONS = ["classic", "go", "plus", "pro"] as const;
const REWARD_MODE_OPTIONS = ["package", "plan", "soft_credit", "premium_credit", "mixed"] as const;

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

type RewardPackageOption = {
  id: string;
  package_code: string;
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

type SimulatorForm = {
  action: "catalog" | "me" | "redeem" | "consume" | "heartbeat" | "logout";
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
    reward_mode: "package",
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
    action: "catalog",
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

export function AdminServerAppRuntimePage() {
  const { appCode = "" } = useParams();
  const { toast } = useToast();

  const runtimeQuery = useQuery({
    queryKey: ["admin-server-app-runtime", appCode],
    enabled: Boolean(appCode),
    queryFn: async () => {
      const sb = supabase as any;
      const [appRes, packageRes, redeemRes, entitlementRes, walletRes, sessionRes, txRes, controlsRes, eventsRes] = await Promise.all([
        sb.from("server_apps").select("code,label,description,public_enabled").eq("code", appCode).maybeSingle(),
        sb.from("server_app_reward_packages").select("id,package_code,title,enabled").eq("app_code", appCode).order("sort_order", { ascending: true }),
        sb.from("server_app_redeem_keys").select("id,app_code,reward_package_id,redeem_key,title,description,enabled,starts_at,expires_at,max_redemptions,redeemed_count,reward_mode,plan_code,soft_credit_amount,premium_credit_amount,entitlement_days,device_limit_override,account_limit_override,blocked_at,blocked_reason,notes").eq("app_code", appCode).order("created_at", { ascending: false }),
        sb.from("server_app_entitlements").select("id,account_ref,device_id,plan_code,status,starts_at,expires_at,revoked_at,revoke_reason,created_at").eq("app_code", appCode).order("created_at", { ascending: false }).limit(50),
        sb.from("server_app_wallet_balances").select("id,account_ref,device_id,soft_balance,premium_balance,last_soft_reset_at,last_premium_reset_at,updated_at").eq("app_code", appCode).order("updated_at", { ascending: false }).limit(50),
        sb.from("server_app_sessions").select("id,account_ref,device_id,status,started_at,last_seen_at,expires_at,revoked_at,revoke_reason,client_version").eq("app_code", appCode).order("last_seen_at", { ascending: false }).limit(50),
        sb.from("server_app_wallet_transactions").select("id,account_ref,device_id,feature_code,transaction_type,wallet_kind,soft_delta,premium_delta,soft_balance_after,premium_balance_after,note,created_at").eq("app_code", appCode).order("created_at", { ascending: false }).limit(100),
        sb.from("server_app_runtime_controls").select("app_code,runtime_enabled,catalog_enabled,redeem_enabled,consume_enabled,heartbeat_enabled,maintenance_notice,min_client_version,blocked_client_versions,blocked_accounts,blocked_devices,blocked_ip_hashes,max_daily_redeems_per_account,max_daily_redeems_per_device,session_idle_timeout_minutes,session_max_age_minutes,event_retention_days").eq("app_code", appCode).maybeSingle(),
        sb.from("server_app_runtime_events").select("id,event_type,ok,code,message,account_ref,device_id,feature_code,wallet_kind,ip_hash,client_version,meta,created_at").eq("app_code", appCode).order("created_at", { ascending: false }).limit(100),
      ]);

      const firstError = [appRes, packageRes, redeemRes, entitlementRes, walletRes, sessionRes, txRes, controlsRes, eventsRes].find((item) => item.error)?.error;
      if (firstError) throw firstError;

      return {
        app: appRes.data,
        rewardPackages: (packageRes.data ?? []) as RewardPackageOption[],
        redeemKeys: (redeemRes.data ?? []) as RedeemKeyRow[],
        entitlements: (entitlementRes.data ?? []) as EntitlementRow[],
        wallets: (walletRes.data ?? []) as WalletRow[],
        sessions: (sessionRes.data ?? []) as SessionRow[],
        transactions: (txRes.data ?? []) as TransactionRow[],
        controls: (controlsRes.data ?? null) as ControlRow | null,
        events: (eventsRes.data ?? []) as EventRow[],
      };
    },
  });

  const { data, isLoading, error, refetch } = runtimeQuery;
  const [redeemDraft, setRedeemDraft] = useState<RedeemKeyRow[]>([]);
  const [controlDraft, setControlDraft] = useState<ControlDraft>(defaultControlDraft(appCode));
  const [simulatorDraft, setSimulatorDraft] = useState<SimulatorForm>(defaultSimulatorForm());
  const [simulatorResult, setSimulatorResult] = useState<string>("");
  const [opsResult, setOpsResult] = useState<string>("");
  const [walletAdjustDraft, setWalletAdjustDraft] = useState<WalletAdjustForm>(defaultWalletAdjustForm());

  useEffect(() => {
    setRedeemDraft((data?.redeemKeys ?? []).map((row) => ({
      ...row,
      title: row.title ?? "",
      description: row.description ?? "",
      blocked_reason: row.blocked_reason ?? "",
      notes: row.notes ?? "",
    })));
  }, [data]);

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


  const packageMap = useMemo(() => {
    return new Map((data?.rewardPackages ?? []).map((item) => [item.id, item]));
  }, [data]);

  const saveRedeemMutation = useMutation({
    mutationFn: async () => {
      const sb = supabase as any;
      const normalized = redeemDraft
        .map((row, index) => ({
          id: row.id,
          app_code: appCode,
          reward_package_id: row.reward_package_id || null,
          redeem_key: row.redeem_key.trim(),
          title: row.title.trim() || row.redeem_key.trim() || `redeem_${index + 1}`,
          description: row.description.trim() || null,
          enabled: Boolean(row.enabled),
          starts_at: fromLocalDateTimeInput(row.starts_at),
          expires_at: fromLocalDateTimeInput(row.expires_at),
          max_redemptions: Math.max(1, Math.floor(Number(row.max_redemptions || 1))),
          reward_mode: row.reward_mode || "package",
          plan_code: row.plan_code && row.plan_code !== "none" ? row.plan_code : null,
          soft_credit_amount: normalizeDecimal(row.soft_credit_amount),
          premium_credit_amount: normalizeDecimal(row.premium_credit_amount),
          entitlement_days: Math.max(0, Math.floor(Number(row.entitlement_days || 0))),
          device_limit_override: row.device_limit_override == null || Number(row.device_limit_override) <= 0 ? null : Math.floor(Number(row.device_limit_override)),
          account_limit_override: row.account_limit_override == null || Number(row.account_limit_override) <= 0 ? null : Math.floor(Number(row.account_limit_override)),
          blocked_at: row.blocked_reason.trim() ? new Date().toISOString() : null,
          blocked_reason: row.blocked_reason.trim() || null,
          notes: row.notes.trim() || null,
        }))
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
      toast({ title: "Đã lưu", description: "Redeem keys đã được cập nhật." });
      await refetch();
    },
    onError: (e: any) => toast({ title: "Lưu redeem thất bại", description: e?.message ?? "Không thể lưu redeem keys.", variant: "destructive" }),
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
      toast({ title: "Đã lưu", description: "Runtime controls đã được cập nhật." });
      await refetch();
    },
    onError: (e: any) => toast({ title: "Lưu runtime controls thất bại", description: e?.message ?? "Không thể lưu controls.", variant: "destructive" }),
  });

  const revokeEntitlementMutation = useMutation({
    mutationFn: async (entitlementId: string) => {
      const sb = supabase as any;
      const { error } = await sb
        .from("server_app_entitlements")
        .update({
          status: "revoked",
          revoked_at: new Date().toISOString(),
          revoke_reason: "Revoked from admin runtime page",
        })
        .eq("id", entitlementId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast({ title: "Đã revoke", description: "Entitlement đã bị thu hồi." });
      await refetch();
    },
    onError: (e: any) => toast({ title: "Revoke entitlement thất bại", description: e?.message ?? "Không thể revoke entitlement.", variant: "destructive" }),
  });

  const revokeSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const sb = supabase as any;
      const { error } = await sb
        .from("server_app_sessions")
        .update({
          status: "revoked",
          revoked_at: new Date().toISOString(),
          revoke_reason: "Revoked from admin runtime page",
        })
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast({ title: "Đã revoke", description: "Session đã bị khóa." });
      await refetch();
    },
    onError: (e: any) => toast({ title: "Revoke session thất bại", description: e?.message ?? "Không thể revoke session.", variant: "destructive" }),
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

      const { data, error } = await supabase.functions.invoke("server-app-runtime", { body: payload });
      if (error) throw error;
      return data;
    },
    onSuccess: async (result) => {
      setSimulatorResult(formatJsonBlock(result));
      const sessionToken = (result as any)?.session_token;
      if (typeof sessionToken === "string" && sessionToken.trim()) {
        setSimulatorDraft((prev) => ({ ...prev, session_token: sessionToken }));
      }
      toast({ title: "Đã chạy simulator", description: "Runtime đã trả kết quả. Kiểm tra JSON bên dưới." });
      await refetch();
    },
    onError: (e: any) => {
      const payload = { ok: false, message: e?.message ?? "Simulator call failed" };
      setSimulatorResult(formatJsonBlock(payload));
      toast({ title: "Simulator lỗi", description: e?.message ?? "Không thể gọi runtime function.", variant: "destructive" });
    },
  });

  const cleanupOpsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("server-app-runtime-ops", {
        body: {
          action: "cleanup",
          app_code: appCode,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (result) => {
      setOpsResult(formatJsonBlock(result));
      toast({ title: "Đã dọn runtime", description: "Session cũ và event quá hạn đã được xử lý." });
      await refetch();
    },
    onError: (e: any) => {
      setOpsResult(formatJsonBlock({ ok: false, message: e?.message ?? "Cleanup failed" }));
      toast({ title: "Cleanup thất bại", description: e?.message ?? "Không thể dọn runtime.", variant: "destructive" });
    },
  });

  const adjustWalletMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("server-app-runtime-ops", {
        body: {
          action: "adjust_wallet",
          app_code: appCode,
          account_ref: walletAdjustDraft.account_ref.trim(),
          device_id: walletAdjustDraft.device_id.trim() || null,
          soft_delta: Number(walletAdjustDraft.soft_delta || 0),
          premium_delta: Number(walletAdjustDraft.premium_delta || 0),
          note: walletAdjustDraft.note.trim() || null,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (result) => {
      setOpsResult(formatJsonBlock(result));
      toast({ title: "Đã chỉnh ví", description: "Số dư runtime đã được cập nhật và ghi log." });
      await refetch();
    },
    onError: (e: any) => {
      setOpsResult(formatJsonBlock({ ok: false, message: e?.message ?? "Wallet adjust failed" }));
      toast({ title: "Chỉnh ví thất bại", description: e?.message ?? "Không thể cập nhật số dư ví.", variant: "destructive" });
    },
  });

  const addRedeemKey = () => {
    setRedeemDraft((prev) => [...prev, emptyRedeemKey(appCode, prev.length)]);
  };

  const removeRedeemKey = (index: number) => {
    setRedeemDraft((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Đang tải runtime admin...</div>;
  }

  if (error) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle>Runtime admin chưa sẵn sàng</CardTitle>
          <CardDescription>
            Có vẻ phase 4 core chưa được apply đủ hoặc DB đang trả về lỗi. Kiểm tra migration phase 4 rồi reload lại trang này.
          </CardDescription>
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Button asChild variant="outline" size="sm">
            <Link to={`/admin/apps/${appCode}`}>← Quay lại cấu hình app</Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">Runtime admin · {data?.app?.label || appCode}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Đây là tầng vận hành phase 5 để quản lý redeem keys thật, entitlement, wallet, session và log runtime cho từng app.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={data?.app?.public_enabled ? "secondary" : "outline"}>
            {data?.app?.public_enabled ? "Đang bật" : "Đang ẩn"}
          </Badge>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
            Làm mới
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-6">
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Redeem keys</div><div className="mt-1 text-2xl font-semibold">{data?.redeemKeys.length ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Entitlements</div><div className="mt-1 text-2xl font-semibold">{data?.entitlements.length ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Wallets</div><div className="mt-1 text-2xl font-semibold">{data?.wallets.length ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Sessions</div><div className="mt-1 text-2xl font-semibold">{data?.sessions.length ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Transactions</div><div className="mt-1 text-2xl font-semibold">{data?.transactions.length ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Events</div><div className="mt-1 text-2xl font-semibold">{data?.events.length ?? 0}</div></CardContent></Card>
      </div>

      <Tabs defaultValue="controls" className="space-y-3">
        <TabsList className="flex w-full flex-wrap justify-start gap-2">
          <TabsTrigger value="controls">Controls</TabsTrigger>
          <TabsTrigger value="simulator">Simulator</TabsTrigger>
          <TabsTrigger value="ops">Ops</TabsTrigger>
          <TabsTrigger value="redeem">Redeem keys</TabsTrigger>
          <TabsTrigger value="entitlements">Entitlements</TabsTrigger>
          <TabsTrigger value="wallets">Wallets</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
        </TabsList>

        <TabsContent value="controls">
          <Card>
            <CardHeader>
              <CardTitle>Runtime controls / hardening</CardTitle>
              <CardDescription>
                Kill switch, chặn version cũ, chặn account hoặc device, và giới hạn số lần redeem trong ngày. Chỗ này là buồng lái tím điện của phase 6.
              </CardDescription>
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
                <div className="space-y-2">
                  <div className="text-sm font-medium">Session idle timeout (phút)</div>
                  <Input type="number" min={0} value={controlDraft.session_idle_timeout_minutes} onChange={(e) => setControlDraft((prev) => ({ ...prev, session_idle_timeout_minutes: Number(e.target.value) || 0 }))} />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Session max age (phút)</div>
                  <Input type="number" min={0} value={controlDraft.session_max_age_minutes} onChange={(e) => setControlDraft((prev) => ({ ...prev, session_max_age_minutes: Number(e.target.value) || 0 }))} />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Giữ event tối đa (ngày)</div>
                  <Input type="number" min={1} value={controlDraft.event_retention_days} onChange={(e) => setControlDraft((prev) => ({ ...prev, event_retention_days: Number(e.target.value) || 30 }))} />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Blocked client versions</div>
                  <Textarea rows={5} value={controlDraft.blocked_client_versions_text} onChange={(e) => setControlDraft((prev) => ({ ...prev, blocked_client_versions_text: e.target.value }))} placeholder={"Mỗi dòng 1 version\n1.0.1\n1.0.2"} />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Blocked accounts</div>
                  <Textarea rows={5} value={controlDraft.blocked_accounts_text} onChange={(e) => setControlDraft((prev) => ({ ...prev, blocked_accounts_text: e.target.value }))} placeholder={"Mỗi dòng 1 account_ref"} />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Blocked devices</div>
                  <Textarea rows={5} value={controlDraft.blocked_devices_text} onChange={(e) => setControlDraft((prev) => ({ ...prev, blocked_devices_text: e.target.value }))} placeholder={"Mỗi dòng 1 device_id"} />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Blocked IP hashes</div>
                  <Textarea rows={5} value={controlDraft.blocked_ip_hashes_text} onChange={(e) => setControlDraft((prev) => ({ ...prev, blocked_ip_hashes_text: e.target.value }))} placeholder={"Mỗi dòng 1 ip hash SHA-256"} />
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={() => saveControlsMutation.mutate()} disabled={saveControlsMutation.isPending}>Lưu runtime controls</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="simulator">
          <Card>
            <CardHeader>
              <CardTitle>Runtime simulator không cần app</CardTitle>
              <CardDescription>
                Phase 7 thêm buồng thử runtime ngay trong admin. Bạn có thể giả lập `catalog`, `redeem`, `consume`, `heartbeat`, `logout` mà chưa cần APK thật.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Action</div>
                  <Select value={simulatorDraft.action} onValueChange={(value) => setSimulatorDraft((prev) => ({ ...prev, action: value as SimulatorForm["action"] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="catalog">catalog</SelectItem>
                      <SelectItem value="me">me</SelectItem>
                      <SelectItem value="redeem">redeem</SelectItem>
                      <SelectItem value="consume">consume</SelectItem>
                      <SelectItem value="heartbeat">heartbeat</SelectItem>
                      <SelectItem value="logout">logout</SelectItem>
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
                  <Input value={simulatorDraft.feature_code} onChange={(e) => setSimulatorDraft((prev) => ({ ...prev, feature_code: e.target.value }))} placeholder="Chỉ dùng khi action = consume" />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Wallet kind</div>
                  <Select value={simulatorDraft.wallet_kind} onValueChange={(value) => setSimulatorDraft((prev) => ({ ...prev, wallet_kind: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">auto</SelectItem>
                      <SelectItem value="soft">soft</SelectItem>
                      <SelectItem value="premium">premium</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Session token</div>
                  <Textarea rows={3} value={simulatorDraft.session_token} onChange={(e) => setSimulatorDraft((prev) => ({ ...prev, session_token: e.target.value }))} placeholder="Sau khi redeem thành công token sẽ tự đổ vào đây" />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => runSimulatorMutation.mutate()} disabled={runSimulatorMutation.isPending}>Chạy simulator</Button>
                <Button variant="outline" onClick={() => { setSimulatorDraft(defaultSimulatorForm()); setSimulatorResult(""); }}>Xóa form</Button>
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
                <CardDescription>
                  Khi chưa có app thật, chỗ này giúp bạn nạp hoặc trừ credit để test server. Mỗi lần chỉnh đều ghi transaction `admin_adjust`.
                </CardDescription>
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
                  <Button variant="outline" onClick={() => setWalletAdjustDraft(defaultWalletAdjustForm())}>Reset form</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cleanup runtime</CardTitle>
                <CardDescription>
                  Dọn session bị quá hạn theo timeout phase 7 và xóa event cũ hơn số ngày giữ lại trong controls.
                </CardDescription>
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
              <CardDescription>Log JSON của các thao tác cleanup hoặc chỉnh ví thủ công.</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="min-h-[220px] overflow-auto rounded-2xl border bg-muted p-4 text-[11px] leading-5 text-muted-foreground">{opsResult || "Chưa có thao tác ops nào được chạy."}</pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="redeem">
          <Card>
            <CardHeader>
              <CardTitle>Redeem keys thật</CardTitle>
              <CardDescription>
                Tạo, sửa, chặn và xóa các key nhập ở tab Quà tặng. Có thêm thì có xóa, không để danh sách thành nghĩa địa khô khốc nữa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {redeemDraft.map((item, index) => (
                <div key={`${item.id || "new"}-${index}`} className="space-y-3 rounded-2xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="grid flex-1 gap-3 md:grid-cols-3">
                      <Input value={item.redeem_key} onChange={(e) => setRedeemDraft((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, redeem_key: e.target.value } : row))} placeholder="redeem_key" />
                      <Input value={item.title} onChange={(e) => setRedeemDraft((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, title: e.target.value } : row))} placeholder="Tên hiển thị" />
                      <Select value={item.reward_package_id || "none"} onValueChange={(value) => setRedeemDraft((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, reward_package_id: value === "none" ? null : value } : row))}>
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
                      <Switch checked={item.enabled} onCheckedChange={(value) => setRedeemDraft((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, enabled: value } : row))} />
                      <Button variant="outline" size="sm" className="text-destructive" onClick={() => removeRedeemKey(index)}>
                        <Trash2 className="h-4 w-4" />
                        Xóa
                      </Button>
                    </div>
                  </div>

                  <Textarea rows={2} value={item.description} onChange={(e) => setRedeemDraft((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, description: e.target.value } : row))} placeholder="Mô tả ngắn cho redeem key" />

                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Reward mode</div>
                      <Select value={item.reward_mode} onValueChange={(value) => setRedeemDraft((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, reward_mode: value } : row))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {REWARD_MODE_OPTIONS.map((mode) => (
                            <SelectItem key={mode} value={mode}>{mode}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Plan mở ra</div>
                      <Select value={item.plan_code || "none"} onValueChange={(value) => setRedeemDraft((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, plan_code: value === "none" ? null : value } : row))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Không gắn plan</SelectItem>
                          {PLAN_OPTIONS.map((plan) => (
                            <SelectItem key={plan} value={plan}>{plan}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Bắt đầu</div>
                      <Input type="datetime-local" value={toLocalDateTimeInput(item.starts_at)} onChange={(e) => setRedeemDraft((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, starts_at: e.target.value } : row))} />
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Hết hạn</div>
                      <Input type="datetime-local" value={toLocalDateTimeInput(item.expires_at)} onChange={(e) => setRedeemDraft((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, expires_at: e.target.value } : row))} />
                    </div>
                    <div className="space-y-2"><div className="text-sm font-medium">Số lượt dùng tối đa</div><Input type="number" min={1} value={item.max_redemptions} onChange={(e) => setRedeemDraft((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, max_redemptions: Number(e.target.value) } : row))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Credit thường</div><Input value={numericInput(item.soft_credit_amount)} onChange={(e) => setRedeemDraft((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, soft_credit_amount: e.target.value } : row))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Credit kim cương</div><Input value={numericInput(item.premium_credit_amount)} onChange={(e) => setRedeemDraft((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, premium_credit_amount: e.target.value } : row))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Ngày entitlement</div><Input type="number" min={0} value={item.entitlement_days} onChange={(e) => setRedeemDraft((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, entitlement_days: Number(e.target.value) } : row))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Override thiết bị</div><Input type="number" min={0} value={item.device_limit_override ?? 0} onChange={(e) => setRedeemDraft((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, device_limit_override: Number(e.target.value) || null } : row))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Override tài khoản</div><Input type="number" min={0} value={item.account_limit_override ?? 0} onChange={(e) => setRedeemDraft((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, account_limit_override: Number(e.target.value) || null } : row))} /></div>
                    <div className="space-y-2 md:col-span-2"><div className="text-sm font-medium">Lý do chặn</div><Input value={item.blocked_reason} onChange={(e) => setRedeemDraft((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, blocked_reason: e.target.value } : row))} placeholder="Để trống nếu không chặn key này" /></div>
                    <div className="space-y-2 md:col-span-2"><div className="text-sm font-medium">Ghi chú</div><Input value={item.notes} onChange={(e) => setRedeemDraft((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, notes: e.target.value } : row))} placeholder="Ví dụ: key quà tặng Plus 30 ngày, dùng cho đợt test tháng này." /></div>
                  </div>

                  {item.reward_package_id ? (
                    <div className="text-xs text-muted-foreground">
                      Package đang map: {packageMap.get(item.reward_package_id)?.package_code || "Unknown"}
                    </div>
                  ) : null}
                </div>
              ))}

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
              <CardTitle>Entitlements gần đây</CardTitle>
              <CardDescription>Kiểm tra ai đang có gói nào, còn hạn hay đã bị revoke.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.entitlements ?? []).length === 0 ? <div className="text-sm text-muted-foreground">Chưa có entitlement nào.</div> : null}
              {(data?.entitlements ?? []).map((item) => (
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
                  <div>
                    <Button variant="outline" size="sm" className="text-destructive" disabled={item.status !== "active" || revokeEntitlementMutation.isPending} onClick={() => revokeEntitlementMutation.mutate(item.id)}>
                      Revoke
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
              <CardTitle>Wallet balances</CardTitle>
              <CardDescription>Đây là số dư runtime hiện tại của từng account. Tạm thời phase 5 để đọc và kiểm tra, chỉnh tay sâu hơn có thể làm tiếp sau.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.wallets ?? []).length === 0 ? <div className="text-sm text-muted-foreground">Chưa có ví nào.</div> : null}
              {(data?.wallets ?? []).map((item) => (
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
                  <div className="mt-3 text-xs text-muted-foreground">
                    Reset thường: {formatTime(item.last_soft_reset_at)} · Reset kim cương: {formatTime(item.last_premium_reset_at)} · Cập nhật: {formatTime(item.updated_at)}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions">
          <Card>
            <CardHeader>
              <CardTitle>Sessions gần đây</CardTitle>
              <CardDescription>Nhìn trạng thái online gần nhất của từng thiết bị và khóa nhanh nếu cần.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.sessions ?? []).length === 0 ? <div className="text-sm text-muted-foreground">Chưa có session nào.</div> : null}
              {(data?.sessions ?? []).map((item) => (
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
                  <div>
                    <Button variant="outline" size="sm" className="text-destructive" disabled={item.status !== "active" || revokeSessionMutation.isPending} onClick={() => revokeSessionMutation.mutate(item.id)}>
                      Revoke session
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
              <CardTitle>Wallet transactions</CardTitle>
              <CardDescription>Log runtime mới nhất để soi redeem, consume, reset và refill.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.transactions ?? []).length === 0 ? <div className="text-sm text-muted-foreground">Chưa có giao dịch nào.</div> : null}
              {(data?.transactions ?? []).map((item) => (
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
                  <div className="mt-3 text-xs text-muted-foreground">
                    Sau giao dịch: thường {item.soft_balance_after ?? "-"} · kim cương {item.premium_balance_after ?? "-"} · {formatTime(item.created_at)}
                  </div>
                  {item.note ? <div className="mt-2 text-xs text-muted-foreground">Ghi chú: {item.note}</div> : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events">
          <Card>
            <CardHeader>
              <CardTitle>Runtime events</CardTitle>
              <CardDescription>
                Dòng thời gian runtime cho từng action. Chỗ này giúp bạn soi app đang ngã ở đâu thay vì nhìn log như hố đen tím.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.events ?? []).length === 0 ? <div className="text-sm text-muted-foreground">Chưa có event nào.</div> : null}
              {(data?.events ?? []).map((item) => (
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
                  {item.message ? <div className="mt-3 text-sm text-muted-foreground">{item.message}</div> : null}
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
