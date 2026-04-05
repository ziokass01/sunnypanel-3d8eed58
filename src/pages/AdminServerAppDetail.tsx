import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type ServerAppRow = {
  code: string;
  label: string;
  description: string | null;
  admin_url: string | null;
  public_enabled: boolean | null;
  notes: string | null;
};

type ServerAppSettingsRow = {
  app_code: string;
  guest_plan: string | null;
  gift_tab_label: string | null;
  key_persist_until_revoked: boolean | null;
  daily_reset_hour: number | null;
  notes: string | null;
};

type ServerAppPlanRow = {
  app_code: string;
  plan_code: string;
  label: string;
  enabled: boolean;
  daily_soft_credit: string | number;
  daily_premium_credit: string | number;
  soft_cost_multiplier: string | number;
  premium_cost_multiplier: string | number;
  device_limit: number;
  account_limit: number;
  sort_order: number;
};

type ServerAppFeatureRow = {
  app_code: string;
  feature_code: string;
  title: string;
  description: string | null;
  enabled: boolean;
  min_plan: string;
  requires_credit: boolean;
  soft_cost: string | number;
  premium_cost: string | number;
  reset_period: string | null;
  sort_order: number;
};

type ServerAppWalletRuleRow = {
  app_code: string;
  soft_wallet_label: string | null;
  premium_wallet_label: string | null;
  allow_decimal: boolean | null;
  soft_daily_reset_enabled: boolean | null;
  premium_daily_reset_enabled: boolean | null;
  soft_daily_reset_amount: string | number;
  premium_daily_reset_amount: string | number;
  notes: string | null;
};

type ServerAppRewardPackageRow = {
  app_code: string;
  package_code: string;
  title: string;
  description: string | null;
  enabled: boolean;
  reward_mode: string;
  plan_code: string | null;
  soft_credit_amount: string | number;
  premium_credit_amount: string | number;
  entitlement_days: number;
  device_limit_override: number | null;
  account_limit_override: number | null;
  sort_order: number;
  notes: string | null;
};

const APP_FALLBACKS = [
  {
    code: "free-fire",
    label: "Free Fire",
    description: "App hiện tại đang dùng web free key chung.",
    admin_url: (import.meta.env.VITE_SERVER_APP_FREE_FIRE_URL as string | undefined)?.trim() || "/admin/free-keys?app=free-fire",
  },
  {
    code: "find-dumps",
    label: "Find Dumps",
    description: "App SunnyMod Find Dumps. Dùng màn này để chuẩn bị cấu hình go/plus/pro, credit và entitlement riêng.",
    admin_url: (import.meta.env.VITE_SERVER_APP_FIND_DUMPS_URL as string | undefined)?.trim() || "/admin/free-keys?app=find-dumps",
  },
] as const;

const PLAN_TEMPLATES: Record<string, ServerAppPlanRow[]> = {
  "find-dumps": [
    { app_code: "find-dumps", plan_code: "classic", label: "Classic", enabled: true, daily_soft_credit: 0, daily_premium_credit: 0, soft_cost_multiplier: 1, premium_cost_multiplier: 1, device_limit: 1, account_limit: 1, sort_order: 10 },
    { app_code: "find-dumps", plan_code: "go", label: "Go", enabled: true, daily_soft_credit: 3, daily_premium_credit: 0, soft_cost_multiplier: 0.95, premium_cost_multiplier: 0.8, device_limit: 1, account_limit: 1, sort_order: 20 },
    { app_code: "find-dumps", plan_code: "plus", label: "Plus", enabled: true, daily_soft_credit: 5, daily_premium_credit: 1, soft_cost_multiplier: 0.8, premium_cost_multiplier: 0.6, device_limit: 2, account_limit: 1, sort_order: 30 },
    { app_code: "find-dumps", plan_code: "pro", label: "Pro", enabled: true, daily_soft_credit: 8, daily_premium_credit: 2, soft_cost_multiplier: 0.65, premium_cost_multiplier: 0.45, device_limit: 3, account_limit: 1, sort_order: 40 },
  ],
  "free-fire": [
    { app_code: "free-fire", plan_code: "classic", label: "Classic", enabled: true, daily_soft_credit: 0, daily_premium_credit: 0, soft_cost_multiplier: 1, premium_cost_multiplier: 1, device_limit: 1, account_limit: 1, sort_order: 10 },
    { app_code: "free-fire", plan_code: "go", label: "Go", enabled: true, daily_soft_credit: 2, daily_premium_credit: 0, soft_cost_multiplier: 0.95, premium_cost_multiplier: 0.8, device_limit: 1, account_limit: 1, sort_order: 20 },
    { app_code: "free-fire", plan_code: "plus", label: "Plus", enabled: true, daily_soft_credit: 4, daily_premium_credit: 1, soft_cost_multiplier: 0.8, premium_cost_multiplier: 0.6, device_limit: 2, account_limit: 1, sort_order: 30 },
    { app_code: "free-fire", plan_code: "pro", label: "Pro", enabled: true, daily_soft_credit: 6, daily_premium_credit: 2, soft_cost_multiplier: 0.7, premium_cost_multiplier: 0.45, device_limit: 3, account_limit: 1, sort_order: 40 },
  ],
};

