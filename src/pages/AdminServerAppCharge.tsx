import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeftRight, Coins, ShieldCheck, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
  category: string | null;
  group_key: string | null;
  icon_key: string | null;
  badge_label: string | null;
  visible_to_guest: boolean;
  charge_unit: number;
  charge_on_success_only: boolean;
  client_accumulate_units: boolean;
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
  consume_priority: 'soft_first' | 'premium_first';
  soft_daily_reset_mode: 'legacy_floor' | 'debt_floor';
  premium_daily_reset_mode: 'legacy_floor' | 'debt_floor';
  soft_floor_credit: string | number;
  premium_floor_credit: string | number;
  soft_allow_negative: boolean | null;
  premium_allow_negative: boolean | null;
  notes: string | null;
};

const APP_FALLBACKS: ServerAppRow[] = [
  {
    code: "free-fire",
    label: "Free Fire",
    description: "App hiện tại đang dùng web free key chung.",
    admin_url: "/apps/free-fire/runtime",
    public_enabled: true,
    notes: null,
  },
  {
    code: "find-dumps",
    label: "Find Dumps",
    description: "App SunnyMod Find Dumps. Dùng tab này để chỉnh credit rule, debt rule, charge unit và quyền guest.",
    admin_url: "/apps/find-dumps/runtime",
    public_enabled: true,
    notes: null,
  },
];

const FEATURE_TEMPLATES: Record<string, ServerAppFeatureRow[]> = {
  "find-dumps": [
    { app_code: "find-dumps", feature_code: "search_basic", title: "Search cơ bản", description: "Tìm class, method, offset cơ bản", enabled: true, min_plan: "classic", requires_credit: false, soft_cost: 0, premium_cost: 0, reset_period: "daily", sort_order: 10, category: "search", group_key: "find", icon_key: "search", badge_label: "Miễn phí", visible_to_guest: true, charge_unit: 1, charge_on_success_only: true, client_accumulate_units: false },
    { app_code: "find-dumps", feature_code: "batch_search", title: "Batch search", description: "Tìm nhiều dòng trong 1 file truy vấn", enabled: true, min_plan: "go", requires_credit: true, soft_cost: 1, premium_cost: 1, reset_period: "daily", sort_order: 20, category: "search", group_key: "batch", icon_key: "batch", badge_label: "Thường", visible_to_guest: true, charge_unit: 5, charge_on_success_only: true, client_accumulate_units: true },
    { app_code: "find-dumps", feature_code: "export_plain", title: "Export", description: "Xuất kết quả text thường", enabled: true, min_plan: "classic", requires_credit: true, soft_cost: 1, premium_cost: 1, reset_period: "daily", sort_order: 25, category: "export", group_key: "result", icon_key: "export", badge_label: "Thường", visible_to_guest: true, charge_unit: 1, charge_on_success_only: true, client_accumulate_units: false },
    { app_code: "find-dumps", feature_code: "export_json", title: "Export JSON", description: "Xuất kết quả dạng JSON", enabled: true, min_plan: "plus", requires_credit: true, soft_cost: 1, premium_cost: 1, reset_period: "daily", sort_order: 30, category: "export", group_key: "result", icon_key: "json", badge_label: "JSON", visible_to_guest: true, charge_unit: 1, charge_on_success_only: true, client_accumulate_units: false },
    { app_code: "find-dumps", feature_code: "background_queue", title: "Background queue", description: "Xử lý batch nền và ưu tiên hàng đợi", enabled: true, min_plan: "pro", requires_credit: true, soft_cost: 2, premium_cost: 1, reset_period: "daily", sort_order: 40, category: "search", group_key: "batch", icon_key: "queue", badge_label: "VIP", visible_to_guest: false, charge_unit: 1, charge_on_success_only: true, client_accumulate_units: false },
    { app_code: "find-dumps", feature_code: "convert_image", title: "Convert image", description: "Đổi ảnh sang header .h", enabled: true, min_plan: "classic", requires_credit: false, soft_cost: 0, premium_cost: 0, reset_period: "daily", sort_order: 50, category: "tools", group_key: "image", icon_key: "image", badge_label: "Tool", visible_to_guest: true, charge_unit: 1, charge_on_success_only: true, client_accumulate_units: false },
    { app_code: "find-dumps", feature_code: "encode_decode", title: "Encode / Decode", description: "Bộ codec kiểu toolbox", enabled: true, min_plan: "classic", requires_credit: false, soft_cost: 0, premium_cost: 0, reset_period: "daily", sort_order: 60, category: "tools", group_key: "codec", icon_key: "codec", badge_label: "Tool", visible_to_guest: true, charge_unit: 1, charge_on_success_only: true, client_accumulate_units: false },
    { app_code: "find-dumps", feature_code: "hex_edit", title: "Hex edit", description: "Mở file và sửa hex rồi lưu", enabled: true, min_plan: "classic", requires_credit: false, soft_cost: 0, premium_cost: 0, reset_period: "daily", sort_order: 70, category: "tools", group_key: "hex", icon_key: "hex", badge_label: "Tool", visible_to_guest: true, charge_unit: 1, charge_on_success_only: true, client_accumulate_units: false },
    { app_code: "find-dumps", feature_code: "binary_scan_quick", title: "Binary quick scan", description: "Quét nhanh ELF/binary để lấy snapshot nền", enabled: true, min_plan: "classic", requires_credit: false, soft_cost: 0, premium_cost: 0, reset_period: "daily", sort_order: 80, category: "analysis", group_key: "workspace", icon_key: "scan", badge_label: "Quick", visible_to_guest: true, charge_unit: 1, charge_on_success_only: true, client_accumulate_units: false },
    { app_code: "find-dumps", feature_code: "binary_scan_full", title: "Binary full scan", description: "Quét sâu ELF/binary và dựng snapshot chi tiết hơn", enabled: true, min_plan: "go", requires_credit: true, soft_cost: 1, premium_cost: 1, reset_period: "daily", sort_order: 90, category: "analysis", group_key: "workspace", icon_key: "scan", badge_label: "Full", visible_to_guest: true, charge_unit: 1, charge_on_success_only: true, client_accumulate_units: false },
    { app_code: "find-dumps", feature_code: "ida_export_import", title: "Import artifact pack", description: "Nhập sections, symbols, relocations, functions, disassembly, strings từ PC", enabled: true, min_plan: "go", requires_credit: true, soft_cost: 1, premium_cost: 1, reset_period: "daily", sort_order: 100, category: "analysis", group_key: "workspace", icon_key: "import", badge_label: "Pack", visible_to_guest: true, charge_unit: 1, charge_on_success_only: true, client_accumulate_units: false },
    { app_code: "find-dumps", feature_code: "ida_workspace_save", title: "Save workspace snapshot", description: "Lưu snapshot và đồng bộ chỉ mục nội bộ", enabled: true, min_plan: "classic", requires_credit: false, soft_cost: 0, premium_cost: 0, reset_period: "daily", sort_order: 110, category: "workspace", group_key: "snapshot", icon_key: "save", badge_label: "Free", visible_to_guest: true, charge_unit: 1, charge_on_success_only: true, client_accumulate_units: false },
    { app_code: "find-dumps", feature_code: "ida_workspace_restore", title: "Restore workspace snapshot", description: "Khôi phục snapshot đã lưu từ storage nội bộ hoặc file import", enabled: true, min_plan: "classic", requires_credit: false, soft_cost: 0, premium_cost: 0, reset_period: "daily", sort_order: 120, category: "workspace", group_key: "snapshot", icon_key: "restore", badge_label: "Free", visible_to_guest: true, charge_unit: 1, charge_on_success_only: true, client_accumulate_units: false },
    { app_code: "find-dumps", feature_code: "ida_workspace_export", title: "Export workspace snapshot", description: "Xuất snapshot dạng JSON, TXT, CSV hoặc bundle", enabled: true, min_plan: "plus", requires_credit: true, soft_cost: 1, premium_cost: 1, reset_period: "daily", sort_order: 130, category: "workspace", group_key: "snapshot", icon_key: "export", badge_label: "Export", visible_to_guest: true, charge_unit: 1, charge_on_success_only: true, client_accumulate_units: false },
    { app_code: "find-dumps", feature_code: "workspace_batch", title: "Workspace batch", description: "Chạy nhiều truy vấn trên snapshot hiện tại", enabled: true, min_plan: "go", requires_credit: true, soft_cost: 1, premium_cost: 1, reset_period: "daily", sort_order: 140, category: "search", group_key: "workspace", icon_key: "batch", badge_label: "Batch", visible_to_guest: true, charge_unit: 5, charge_on_success_only: true, client_accumulate_units: true },
    { app_code: "find-dumps", feature_code: "workspace_note", title: "Workspace note", description: "Gắn ghi chú vào function, symbol, string hoặc snapshot", enabled: true, min_plan: "classic", requires_credit: false, soft_cost: 0, premium_cost: 0, reset_period: "daily", sort_order: 150, category: "workspace", group_key: "note", icon_key: "note", badge_label: "Note", visible_to_guest: true, charge_unit: 1, charge_on_success_only: true, client_accumulate_units: false },
    { app_code: "find-dumps", feature_code: "workspace_export_result", title: "Export current view", description: "Xuất màn hình kết quả hiện tại ra TXT, JSON, CSV hoặc Markdown", enabled: true, min_plan: "plus", requires_credit: true, soft_cost: 1, premium_cost: 1, reset_period: "daily", sort_order: 160, category: "export", group_key: "workspace", icon_key: "export", badge_label: "View", visible_to_guest: true, charge_unit: 1, charge_on_success_only: true, client_accumulate_units: false },
    { app_code: "find-dumps", feature_code: "workspace_browser", title: "Browser + pseudo", description: "Mở browser, xref và pseudo/decompile-lite từ snapshot hiện tại", enabled: true, min_plan: "plus", requires_credit: true, soft_cost: 1, premium_cost: 1, reset_period: "daily", sort_order: 170, category: "analysis", group_key: "workspace", icon_key: "browser", badge_label: "Pseudo", visible_to_guest: true, charge_unit: 1, charge_on_success_only: true, client_accumulate_units: false },
    { app_code: "find-dumps", feature_code: "workspace_diff", title: "Workspace diff", description: "So sánh hai snapshot để xem added, removed, changed", enabled: true, min_plan: "plus", requires_credit: true, soft_cost: 1, premium_cost: 1, reset_period: "daily", sort_order: 180, category: "analysis", group_key: "workspace", icon_key: "diff", badge_label: "Diff", visible_to_guest: true, charge_unit: 1, charge_on_success_only: true, client_accumulate_units: false },
  ],
  "free-fire": [
    { app_code: "free-fire", feature_code: "free_key", title: "Free key", description: "Luồng vượt free nhận key", enabled: true, min_plan: "classic", requires_credit: false, soft_cost: 0, premium_cost: 0, reset_period: "daily", sort_order: 10, category: "key", group_key: "free", icon_key: "key", badge_label: "Miễn phí", visible_to_guest: true, charge_unit: 1, charge_on_success_only: true, client_accumulate_units: false },
    { app_code: "free-fire", feature_code: "vip_2pass", title: "VIP 2-pass", description: "Loại key cần vượt 2 lượt", enabled: true, min_plan: "go", requires_credit: false, soft_cost: 0, premium_cost: 0, reset_period: "daily", sort_order: 20, category: "key", group_key: "vip", icon_key: "key", badge_label: "VIP", visible_to_guest: true, charge_unit: 1, charge_on_success_only: true, client_accumulate_units: false },
    { app_code: "free-fire", feature_code: "reset_key", title: "Reset key", description: "Khả năng reset nếu key cho phép", enabled: true, min_plan: "plus", requires_credit: true, soft_cost: 1, premium_cost: 1, reset_period: "daily", sort_order: 30, category: "key", group_key: "reset", icon_key: "reset", badge_label: "Thường", visible_to_guest: true, charge_unit: 1, charge_on_success_only: true, client_accumulate_units: false },
  ],
};