const FEATURE_TEMPLATES: Record<string, ServerAppFeatureRow[]> = {
  "find-dumps": [
    { app_code: "find-dumps", feature_code: "search_basic", title: "Search cơ bản", description: "Tìm class, method, offset cơ bản", enabled: true, min_plan: "classic", requires_credit: false, soft_cost: 0, premium_cost: 0, reset_period: "daily", sort_order: 10 },
    { app_code: "find-dumps", feature_code: "batch_search", title: "Batch search", description: "Tìm nhiều dòng trong 1 file truy vấn", enabled: true, min_plan: "go", requires_credit: true, soft_cost: 0.75, premium_cost: 0.25, reset_period: "daily", sort_order: 20 },
    { app_code: "find-dumps", feature_code: "export_json", title: "Export JSON", description: "Xuất kết quả dạng JSON", enabled: true, min_plan: "plus", requires_credit: true, soft_cost: 1.2, premium_cost: 0.45, reset_period: "daily", sort_order: 30 },
    { app_code: "find-dumps", feature_code: "background_queue", title: "Background queue", description: "Xử lý batch nền và ưu tiên hàng đợi", enabled: true, min_plan: "pro", requires_credit: true, soft_cost: 2.4, premium_cost: 0.9, reset_period: "daily", sort_order: 40 },
  ],
  "free-fire": [
    { app_code: "free-fire", feature_code: "free_key", title: "Free key", description: "Luồng vượt free nhận key", enabled: true, min_plan: "classic", requires_credit: false, soft_cost: 0, premium_cost: 0, reset_period: "daily", sort_order: 10 },
    { app_code: "free-fire", feature_code: "vip_2pass", title: "VIP 2-pass", description: "Loại key cần vượt 2 lượt", enabled: true, min_plan: "go", requires_credit: false, soft_cost: 0, premium_cost: 0, reset_period: "daily", sort_order: 20 },
    { app_code: "free-fire", feature_code: "reset_key", title: "Reset key", description: "Khả năng reset nếu key cho phép", enabled: true, min_plan: "plus", requires_credit: true, soft_cost: 0.9, premium_cost: 0.3, reset_period: "daily", sort_order: 30 },
  ],
};

const PACKAGE_TEMPLATES: Record<string, ServerAppRewardPackageRow[]> = {
  "find-dumps": [
    { app_code: "find-dumps", package_code: "fd_go_7d", title: "Find Dumps Go 7 ngày", description: "Mở plan Go trong 7 ngày, kèm ít credit thường để dùng batch nhẹ.", enabled: true, reward_mode: "mixed", plan_code: "go", soft_credit_amount: 3, premium_credit_amount: 0, entitlement_days: 7, device_limit_override: 1, account_limit_override: 1, sort_order: 10, notes: "Gói nhập key cho tab Quà tặng." },
    { app_code: "find-dumps", package_code: "fd_plus_30d", title: "Find Dumps Plus 30 ngày", description: "Mở plan Plus, kèm một ít credit kim cương để test feature nặng.", enabled: true, reward_mode: "mixed", plan_code: "plus", soft_credit_amount: 5, premium_credit_amount: 1.5, entitlement_days: 30, device_limit_override: 2, account_limit_override: 1, sort_order: 20, notes: "Phù hợp user dùng thường xuyên." },
    { app_code: "find-dumps", package_code: "fd_pro_30d", title: "Find Dumps Pro 30 ngày", description: "Mở full plan Pro trong 30 ngày, credit hao rẻ hơn nhờ multiplier plan.", enabled: true, reward_mode: "plan", plan_code: "pro", soft_credit_amount: 0, premium_credit_amount: 0, entitlement_days: 30, device_limit_override: 3, account_limit_override: 1, sort_order: 30, notes: "Không tặng quá nhiều credit để tránh lạm dụng." },
  ],
  "free-fire": [
    { app_code: "free-fire", package_code: "ff_go_7d", title: "Free Fire Go 7 ngày", description: "Mở plan Go cho app Free Fire.", enabled: true, reward_mode: "plan", plan_code: "go", soft_credit_amount: 0, premium_credit_amount: 0, entitlement_days: 7, device_limit_override: 1, account_limit_override: 1, sort_order: 10, notes: "Có thể map với key mua bên admin." },
    { app_code: "free-fire", package_code: "ff_plus_30d", title: "Free Fire Plus 30 ngày", description: "Mở plan Plus, cho reset key với cost mềm hơn.", enabled: true, reward_mode: "plan", plan_code: "plus", soft_credit_amount: 0, premium_credit_amount: 0, entitlement_days: 30, device_limit_override: 2, account_limit_override: 1, sort_order: 20, notes: "Dùng cho tab Quà tặng sau này." },
    { app_code: "free-fire", package_code: "ff_credit_topup", title: "Top-up credit kim cương", description: "Nạp credit kim cương trả phí để dùng feature hao rẻ hơn.", enabled: true, reward_mode: "premium_credit", plan_code: null, soft_credit_amount: 0, premium_credit_amount: 5, entitlement_days: 0, device_limit_override: null, account_limit_override: null, sort_order: 30, notes: "Dùng cho key top-up riêng." },
  ],
};

const WALLET_TEMPLATES: Record<string, ServerAppWalletRuleRow> = {
  "find-dumps": {
    app_code: "find-dumps",
    soft_wallet_label: "Credit thường",
    premium_wallet_label: "Credit kim cương",
    allow_decimal: true,
    soft_daily_reset_enabled: true,
    premium_daily_reset_enabled: false,
    soft_daily_reset_amount: 5,
    premium_daily_reset_amount: 0,
    notes: "Credit thường reset mỗi ngày. Credit kim cương giữ lâu hơn và hao ít hơn.",
  },
  "free-fire": {
    app_code: "free-fire",
    soft_wallet_label: "Credit thường",
    premium_wallet_label: "Credit kim cương",
    allow_decimal: true,
    soft_daily_reset_enabled: true,
    premium_daily_reset_enabled: false,
    soft_daily_reset_amount: 3,
    premium_daily_reset_amount: 0,
    notes: "Dùng decimal để tránh cảm giác lạm phát credit.",
  },
};