const WALLET_TEMPLATES: Record<string, ServerAppWalletRuleRow> = {
  "find-dumps": {
    app_code: "find-dumps",
    soft_wallet_label: "Credit thường",
    premium_wallet_label: "Credit kim cương",
    allow_decimal: true,
    soft_daily_reset_enabled: true,
    premium_daily_reset_enabled: true,
    soft_daily_reset_amount: 5,
    premium_daily_reset_amount: 5,
    consume_priority: 'soft_first',
    soft_daily_reset_mode: 'debt_floor',
    premium_daily_reset_mode: 'debt_floor',
    soft_floor_credit: 5,
    premium_floor_credit: 5,
    soft_allow_negative: true,
    premium_allow_negative: true,
    notes: "Credit âm được trừ nợ ở kỳ reset kế tiếp. Ưu tiên hao credit thường trước, credit kim cương sau.",
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
    consume_priority: 'soft_first',
    soft_daily_reset_mode: 'debt_floor',
    premium_daily_reset_mode: 'legacy_floor',
    soft_floor_credit: 3,
    premium_floor_credit: 0,
    soft_allow_negative: true,
    premium_allow_negative: false,
    notes: "Dùng decimal để tránh cảm giác lạm phát credit.",
  },
};

function appFallback(appCode?: string) {
  return APP_FALLBACKS.find((item) => item.code === appCode) ?? APP_FALLBACKS[0];
}