function numericInput(value: string | number | null | undefined) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? String(num) : "0";
}

function normalizeDecimal(value: string | number | null | undefined) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? Number(num.toFixed(2)) : 0;
}

function appFallback(appCode?: string) {
  return APP_FALLBACKS.find((item) => item.code === appCode) ?? APP_FALLBACKS[0];
}

function ensurePlans(appCode: string, rows: ServerAppPlanRow[]) {
  if (rows.length) return [...rows].sort((a, b) => a.sort_order - b.sort_order);
  return PLAN_TEMPLATES[appCode]?.map((row) => ({ ...row })) ?? [];
}

function ensureFeatures(appCode: string, rows: ServerAppFeatureRow[]) {
  if (rows.length) return [...rows].sort((a, b) => a.sort_order - b.sort_order);
  return FEATURE_TEMPLATES[appCode]?.map((row) => ({ ...row })) ?? [];
}

function ensureWallet(appCode: string, row?: ServerAppWalletRuleRow | null) {
  return row ? { ...row } : { ...(WALLET_TEMPLATES[appCode] ?? WALLET_TEMPLATES["find-dumps"]) };
}

function ensurePackages(appCode: string, rows: ServerAppRewardPackageRow[]) {
  if (rows.length) return [...rows].sort((a, b) => a.sort_order - b.sort_order);
  return PACKAGE_TEMPLATES[appCode]?.map((row) => ({ ...row })) ?? [];
}

function isPhaseMissingMessage(message?: string) {
  const raw = String(message ?? "").toLowerCase();
  return raw.includes("server_app") || raw.includes("reward_packages") || raw.includes("wallet_rules");
}