function numericInput(value: string | number | null | undefined) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? String(num) : "0";
}

function normalizeDecimal(value: string | number | null | undefined) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? Number(num.toFixed(2)) : 0;
}

function normalizeInteger(value: string | number | null | undefined, fallback = 1) {
  const num = Number(value ?? fallback);
  return Number.isFinite(num) ? Math.max(1, Math.trunc(num)) : fallback;
}

function ensureFeatures(appCode: string, rows: ServerAppFeatureRow[]) {
  if (rows.length) return [...rows].sort((a, b) => a.sort_order - b.sort_order);
  return FEATURE_TEMPLATES[appCode]?.map((row) => ({ ...row })) ?? [];
}

function ensureWallet(appCode: string, row?: ServerAppWalletRuleRow | null) {
  return row ? { ...row } : { ...(WALLET_TEMPLATES[appCode] ?? WALLET_TEMPLATES["find-dumps"]) };
}

function isPhaseMissingMessage(message?: string) {
  const raw = String(message ?? "").toLowerCase();
  return raw.includes("server_app") || raw.includes("wallet_rules") || raw.includes("charge_unit") || raw.includes("visible_to_guest");
}

export function AdminServerAppChargePage() {
  const { appCode = "find-dumps" } = useParams();
  const location = useLocation();
  const { toast } = useToast();
  const fallback = useMemo(() => appFallback(appCode), [appCode]);
  const [featuresDraft, setFeaturesDraft] = useState<ServerAppFeatureRow[]>(ensureFeatures(appCode, []));
  const [walletDraft, setWalletDraft] = useState<ServerAppWalletRuleRow>(ensureWallet(appCode));

  const appQuery = useQuery({
    queryKey: ["server-app-charge-app", appCode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("server_apps")
        .select("code,label,description,admin_url,public_enabled,notes")
        .eq("code", appCode)
        .maybeSingle();
      if (error) throw error;
      return (data as ServerAppRow | null) ?? fallback;
    },
  });

  const dataQuery = useQuery({
    queryKey: ["server-app-charge", appCode],
    queryFn: async () => {
      const [featuresRes, walletRes] = await Promise.all([
        supabase
          .from("server_app_features")
          .select("app_code,feature_code,title,description,enabled,min_plan,requires_credit,soft_cost,premium_cost,reset_period,sort_order,category,group_key,icon_key,badge_label,visible_to_guest,charge_unit,charge_on_success_only,client_accumulate_units")
          .eq("app_code", appCode)
          .order("sort_order", { ascending: true }),
        supabase
          .from("server_app_wallet_rules")
          .select("app_code,soft_wallet_label,premium_wallet_label,allow_decimal,soft_daily_reset_enabled,premium_daily_reset_enabled,soft_daily_reset_amount,premium_daily_reset_amount,consume_priority,soft_daily_reset_mode,premium_daily_reset_mode,soft_floor_credit,premium_floor_credit,soft_allow_negative,premium_allow_negative,notes")
          .eq("app_code", appCode)
          .maybeSingle(),
      ]);

      if (featuresRes.error) throw featuresRes.error;
      if (walletRes.error && walletRes.status !== 406) throw walletRes.error;

      return {
        features: ensureFeatures(appCode, (featuresRes.data as ServerAppFeatureRow[] | null) ?? []),
        wallet: ensureWallet(appCode, (walletRes.data as ServerAppWalletRuleRow | null) ?? null),
      };
    },
  });

  useEffect(() => {
    if (!dataQuery.data) return;
    setFeaturesDraft(dataQuery.data.features);
    setWalletDraft(dataQuery.data.wallet);
  }, [dataQuery.data, appCode]);

  const saveFeatures = useMutation({
    mutationFn: async () => {
      const payload = featuresDraft.map((feature) => ({
        app_code: appCode,
        feature_code: feature.feature_code.trim(),
        title: feature.title?.trim() || feature.feature_code.trim(),
        description: feature.description?.trim() || null,
        enabled: Boolean(feature.enabled),
        min_plan: feature.min_plan?.trim() || "classic",
        requires_credit: Boolean(feature.requires_credit),
        soft_cost: normalizeDecimal(feature.soft_cost),
        premium_cost: normalizeDecimal(feature.premium_cost),
        reset_period: feature.reset_period?.trim() || "daily",
        sort_order: normalizeInteger(feature.sort_order, 10),
        category: feature.category?.trim() || null,
        group_key: feature.group_key?.trim() || null,
        icon_key: feature.icon_key?.trim() || null,
        badge_label: feature.badge_label?.trim() || null,
        visible_to_guest: Boolean(feature.visible_to_guest ?? true),
        charge_unit: normalizeInteger(feature.charge_unit, 1),
        charge_on_success_only: Boolean(feature.charge_on_success_only ?? true),
        client_accumulate_units: Boolean(feature.client_accumulate_units ?? false),
      }));

      const { error } = await supabase
        .from("server_app_features")
        .upsert(payload, { onConflict: "app_code,feature_code" });
      if (error) throw error;
    },
    onSuccess: async () => {
      await dataQuery.refetch();
      toast({ title: "Đã lưu rule feature", description: `Feature charge của ${appCode} đã được cập nhật.` });
    },
    onError: (error: Error) => {
      const description = isPhaseMissingMessage(error.message)
        ? "Schema phase 9 chưa chạy trên Supabase. Hãy chạy migration rồi lưu lại."
        : error.message;
      toast({ title: "Lưu feature thất bại", description, variant: "destructive" });
    },
  });

  const saveWallet = useMutation({
    mutationFn: async () => {
      const payload = {
        app_code: appCode,
        soft_wallet_label: walletDraft.soft_wallet_label?.trim() || "Credit thường",
        premium_wallet_label: walletDraft.premium_wallet_label?.trim() || "Credit kim cương",
        allow_decimal: Boolean(walletDraft.allow_decimal ?? true),
        soft_daily_reset_enabled: Boolean(walletDraft.soft_daily_reset_enabled ?? true),
        premium_daily_reset_enabled: Boolean(walletDraft.premium_daily_reset_enabled ?? true),
        soft_daily_reset_amount: normalizeDecimal(walletDraft.soft_daily_reset_amount),
        premium_daily_reset_amount: normalizeDecimal(walletDraft.premium_daily_reset_amount),
        consume_priority: walletDraft.consume_priority === 'premium_first' ? 'premium_first' : 'soft_first',
        soft_daily_reset_mode: walletDraft.soft_daily_reset_mode === 'legacy_floor' ? 'legacy_floor' : 'debt_floor',
        premium_daily_reset_mode: walletDraft.premium_daily_reset_mode === 'legacy_floor' ? 'legacy_floor' : 'debt_floor',
        soft_floor_credit: normalizeDecimal(walletDraft.soft_floor_credit),
        premium_floor_credit: normalizeDecimal(walletDraft.premium_floor_credit),
        soft_allow_negative: Boolean(walletDraft.soft_allow_negative ?? true),
        premium_allow_negative: Boolean(walletDraft.premium_allow_negative ?? true),
        notes: walletDraft.notes?.trim() || null,
      };

      const { error } = await supabase
        .from("server_app_wallet_rules")
        .upsert(payload, { onConflict: "app_code" });
      if (error) throw error;
    },
    onSuccess: async () => {
      await dataQuery.refetch();
      toast({ title: "Đã lưu wallet rules", description: `Rule credit và debt của ${appCode} đã được cập nhật.` });
    },
    onError: (error: Error) => {
      const description = isPhaseMissingMessage(error.message)
        ? "Schema phase 9 chưa chạy trên Supabase. Hãy chạy migration rồi lưu lại."
        : error.message;
      toast({ title: "Lưu wallet rules thất bại", description, variant: "destructive" });
    },
  });

  const saveAll = async () => {
    await saveWallet.mutateAsync();
    await saveFeatures.mutateAsync();
    toast({ title: "Charge tab đã đồng bộ", description: "Rule ví và rule từng chức năng đã được lưu cùng nhau." });
  };

  const appLabel = appQuery.data?.label ?? fallback.label;
  const loading = dataQuery.isLoading || appQuery.isLoading;

  return (
    <div className="space-y-6">
      <Card className="rounded-[28px] border-slate-200/80 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-900">
                <Coins className="h-3.5 w-3.5" />
                Charge / Credit Rules
              </div>
              <CardTitle className="mt-3 text-2xl tracking-tight">{appLabel}</CardTitle>
              <CardDescription className="mt-2 max-w-3xl leading-6">
                Gom toàn bộ chỗ chỉnh hao credit, charge unit, guest visibility, debt floor và reset rule về đúng một tab. Dùng tab này là chính, đỡ phải lần sang nhiều nơi.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Phase 9</Badge>
              <Badge variant="outline">{featuresDraft.length} features</Badge>
              <Badge variant="outline">{walletDraft.consume_priority === 'premium_first' ? 'Ưu tiên VIP' : 'Ưu tiên thường'}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border bg-slate-50/70 p-4">
              <div className="text-sm font-medium">Mục đích tab này</div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                Chỉnh quy tắc charge cho từng chức năng và quy tắc ví tổng ngay trên app-host. Không cần nhớ vòng qua admin detail để tìm đúng ô nữa.
              </div>
            </div>
            <div className="rounded-2xl border bg-slate-50/70 p-4">
              <div className="text-sm font-medium">Cách dùng batch</div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                Đặt <span className="font-medium">charge unit = 5</span> và bật <span className="font-medium">cộng dồn local</span> nếu muốn 5 dòng mới sync 1 lần. App sẽ gom tại máy rồi mới gửi quantity lên server.
              </div>
            </div>
            <div className="rounded-2xl border bg-slate-50/70 p-4">
              <div className="text-sm font-medium">Debt floor</div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                Ví có thể âm nếu rule cho phép. Tới lần reset ngày mới, credit mặc định kéo lên floor và tự bù nợ trước. Nếu số dư lớn hơn floor thì không reset.
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={saveAll} disabled={saveFeatures.isPending || saveWallet.isPending || loading}>
              Lưu toàn bộ charge rules
            </Button>
            <Button variant="outline" onClick={() => saveWallet.mutate()} disabled={saveWallet.isPending || loading}>
              Lưu ví tổng
            </Button>
            <Button variant="outline" onClick={() => saveFeatures.mutate()} disabled={saveFeatures.isPending || loading}>
              Lưu feature rules
            </Button>
            <Button asChild variant="ghost">
              <Link to={location.pathname.replace(/\/charge$/, "/runtime")}>Quay về runtime</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card className="rounded-[28px] border-slate-200/80 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><ArrowLeftRight className="h-4 w-4" /> Rule ví tổng</CardTitle>
              <CardDescription>Thiết lập ưu tiên hao credit, floor reset và cho âm từng ví.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <div className="text-sm font-medium">Ưu tiên hao ví</div>
                <Select value={walletDraft.consume_priority || 'soft_first'} onValueChange={(value) => setWalletDraft((prev) => ({ ...prev, consume_priority: value === 'premium_first' ? 'premium_first' : 'soft_first' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="soft_first">Ưu tiên credit thường trước</SelectItem>
                    <SelectItem value="premium_first">Ưu tiên credit VIP trước</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Tên ví thường</div>
                  <Input value={walletDraft.soft_wallet_label || ""} onChange={(e) => setWalletDraft((prev) => ({ ...prev, soft_wallet_label: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Tên ví VIP</div>
                  <Input value={walletDraft.premium_wallet_label || ""} onChange={(e) => setWalletDraft((prev) => ({ ...prev, premium_wallet_label: e.target.value }))} />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl border p-3">
                <div>
                  <div className="font-medium">Cho decimal</div>
                  <div className="text-xs text-muted-foreground">Bật nếu muốn 0.2, 0.5... để gom dần trước khi thành 1 credit.</div>
                </div>
                <Switch checked={Boolean(walletDraft.allow_decimal ?? true)} onCheckedChange={(value) => setWalletDraft((prev) => ({ ...prev, allow_decimal: value }))} />
              </div>

              <div className="rounded-2xl border p-4 space-y-4">
                <div className="font-medium">Ví thường</div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><div className="text-sm font-medium">Reset amount</div><Input value={numericInput(walletDraft.soft_daily_reset_amount)} onChange={(e) => setWalletDraft((prev) => ({ ...prev, soft_daily_reset_amount: e.target.value }))} /></div>
                  <div className="space-y-2"><div className="text-sm font-medium">Floor credit</div><Input value={numericInput(walletDraft.soft_floor_credit)} onChange={(e) => setWalletDraft((prev) => ({ ...prev, soft_floor_credit: e.target.value }))} /></div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Reset mode</div>
                    <Select value={walletDraft.soft_daily_reset_mode || 'debt_floor'} onValueChange={(value) => setWalletDraft((prev) => ({ ...prev, soft_daily_reset_mode: value === 'legacy_floor' ? 'legacy_floor' : 'debt_floor' }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="debt_floor">Debt floor</SelectItem>
                        <SelectItem value="legacy_floor">Legacy floor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border p-3">
                    <div>
                      <div className="font-medium">Cho âm ví thường</div>
                      <div className="text-xs text-muted-foreground">Âm credit và tự trừ nợ ở lần reset kế tiếp.</div>
                    </div>
                    <Switch checked={Boolean(walletDraft.soft_allow_negative ?? true)} onCheckedChange={(value) => setWalletDraft((prev) => ({ ...prev, soft_allow_negative: value }))} />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-2xl border p-3">
                  <div>
                    <div className="font-medium">Bật reset ví thường</div>
                    <div className="text-xs text-muted-foreground">Nếu tắt thì ví thường chỉ thay đổi khi cộng/trừ thật.</div>
                  </div>
                  <Switch checked={Boolean(walletDraft.soft_daily_reset_enabled ?? true)} onCheckedChange={(value) => setWalletDraft((prev) => ({ ...prev, soft_daily_reset_enabled: value }))} />
                </div>
              </div>

              <div className="rounded-2xl border p-4 space-y-4">
                <div className="font-medium">Ví VIP / kim cương</div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><div className="text-sm font-medium">Reset amount</div><Input value={numericInput(walletDraft.premium_daily_reset_amount)} onChange={(e) => setWalletDraft((prev) => ({ ...prev, premium_daily_reset_amount: e.target.value }))} /></div>
                  <div className="space-y-2"><div className="text-sm font-medium">Floor credit</div><Input value={numericInput(walletDraft.premium_floor_credit)} onChange={(e) => setWalletDraft((prev) => ({ ...prev, premium_floor_credit: e.target.value }))} /></div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Reset mode</div>
                    <Select value={walletDraft.premium_daily_reset_mode || 'debt_floor'} onValueChange={(value) => setWalletDraft((prev) => ({ ...prev, premium_daily_reset_mode: value === 'legacy_floor' ? 'legacy_floor' : 'debt_floor' }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="debt_floor">Debt floor</SelectItem>
                        <SelectItem value="legacy_floor">Legacy floor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border p-3">
                    <div>
                      <div className="font-medium">Cho âm ví VIP</div>
                      <div className="text-xs text-muted-foreground">Dùng khi muốn app có thể nợ kim cương rồi trừ sau.</div>
                    </div>
                    <Switch checked={Boolean(walletDraft.premium_allow_negative ?? true)} onCheckedChange={(value) => setWalletDraft((prev) => ({ ...prev, premium_allow_negative: value }))} />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-2xl border p-3">
                  <div>
                    <div className="font-medium">Bật reset ví VIP</div>
                    <div className="text-xs text-muted-foreground">Nếu tắt thì ví VIP chỉ đổi theo consume/top-up.</div>
                  </div>
                  <Switch checked={Boolean(walletDraft.premium_daily_reset_enabled ?? true)} onCheckedChange={(value) => setWalletDraft((prev) => ({ ...prev, premium_daily_reset_enabled: value }))} />
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Ghi chú vận hành</div>
                <Textarea rows={6} value={walletDraft.notes || ""} onChange={(e) => setWalletDraft((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Ví dụ: mặc định reset về 5, nếu đang âm thì ưu tiên trừ nợ trước. Credit thường dùng trước, VIP dùng sau." />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-[28px] border-slate-200/80 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-4 w-4" /> Rule từng chức năng</CardTitle>
              <CardDescription>Chỗ chỉnh chính cho giá credit, guest visibility, charge unit và accumulate local.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? <div className="text-sm text-muted-foreground">Đang tải rule...</div> : null}
              {featuresDraft.map((feature, index) => (
                <div key={feature.feature_code} className="rounded-[24px] border p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold">{feature.title}</div>
                        <Badge variant="outline">{feature.feature_code}</Badge>
                        {feature.badge_label ? <Badge variant="secondary">{feature.badge_label}</Badge> : null}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">{feature.description || "Chưa có mô tả."}</div>
                    </div>
                    <div className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5" />
                      sort {feature.sort_order}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    <div className="space-y-2"><div className="text-sm font-medium">Credit thường</div><Input value={numericInput(feature.soft_cost)} onChange={(e) => setFeaturesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, soft_cost: e.target.value } : item))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Credit VIP</div><Input value={numericInput(feature.premium_cost)} onChange={(e) => setFeaturesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, premium_cost: e.target.value } : item))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Charge unit</div><Input value={String(feature.charge_unit ?? 1)} onChange={(e) => setFeaturesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, charge_unit: Number(e.target.value || 1) } : item))} placeholder="1 hoặc 5" /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Category</div><Input value={feature.category || ""} onChange={(e) => setFeaturesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, category: e.target.value } : item))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Group key</div><Input value={feature.group_key || ""} onChange={(e) => setFeaturesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, group_key: e.target.value } : item))} /></div>
                    <div className="space-y-2"><div className="text-sm font-medium">Icon key</div><Input value={feature.icon_key || ""} onChange={(e) => setFeaturesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, icon_key: e.target.value } : item))} /></div>
                  </div>

                  <div className="mt-4 grid gap-3 xl:grid-cols-2">
                    <div className="flex items-center justify-between rounded-2xl border p-3"><div><div className="font-medium">Bật feature</div><div className="text-xs text-muted-foreground">Tắt nếu muốn app ẩn hoàn toàn thao tác này.</div></div><Switch checked={Boolean(feature.enabled)} onCheckedChange={(value) => setFeaturesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: value } : item))} /></div>
                    <div className="flex items-center justify-between rounded-2xl border p-3"><div><div className="font-medium">Hiện cho guest</div><div className="text-xs text-muted-foreground">Tắt nếu guest chỉ được nhìn app nhưng không thấy tool này.</div></div><Switch checked={Boolean(feature.visible_to_guest ?? true)} onCheckedChange={(value) => setFeaturesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, visible_to_guest: value } : item))} /></div>
                    <div className="flex items-center justify-between rounded-2xl border p-3"><div><div className="font-medium">Feature cần credit</div><div className="text-xs text-muted-foreground">Nếu tắt thì giá credit sẽ coi như 0.</div></div><Switch checked={Boolean(feature.requires_credit)} onCheckedChange={(value) => setFeaturesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, requires_credit: value } : item))} /></div>
                    <div className="flex items-center justify-between rounded-2xl border p-3"><div><div className="font-medium">Charge khi thành công</div><div className="text-xs text-muted-foreground">Chỉ sync charge sau khi thao tác chạy xong.</div></div><Switch checked={Boolean(feature.charge_on_success_only ?? true)} onCheckedChange={(value) => setFeaturesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, charge_on_success_only: value } : item))} /></div>
                    <div className="flex items-center justify-between rounded-2xl border p-3 xl:col-span-2"><div><div className="font-medium">Cộng dồn local</div><div className="text-xs text-muted-foreground">Dùng cho batch hoặc tool kiểu đủ N lần mới charge 1 lần. App sẽ tích tại máy rồi gửi quantity lên server.</div></div><Switch checked={Boolean(feature.client_accumulate_units ?? false)} onCheckedChange={(value) => setFeaturesDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, client_accumulate_units: value } : item))} /></div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