export function AdminServerAppDetailPage() {
  const { appCode = "find-dumps" } = useParams();
  const { toast } = useToast();
  const fallback = appFallback(appCode);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["server-app-detail", appCode],
    queryFn: async () => {
      const sb = supabase as any;
      const [appRes, settingsRes, plansRes, featuresRes, walletRes, packagesRes] = await Promise.all([
        sb.from("server_apps").select("*").eq("code", appCode).maybeSingle(),
        sb.from("server_app_settings").select("*").eq("app_code", appCode).maybeSingle(),
        sb.from("server_app_plans").select("*").eq("app_code", appCode).order("sort_order", { ascending: true }),
        sb.from("server_app_features").select("*").eq("app_code", appCode).order("sort_order", { ascending: true }),
        sb.from("server_app_wallet_rules").select("*").eq("app_code", appCode).maybeSingle(),
        sb.from("server_app_reward_packages").select("*").eq("app_code", appCode).order("sort_order", { ascending: true }),
      ]);

      const missing = [appRes, settingsRes, plansRes, featuresRes, walletRes, packagesRes].find((res: any) => isPhaseMissingMessage(res?.error?.message));
      if (missing?.error) throw missing.error;

      return {
        app: (appRes.data as ServerAppRow | null) ?? null,
        settings: (settingsRes.data as ServerAppSettingsRow | null) ?? null,
        plans: (plansRes.data as ServerAppPlanRow[] | null) ?? [],
        features: (featuresRes.data as ServerAppFeatureRow[] | null) ?? [],
        wallet: (walletRes.data as ServerAppWalletRuleRow | null) ?? null,
        packages: (packagesRes.data as ServerAppRewardPackageRow[] | null) ?? [],
      };
    },
  });

  const [appDraft, setAppDraft] = useState<ServerAppRow>({
    code: fallback.code,
    label: fallback.label,
    description: fallback.description,
    admin_url: fallback.admin_url,
    public_enabled: true,
    notes: "",
  });
  const [settingsDraft, setSettingsDraft] = useState<ServerAppSettingsRow>({
    app_code: fallback.code,
    guest_plan: "classic",
    gift_tab_label: "Quà tặng",
    key_persist_until_revoked: true,
    daily_reset_hour: 0,
    notes: "",
  });
  const [plansDraft, setPlansDraft] = useState<ServerAppPlanRow[]>(ensurePlans(fallback.code, []));
  const [featuresDraft, setFeaturesDraft] = useState<ServerAppFeatureRow[]>(ensureFeatures(fallback.code, []));
  const [walletDraft, setWalletDraft] = useState<ServerAppWalletRuleRow>(ensureWallet(fallback.code));
  const [packagesDraft, setPackagesDraft] = useState<ServerAppRewardPackageRow[]>(ensurePackages(fallback.code, []));

  useEffect(() => {
    if (!data) return;
    const fallbackRow = appFallback(appCode);
    setAppDraft({
      code: appCode,
      label: data.app?.label || fallbackRow.label,
      description: data.app?.description || fallbackRow.description,
      admin_url: data.app?.admin_url || fallbackRow.admin_url,
      public_enabled: data.app?.public_enabled ?? true,
      notes: data.app?.notes || "",
    });
    setSettingsDraft({
      app_code: appCode,
      guest_plan: data.settings?.guest_plan || "classic",
      gift_tab_label: data.settings?.gift_tab_label || "Quà tặng",
      key_persist_until_revoked: data.settings?.key_persist_until_revoked ?? true,
      daily_reset_hour: data.settings?.daily_reset_hour ?? 0,
      notes: data.settings?.notes || "",
    });
    setPlansDraft(ensurePlans(appCode, data.plans));
    setFeaturesDraft(ensureFeatures(appCode, data.features));
    setWalletDraft(ensureWallet(appCode, data.wallet));
    setPackagesDraft(ensurePackages(appCode, data.packages));
  }, [data, appCode]);

  const saveAppMutation = useMutation({
    mutationFn: async () => {
      const sb = supabase as any;
      const appPayload = {
        code: appCode,
        label: appDraft.label.trim() || fallback.label,
        description: appDraft.description?.trim() || null,
        admin_url: appDraft.admin_url?.trim() || null,
        public_enabled: Boolean(appDraft.public_enabled ?? true),
        notes: appDraft.notes?.trim() || null,
      };
      const settingsPayload = {
        app_code: appCode,
        guest_plan: settingsDraft.guest_plan || "classic",
        gift_tab_label: settingsDraft.gift_tab_label?.trim() || "Quà tặng",
        key_persist_until_revoked: Boolean(settingsDraft.key_persist_until_revoked ?? true),
        daily_reset_hour: Math.max(0, Math.min(23, Number(settingsDraft.daily_reset_hour ?? 0))),
        notes: settingsDraft.notes?.trim() || null,
      };
      const appRes = await sb.from("server_apps").upsert(appPayload, { onConflict: "code" });
      if (appRes.error) throw appRes.error;
      const settingsRes = await sb.from("server_app_settings").upsert(settingsPayload, { onConflict: "app_code" });
      if (settingsRes.error) throw settingsRes.error;
    },
    onSuccess: async () => {
      toast({ title: "Đã lưu", description: "Cấu hình app đã được cập nhật." });
      await refetch();
    },
    onError: (e: any) => toast({ title: "Lưu thất bại", description: e?.message ?? "Không thể lưu cấu hình app.", variant: "destructive" }),
  });

  const savePlansMutation = useMutation({
    mutationFn: async () => {
      const sb = supabase as any;
      const payload = plansDraft.map((row, index) => ({
        app_code: appCode,
        plan_code: row.plan_code,
        label: row.label.trim() || row.plan_code.toUpperCase(),
        enabled: Boolean(row.enabled),
        daily_soft_credit: normalizeDecimal(row.daily_soft_credit),
        daily_premium_credit: normalizeDecimal(row.daily_premium_credit),
        soft_cost_multiplier: normalizeDecimal(row.soft_cost_multiplier),
        premium_cost_multiplier: normalizeDecimal(row.premium_cost_multiplier),
        device_limit: Math.max(1, Math.floor(Number(row.device_limit || 1))),
        account_limit: Math.max(1, Math.floor(Number(row.account_limit || 1))),
        sort_order: row.sort_order || (index + 1) * 10,
      }));
      const res = await sb.from("server_app_plans").upsert(payload, { onConflict: "app_code,plan_code" });
      if (res.error) throw res.error;
    },
    onSuccess: async () => {
      toast({ title: "Đã lưu", description: "Plan và credit đã được cập nhật." });
      await refetch();
    },
    onError: (e: any) => toast({ title: "Lưu plan thất bại", description: e?.message ?? "Không thể lưu plan.", variant: "destructive" }),
  });

  const saveFeaturesMutation = useMutation({
    mutationFn: async () => {
      const sb = supabase as any;
      const payload = featuresDraft
        .map((row, index) => ({
          app_code: appCode,
          feature_code: row.feature_code.trim(),
          title: row.title.trim() || row.feature_code.trim() || `feature_${index + 1}`,
          description: row.description?.trim() || null,
          enabled: Boolean(row.enabled),
          min_plan: row.min_plan || "classic",
          requires_credit: Boolean(row.requires_credit),
          soft_cost: normalizeDecimal(row.soft_cost),
          premium_cost: normalizeDecimal(row.premium_cost),
          reset_period: row.reset_period || "daily",
          sort_order: row.sort_order || (index + 1) * 10,
        }))
        .filter((row) => row.feature_code);
      const keepCodes = new Set(payload.map((row) => row.feature_code));
      const deleteCodes = ((data?.features as ServerAppFeatureRow[] | undefined) ?? [])
        .map((row) => row.feature_code)
        .filter((code) => !keepCodes.has(code));
      if (deleteCodes.length) {
        const deleteRes = await sb.from("server_app_features").delete().eq("app_code", appCode).in("feature_code", deleteCodes);
        if (deleteRes.error) throw deleteRes.error;
      }
      if (payload.length) {
        const res = await sb.from("server_app_features").upsert(payload, { onConflict: "app_code,feature_code" });
        if (res.error) throw res.error;
      }
    },
    onSuccess: async () => {
      toast({ title: "Đã lưu", description: "Feature flags và cost đã được cập nhật." });
      await refetch();
    },
    onError: (e: any) => toast({ title: "Lưu feature thất bại", description: e?.message ?? "Không thể lưu feature.", variant: "destructive" }),
  });

  const saveWalletMutation = useMutation({
    mutationFn: async () => {
      const sb = supabase as any;
      const payload = {
        app_code: appCode,
        soft_wallet_label: walletDraft.soft_wallet_label?.trim() || "Credit thường",
        premium_wallet_label: walletDraft.premium_wallet_label?.trim() || "Credit kim cương",
        allow_decimal: Boolean(walletDraft.allow_decimal ?? true),
        soft_daily_reset_enabled: Boolean(walletDraft.soft_daily_reset_enabled ?? true),
        premium_daily_reset_enabled: Boolean(walletDraft.premium_daily_reset_enabled ?? false),
        soft_daily_reset_amount: normalizeDecimal(walletDraft.soft_daily_reset_amount),
        premium_daily_reset_amount: normalizeDecimal(walletDraft.premium_daily_reset_amount),
        notes: walletDraft.notes?.trim() || null,
      };
      const res = await sb.from("server_app_wallet_rules").upsert(payload, { onConflict: "app_code" });
      if (res.error) throw res.error;
    },
    onSuccess: async () => {
      toast({ title: "Đã lưu", description: "Quy tắc ví credit đã được cập nhật." });
      await refetch();
    },
    onError: (e: any) => toast({ title: "Lưu ví thất bại", description: e?.message ?? "Không thể lưu wallet rules.", variant: "destructive" }),
  });

  const savePackagesMutation = useMutation({
    mutationFn: async () => {
      const sb = supabase as any;
      const payload = packagesDraft
        .map((row, index) => ({
          app_code: appCode,
          package_code: row.package_code.trim(),
          title: row.title.trim() || row.package_code.trim() || `package_${index + 1}`,
          description: row.description?.trim() || null,
          enabled: Boolean(row.enabled),
          reward_mode: row.reward_mode || "plan",
          plan_code: row.plan_code && row.plan_code !== "none" ? row.plan_code : null,
          soft_credit_amount: normalizeDecimal(row.soft_credit_amount),
          premium_credit_amount: normalizeDecimal(row.premium_credit_amount),
          entitlement_days: Math.max(0, Math.floor(Number(row.entitlement_days || 0))),
          device_limit_override: row.device_limit_override == null || Number(row.device_limit_override) <= 0 ? null : Math.floor(Number(row.device_limit_override)),
          account_limit_override: row.account_limit_override == null || Number(row.account_limit_override) <= 0 ? null : Math.floor(Number(row.account_limit_override)),
          sort_order: row.sort_order || (index + 1) * 10,
          notes: row.notes?.trim() || null,
        }))
        .filter((row) => row.package_code);
      const keepCodes = new Set(payload.map((row) => row.package_code));
      const deleteCodes = ((data?.packages as ServerAppRewardPackageRow[] | undefined) ?? [])
        .map((row) => row.package_code)
        .filter((code) => !keepCodes.has(code));
      if (deleteCodes.length) {
        const deleteRes = await sb.from("server_app_reward_packages").delete().eq("app_code", appCode).in("package_code", deleteCodes);
        if (deleteRes.error) throw deleteRes.error;
      }
      if (payload.length) {
        const res = await sb.from("server_app_reward_packages").upsert(payload, { onConflict: "app_code,package_code" });
        if (res.error) throw res.error;
      }
    },
    onSuccess: async () => {
      toast({ title: "Đã lưu", description: "Reward packages / redeem mapping đã được cập nhật." });
      await refetch();
    },
    onError: (e: any) => toast({ title: "Lưu package thất bại", description: e?.message ?? "Không thể lưu reward packages.", variant: "destructive" }),
  });

  const addFeature = () => {
    setFeaturesDraft((prev) => ([
      ...prev,
      {
        app_code: appCode,
        feature_code: `feature_${prev.length + 1}`,
        title: "Feature mới",
        description: "",
        enabled: true,
        min_plan: "classic",
        requires_credit: false,
        soft_cost: 0,
        premium_cost: 0,
        reset_period: "daily",
        sort_order: (prev.length + 1) * 10,
      },
    ]));
  };

  const addPackage = () => {
    setPackagesDraft((prev) => ([
      ...prev,
      {
        app_code: appCode,
        package_code: `package_${prev.length + 1}`,
        title: "Reward mới",
        description: "",
        enabled: true,
        reward_mode: "plan",
        plan_code: "go",
        soft_credit_amount: 0,
        premium_credit_amount: 0,
        entitlement_days: 7,
        device_limit_override: null,
        account_limit_override: null,
        sort_order: (prev.length + 1) * 10,
        notes: "",
      },
    ]));
  };

  const removeFeature = (index: number) => {
    setFeaturesDraft((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const removePackage = (index: number) => {
    setPackagesDraft((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const openExternal = () => {
    const url = appDraft.admin_url?.trim();
    if (!url) return;
    if (/^https?:\/\//i.test(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    window.location.assign(url);
  };

  const migrationHint = useMemo(() => isPhaseMissingMessage((error as Error | undefined)?.message), [error]);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Đang tải cấu hình app...</div>;
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/apps">← Quay lại Server app</Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">{appDraft.label}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Màn quản lý nội bộ cho {appDraft.label}. Đây là tầng 2 để chỉnh plan, credit, reward package và feature flags mà không đụng lung tung vào phần free key đang chạy.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={appDraft.public_enabled ? "secondary" : "outline"}>
            {appDraft.public_enabled ? "Đang bật" : "Đang ẩn"}
          </Badge>
          <Button asChild variant="outline">
            <Link to={`/admin/apps/${appCode}/runtime`}>Runtime admin</Link>
          </Button>
          <Button onClick={openExternal} disabled={!appDraft.admin_url}>Mở server web</Button>
        </div>
      </div>

      {migrationHint ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle>Thiếu migration phase 2 / phase 3</CardTitle>
            <CardDescription>
              Cần apply migration <span className="font-mono">20260404193000_server_apps_phase2.sql</span> và <span className="font-mono">20260404213000_server_app_wallets_rewards_phase3.sql</span> rồi reload trang này.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Trang vẫn hiển thị template mặc định để bạn chỉnh trước. Sau khi chạy migration, chỉ cần bấm lưu là dữ liệu sẽ đổ xuống DB.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 md:grid-cols-5">
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Guest plan</div><div className="mt-1 text-2xl font-semibold">{settingsDraft.guest_plan || "classic"}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Gift tab</div><div className="mt-1 text-2xl font-semibold">{settingsDraft.gift_tab_label || "Quà tặng"}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Plans</div><div className="mt-1 text-2xl font-semibold">{plansDraft.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Features</div><div className="mt-1 text-2xl font-semibold">{featuresDraft.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Reward packages</div><div className="mt-1 text-2xl font-semibold">{packagesDraft.length}</div></CardContent></Card>
      </div>

      <Tabs defaultValue="settings" className="space-y-3">
        <TabsList className="flex w-full flex-wrap justify-start gap-2">
          <TabsTrigger value="settings">App settings</TabsTrigger>
          <TabsTrigger value="plans">Plans & credit</TabsTrigger>
          <TabsTrigger value="features">Feature flags</TabsTrigger>
          <TabsTrigger value="wallet">Wallet rules</TabsTrigger>
          <TabsTrigger value="rewards">Reward / redeem</TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Cấu hình app</CardTitle>
              <CardDescription>
                Chỉnh tên app, link server web, cách guest vào app và việc key đã nhập có giữ lại cho tới khi admin xóa/chặn hay không.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Tên app</div>
                  <Input value={appDraft.label} onChange={(e) => setAppDraft((prev) => ({ ...prev, label: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Admin URL</div>
                  <Input value={appDraft.admin_url || ""} onChange={(e) => setAppDraft((prev) => ({ ...prev, admin_url: e.target.value }))} placeholder="https://admin.example.com/find-dumps" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <div className="text-sm font-medium">Mô tả</div>
                  <Textarea rows={3} value={appDraft.description || ""} onChange={(e) => setAppDraft((prev) => ({ ...prev, description: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Guest plan mặc định</div>
                  <Select value={settingsDraft.guest_plan || "classic"} onValueChange={(value) => setSettingsDraft((prev) => ({ ...prev, guest_plan: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="classic">Classic</SelectItem>
                      <SelectItem value="go">Go</SelectItem>
                      <SelectItem value="plus">Plus</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Tên tab nhập key</div>
                  <Input value={settingsDraft.gift_tab_label || ""} onChange={(e) => setSettingsDraft((prev) => ({ ...prev, gift_tab_label: e.target.value }))} placeholder="Quà tặng / Mã quà" />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Giờ reset credit thường</div>
                  <Input type="number" min={0} max={23} value={settingsDraft.daily_reset_hour ?? 0} onChange={(e) => setSettingsDraft((prev) => ({ ...prev, daily_reset_hour: Number(e.target.value) }))} />
                </div>
                <div className="flex items-center justify-between rounded-2xl border p-3">
                  <div>
                    <div className="font-medium">Giữ key đã nhập</div>
                    <div className="text-xs text-muted-foreground">Nếu bật, app chỉ mất quyền khi admin xóa/chặn/hết hạn, không cần bắt user nhập lại liên tục.</div>
                  </div>
                  <Switch checked={Boolean(settingsDraft.key_persist_until_revoked ?? true)} onCheckedChange={(value) => setSettingsDraft((prev) => ({ ...prev, key_persist_until_revoked: value }))} />
                </div>
                <div className="flex items-center justify-between rounded-2xl border p-3">
                  <div>
                    <div className="font-medium">Public enabled</div>
                    <div className="text-xs text-muted-foreground">Cho phép app này hiện trong danh sách quản lý và sẵn sàng cấp quyền từ server.</div>
                  </div>
                  <Switch checked={Boolean(appDraft.public_enabled ?? true)} onCheckedChange={(value) => setAppDraft((prev) => ({ ...prev, public_enabled: value }))} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <div className="text-sm font-medium">Ghi chú admin</div>
                  <Textarea rows={4} value={settingsDraft.notes || ""} onChange={(e) => setSettingsDraft((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Ví dụ: app này dùng 2 loại credit, ưu tiên premium, key free chỉ để vượt link..." />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => saveAppMutation.mutate()} disabled={saveAppMutation.isPending}>Lưu cấu hình app</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plans">
          <Card>
            <CardHeader>
              <CardTitle>Plans & credit</CardTitle>
              <CardDescription>
                Tầng này cho phép bạn định nghĩa Classic / Go / Plus / Pro, credit cấp mỗi ngày, hệ số tiêu hao và giới hạn thiết bị/tài khoản do admin quyết định.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {plansDraft.map((plan, index) => (
                <div key={plan.plan_code} className="rounded-2xl border p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{plan.plan_code.toUpperCase()}</Badge>
                      <Input className="w-40" value={plan.label} onChange={(e) => setPlansDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, label: e.target.value } : item))} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Bật plan</span>
                      <Switch checked={plan.enabled} onCheckedChange={(value) => setPlansDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: value } : item))} />
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-2"><div className="text-sm font-medium">Credit thường / ngày</div><Input value={numericInput(plan.daily_soft_credit)} onChange={(e) => setPlansDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, daily_soft_credit: e.target.value } : item))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Credit kim cương / ngày</div><Input value={numericInput(plan.daily_premium_credit)} onChange={(e) => setPlansDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, daily_premium_credit: e.target.value } : item))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Thiết bị tối đa</div><Input type="number" value={plan.device_limit} onChange={(e) => setPlansDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, device_limit: Number(e.target.value) } : item))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Tài khoản tối đa</div><Input type="number" value={plan.account_limit} onChange={(e) => setPlansDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, account_limit: Number(e.target.value) } : item))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Hệ số hao credit thường</div><Input value={numericInput(plan.soft_cost_multiplier)} onChange={(e) => setPlansDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, soft_cost_multiplier: e.target.value } : item))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Hệ số hao credit kim cương</div><Input value={numericInput(plan.premium_cost_multiplier)} onChange={(e) => setPlansDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, premium_cost_multiplier: e.target.value } : item))} /></div>
                  </div>
                </div>
              ))}
              <div className="flex justify-end">
                <Button onClick={() => savePlansMutation.mutate()} disabled={savePlansMutation.isPending}>Lưu plans & credit</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="features">
          <Card>
            <CardHeader>
              <CardTitle>Feature flags</CardTitle>
              <CardDescription>
                Mỗi chức năng có thể yêu cầu plan tối thiểu và mức hao credit khác nhau. Credit thường nên hao nhiều hơn credit kim cương, đúng theo ý tưởng bạn chốt.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {featuresDraft.map((feature, index) => (
                <div key={`${feature.feature_code}-${index}`} className="rounded-2xl border p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="grid gap-3 md:grid-cols-3 flex-1">
                      <Input value={feature.feature_code} onChange={(e) => setFeaturesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, feature_code: e.target.value } : item))} placeholder="feature_code" />
                      <Input value={feature.title} onChange={(e) => setFeaturesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, title: e.target.value } : item))} placeholder="Tên hiển thị" />
                      <Select value={feature.min_plan} onValueChange={(value) => setFeaturesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, min_plan: value } : item))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="classic">Classic</SelectItem>
                          <SelectItem value="go">Go</SelectItem>
                          <SelectItem value="plus">Plus</SelectItem>
                          <SelectItem value="pro">Pro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Bật</span>
                      <Switch checked={feature.enabled} onCheckedChange={(value) => setFeaturesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: value } : item))} />
                      <Button variant="outline" size="sm" className="text-destructive" onClick={() => removeFeature(index)}>
                        <Trash2 className="h-4 w-4" />
                        Xóa
                      </Button>
                    </div>
                  </div>
                  <Textarea rows={2} value={feature.description || ""} onChange={(e) => setFeaturesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, description: e.target.value } : item))} placeholder="Mô tả ngắn cho admin và app manifest" />
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="space-y-2"><div className="text-sm font-medium">Credit thường</div><Input value={numericInput(feature.soft_cost)} onChange={(e) => setFeaturesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, soft_cost: e.target.value } : item))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Credit kim cương</div><Input value={numericInput(feature.premium_cost)} onChange={(e) => setFeaturesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, premium_cost: e.target.value } : item))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Chu kỳ reset</div><Select value={feature.reset_period || "daily"} onValueChange={(value) => setFeaturesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, reset_period: value } : item))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="daily">Daily</SelectItem><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="none">None</SelectItem></SelectContent></Select></div>
                    <div className="flex items-center justify-between rounded-2xl border p-3"><div><div className="font-medium">Cần credit</div><div className="text-xs text-muted-foreground">Tắt nếu chỉ cần đúng plan là dùng được.</div></div><Switch checked={feature.requires_credit} onCheckedChange={(value) => setFeaturesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, requires_credit: value } : item))} /></div>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="outline" onClick={addFeature}>Thêm feature</Button>
                <Button onClick={() => saveFeaturesMutation.mutate()} disabled={saveFeaturesMutation.isPending}>Lưu feature flags</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wallet">
          <Card>
            <CardHeader>
              <CardTitle>Wallet rules</CardTitle>
              <CardDescription>
                Quy tắc ví credit để chuẩn bị cho app nhớ key sau khi nhập đúng và tính hao decimal kiểu 1.34, 0.45 như bạn chốt.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Tên ví credit thường</div>
                  <Input value={walletDraft.soft_wallet_label || ""} onChange={(e) => setWalletDraft((prev) => ({ ...prev, soft_wallet_label: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Tên ví credit kim cương</div>
                  <Input value={walletDraft.premium_wallet_label || ""} onChange={(e) => setWalletDraft((prev) => ({ ...prev, premium_wallet_label: e.target.value }))} />
                </div>
                <div className="flex items-center justify-between rounded-2xl border p-3">
                  <div>
                    <div className="font-medium">Cho phép số thập phân</div>
                    <div className="text-xs text-muted-foreground">Bật để cost có thể là 1.34, 0.45 thay vì số nguyên cứng.</div>
                  </div>
                  <Switch checked={Boolean(walletDraft.allow_decimal ?? true)} onCheckedChange={(value) => setWalletDraft((prev) => ({ ...prev, allow_decimal: value }))} />
                </div>
                <div className="flex items-center justify-between rounded-2xl border p-3">
                  <div>
                    <div className="font-medium">Reset credit thường mỗi ngày</div>
                    <div className="text-xs text-muted-foreground">Thường nên bật để user có quota free hàng ngày.</div>
                  </div>
                  <Switch checked={Boolean(walletDraft.soft_daily_reset_enabled ?? true)} onCheckedChange={(value) => setWalletDraft((prev) => ({ ...prev, soft_daily_reset_enabled: value }))} />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Số credit thường reset / ngày</div>
                  <Input value={numericInput(walletDraft.soft_daily_reset_amount)} onChange={(e) => setWalletDraft((prev) => ({ ...prev, soft_daily_reset_amount: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Số credit kim cương reset / ngày</div>
                  <Input value={numericInput(walletDraft.premium_daily_reset_amount)} onChange={(e) => setWalletDraft((prev) => ({ ...prev, premium_daily_reset_amount: e.target.value }))} />
                </div>
                <div className="flex items-center justify-between rounded-2xl border p-3 md:col-span-2">
                  <div>
                    <div className="font-medium">Reset credit kim cương định kỳ</div>
                    <div className="text-xs text-muted-foreground">Thường nên tắt để credit trả phí không tự trôi mất, trừ khi bạn muốn theo chu kỳ.</div>
                  </div>
                  <Switch checked={Boolean(walletDraft.premium_daily_reset_enabled ?? false)} onCheckedChange={(value) => setWalletDraft((prev) => ({ ...prev, premium_daily_reset_enabled: value }))} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <div className="text-sm font-medium">Ghi chú ví</div>
                  <Textarea rows={4} value={walletDraft.notes || ""} onChange={(e) => setWalletDraft((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Ví dụ: credit thường dùng nhiều hơn, credit kim cương hao ít hơn, ưu tiên cho feature nặng..." />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => saveWalletMutation.mutate()} disabled={saveWalletMutation.isPending}>Lưu wallet rules</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rewards">
          <Card>
            <CardHeader>
              <CardTitle>Reward / redeem packages</CardTitle>
              <CardDescription>
                Đây là lớp để admin phân loại key nhập trong tab Quà tặng sau này: key này mở Go / Plus / Pro hay chỉ nạp credit thường, credit kim cương, hoặc cả hai.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {packagesDraft.map((pkg, index) => (
                <div key={`${pkg.package_code}-${index}`} className="rounded-2xl border p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="grid gap-3 md:grid-cols-3 flex-1">
                      <Input value={pkg.package_code} onChange={(e) => setPackagesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, package_code: e.target.value } : item))} placeholder="package_code" />
                      <Input value={pkg.title} onChange={(e) => setPackagesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, title: e.target.value } : item))} placeholder="Tên gói" />
                      <Select value={pkg.reward_mode} onValueChange={(value) => setPackagesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, reward_mode: value } : item))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="plan">Plan</SelectItem>
                          <SelectItem value="soft_credit">Credit thường</SelectItem>
                          <SelectItem value="premium_credit">Credit kim cương</SelectItem>
                          <SelectItem value="mixed">Mixed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Bật</span>
                      <Switch checked={pkg.enabled} onCheckedChange={(value) => setPackagesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: value } : item))} />
                      <Button variant="outline" size="sm" className="text-destructive" onClick={() => removePackage(index)}>
                        <Trash2 className="h-4 w-4" />
                        Xóa
                      </Button>
                    </div>
                  </div>
                  <Textarea rows={2} value={pkg.description || ""} onChange={(e) => setPackagesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, description: e.target.value } : item))} placeholder="Mô tả ngắn cho loại key / redeem package" />
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Plan mở ra</div>
                      <Select value={pkg.plan_code || "none"} onValueChange={(value) => setPackagesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, plan_code: value === "none" ? null : value } : item))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Không gắn plan</SelectItem>
                          <SelectItem value="classic">Classic</SelectItem>
                          <SelectItem value="go">Go</SelectItem>
                          <SelectItem value="plus">Plus</SelectItem>
                          <SelectItem value="pro">Pro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><div className="text-sm font-medium">Credit thường cộng thêm</div><Input value={numericInput(pkg.soft_credit_amount)} onChange={(e) => setPackagesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, soft_credit_amount: e.target.value } : item))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Credit kim cương cộng thêm</div><Input value={numericInput(pkg.premium_credit_amount)} onChange={(e) => setPackagesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, premium_credit_amount: e.target.value } : item))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Thời hạn entitlement (ngày)</div><Input type="number" min={0} value={pkg.entitlement_days} onChange={(e) => setPackagesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, entitlement_days: Number(e.target.value) } : item))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Override số thiết bị</div><Input type="number" min={0} value={pkg.device_limit_override ?? 0} onChange={(e) => setPackagesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, device_limit_override: Number(e.target.value) || null } : item))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Override số tài khoản</div><Input type="number" min={0} value={pkg.account_limit_override ?? 0} onChange={(e) => setPackagesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, account_limit_override: Number(e.target.value) || null } : item))} /></div>
                    <div className="space-y-2 md:col-span-2"><div className="text-sm font-medium">Ghi chú package</div><Input value={pkg.notes || ""} onChange={(e) => setPackagesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, notes: e.target.value } : item))} placeholder="Ví dụ: key nhập đúng sẽ mở Plus 30 ngày, không cần nhập lại cho tới khi admin revoke." /></div>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="outline" onClick={addPackage}>Thêm reward package</Button>
                <Button onClick={() => savePackagesMutation.mutate()} disabled={savePackagesMutation.isPending}>Lưu reward / redeem</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  );
}
