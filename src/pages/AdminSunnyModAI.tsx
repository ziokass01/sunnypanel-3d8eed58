import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, KeyRound, RefreshCw, ShieldCheck, TerminalSquare, Trash2, Users, WalletCards, Search } from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { postFunction } from "@/lib/functions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const MODEL_OPTIONS = ["mimo-v2.5", "mimo-v2.5-pro", "mimo-v2-pro", "mimo-v2-omni", "mimo-v2.5-tts"] as const;
const STATUS_OPTIONS = [
  { value: "active", label: "active - đang mở" },
  { value: "blocked", label: "blocked - khóa user" },
  { value: "disabled", label: "disabled - tắt quyền" },
] as const;

type AdminDashboard = {
  ok: boolean;
  config: any;
  plans: any[];
  keys: any[];
  accesses: any[];
  usage_logs: any[];
  redeem_logs: any[];
  sandbox_sessions: any[];
  stats: any;
};

type TabKey = "overview" | "plans" | "keys" | "users" | "logs" | "sandbox";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function numberText(value: any) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("vi-VN").format(n);
}

function csvToArrayText(value: any) {
  if (Array.isArray(value)) return value.join(",");
  return String(value ?? "");
}

function activeBadge(status?: string | null) {
  const s = String(status ?? "");
  if (s === "active" || s === "ok") return <Badge>active</Badge>;
  if (s === "blocked" || s === "disabled" || s === "error") return <Badge variant="destructive">{s}</Badge>;
  return <Badge variant="outline">{s || "-"}</Badge>;
}

function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function normalizeAccessForSubmit(access: any) {
  return {
    ...access,
    plan_code: String(access.plan_code || "free").trim().toLowerCase(),
    status: String(access.status || "active").trim().toLowerCase(),
    daily_token_limit_override: access.daily_token_limit_override === "" ? null : access.daily_token_limit_override,
    daily_message_limit_override: access.daily_message_limit_override === "" ? null : access.daily_message_limit_override,
    daily_ip_limit_override: access.daily_ip_limit_override === "" ? null : access.daily_ip_limit_override,
    daily_device_limit_override: access.daily_device_limit_override === "" ? null : access.daily_device_limit_override,
    expires_at: access.expires_at ? new Date(access.expires_at).toISOString() : null,
  };
}

export function AdminSunnyModAIPage() {
  const { session } = useAuth();
  const { toast } = useToast();
  const token = session?.access_token ?? null;
  const initialTab = useMemo<TabKey>(() => {
    if (typeof window === "undefined") return "overview";
    const raw = new URLSearchParams(window.location.search).get("tab") as TabKey | null;
    return (["overview", "plans", "keys", "users", "logs", "sandbox"] as TabKey[]).includes(raw as TabKey) ? (raw as TabKey) : "overview";
  }, []);
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [lastCreatedKey, setLastCreatedKey] = useState("");
  const [lookupResult, setLookupResult] = useState<any | null>(null);

  const dashboardQuery = useQuery({
    queryKey: ["admin-ai-sunny-dashboard"],
    enabled: Boolean(token),
    queryFn: async () => postFunction<AdminDashboard>("/admin-ai-sunny-control", { action: "dashboard" }, { authToken: token }),
  });

  const data = dashboardQuery.data;
  const config = data?.config ?? {};
  const plans = data?.plans ?? [];
  const keys = data?.keys ?? [];
  const accesses = data?.accesses ?? [];
  const usageLogs = data?.usage_logs ?? [];
  const redeemLogs = data?.redeem_logs ?? [];
  const sandboxSessions = data?.sandbox_sessions ?? [];

  const [configDraft, setConfigDraft] = useState<any | null>(null);
  const effectiveConfig = configDraft ?? config;

  const defaultPlanCode = plans.find((p) => p.plan_code === "free")?.plan_code ?? plans[0]?.plan_code ?? "free";

  const [planDraft, setPlanDraft] = useState<any>({
    plan_code: "free",
    label: "Free Coding",
    description: "Gói free sau khi đăng nhập: chat thử khoảng vài chục tin/ngày.",
    enabled: true,
    daily_token_limit: 40000,
    daily_message_limit: 30,
    max_tokens_per_request: 800,
    max_input_chars: 6000,
    allowed_models: "mimo-v2.5",
    sandbox_enabled: false,
    terminal_enabled: false,
    tts_enabled: false,
    price_label: "Free",
    sort_order: 10,
  });

  const [keyDraft, setKeyDraft] = useState<any>({
    prefix: "AI-SUNNY",
    code: "",
    title: "Key vượt SunnyMod AI",
    plan_code_to_grant: "free",
    grant_hours: 24,
    bonus_daily_tokens: 40000,
    bonus_daily_messages: 30,
    max_uses_total: 1,
    max_uses_per_day: 1,
    daily_ip_limit: 1,
    daily_device_limit: 1,
    per_user_once: true,
    require_device_id: true,
    expires_at: "",
    note: "",
  });

  const [accessDraft, setAccessDraft] = useState<any>({
    id: "",
    user_id: "",
    email: "",
    plan_code: "free",
    status: "active",
    daily_token_limit_override: "",
    daily_message_limit_override: "",
    daily_ip_limit_override: "",
    daily_device_limit_override: "",
    expires_at: "",
    note: "",
  });

  useEffect(() => {
    if (!accessDraft.plan_code || accessDraft.plan_code === "trial") {
      setAccessDraft((prev: any) => ({ ...prev, plan_code: defaultPlanCode }));
    }
  }, [defaultPlanCode]);

  const runAdminAction = useMutation({
    mutationFn: async (payload: any) => postFunction<any>("/admin-ai-sunny-control", payload, { authToken: token }),
    onSuccess: async (res: any) => {
      if (res?.raw_code) setLastCreatedKey(String(res.raw_code));
      toast({ title: "Đã lưu", description: "SunnyMod AI control đã cập nhật." });
      await dashboardQuery.refetch();
    },
    onError: (e: any) => toast({ title: "Lỗi", description: e?.message ?? "Không thể cập nhật AI control.", variant: "destructive" }),
  });

  const lookupUser = useMutation({
    mutationFn: async () => postFunction<any>("/admin-ai-sunny-control", {
      action: "lookup_user_access",
      user_id: accessDraft.user_id,
      email: accessDraft.email,
    }, { authToken: token }),
    onSuccess: (res: any) => {
      const user = res?.user ?? null;
      const access = res?.access ?? null;
      setLookupResult(res);
      if (!user?.id && !access?.user_id) {
        toast({ title: "Không thấy tài khoản", description: "Email/User ID này chưa có trong Supabase Auth.", variant: "destructive" });
        return;
      }
      setAccessDraft((prev: any) => ({
        ...prev,
        ...(access ?? {}),
        user_id: access?.user_id ?? user?.id ?? prev.user_id,
        email: access?.email ?? user?.email ?? prev.email,
        plan_code: access?.plan_code ?? prev.plan_code ?? defaultPlanCode,
        status: access?.status ?? prev.status ?? "active",
        expires_at: toDateTimeLocal(access?.expires_at),
        daily_token_limit_override: access?.daily_token_limit_override ?? "",
        daily_message_limit_override: access?.daily_message_limit_override ?? "",
        daily_ip_limit_override: access?.daily_ip_limit_override ?? "",
        daily_device_limit_override: access?.daily_device_limit_override ?? "",
        note: access?.note ?? prev.note ?? "",
      }));
      toast({ title: "Đã tìm thấy", description: access ? "Đã tải quyền hiện tại của user." : "Tài khoản tồn tại, chưa có quyền AI." });
    },
    onError: (e: any) => toast({ title: "Tìm user lỗi", description: e?.message ?? "Không tìm được user.", variant: "destructive" }),
  });

  const deleteAccess = useMutation({
    mutationFn: async (payload: any) => postFunction<any>("/admin-ai-sunny-control", { action: "delete_user_access", ...payload }, { authToken: token }),
    onSuccess: async () => {
      toast({ title: "Đã xóa quyền", description: "User không còn quyền AI riêng." });
      setAccessDraft((prev: any) => ({ ...prev, id: "", plan_code: defaultPlanCode, status: "active" }));
      await dashboardQuery.refetch();
    },
    onError: (e: any) => toast({ title: "Xóa lỗi", description: e?.message ?? "Không xóa được quyền user.", variant: "destructive" }),
  });

  const tabs = useMemo(() => ([
    { key: "overview" as TabKey, label: "Tổng quan", icon: Bot },
    { key: "plans" as TabKey, label: "Gói AI", icon: WalletCards },
    { key: "keys" as TabKey, label: "Key vượt", icon: KeyRound },
    { key: "users" as TabKey, label: "Người dùng", icon: Users },
    { key: "logs" as TabKey, label: "Usage logs", icon: ShieldCheck },
    { key: "sandbox" as TabKey, label: "Sandbox", icon: TerminalSquare },
  ]), []);

  const fillPlan = (p: any) => {
    setPlanDraft({ ...p, allowed_models: csvToArrayText(p.allowed_models) });
    setTab("plans");
  };

  const fillAccess = (a: any) => {
    setAccessDraft({
      ...a,
      expires_at: toDateTimeLocal(a.expires_at),
      daily_token_limit_override: a.daily_token_limit_override ?? "",
      daily_message_limit_override: a.daily_message_limit_override ?? "",
      daily_ip_limit_override: a.daily_ip_limit_override ?? "",
      daily_device_limit_override: a.daily_device_limit_override ?? "",
    });
    setLookupResult({ user: { id: a.user_id, email: a.email }, access: a });
    setTab("users");
  };

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Đã copy key." });
  };

  const saveAccess = (patch?: any) => {
    const next = normalizeAccessForSubmit({ ...accessDraft, ...(patch ?? {}) });
    runAdminAction.mutate({ action: "set_user_access", access: next });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">SunnyMod Coding AI</h1>
          <p className="mt-1 text-sm text-slate-500">Trung tâm điều khiển AI: gói, key vượt, user access, giới hạn IP/thiết bị/lượt/ngày và usage log. Tách riêng, không đụng Free/Rent/Fake Lag.</p>
        </div>
        <Button variant="soft" onClick={() => dashboardQuery.refetch()} disabled={dashboardQuery.isFetching}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>Token hôm nay</CardDescription><CardTitle>{numberText(data?.stats?.today_tokens)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Tin hôm nay</CardDescription><CardTitle>{numberText(data?.stats?.today_messages)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>User đang mở</CardDescription><CardTitle>{numberText(data?.stats?.active_access_count)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Key active</CardDescription><CardTitle>{numberText(data?.stats?.active_key_count)}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-2 pt-4">
          {tabs.map((item) => {
            const Icon = item.icon;
            return <Button key={item.key} variant={tab === item.key ? "default" : "soft"} onClick={() => setTab(item.key)}><Icon className="mr-2 h-4 w-4" /> {item.label}</Button>;
          })}
        </CardContent>
      </Card>

      {tab === "overview" && (
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader><CardTitle>Cấu hình server AI</CardTitle><CardDescription>Bật/tắt toàn hệ thống, base URL, model mặc định và kill-switch sandbox.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center justify-between rounded-2xl border p-3"><div><Label>AI Enabled</Label><p className="text-xs text-muted-foreground">Tắt là chặn mọi request.</p></div><Switch checked={Boolean(effectiveConfig.enabled ?? true)} onCheckedChange={(v) => setConfigDraft({ ...effectiveConfig, enabled: v })} /></div>
                <div className="flex items-center justify-between rounded-2xl border p-3"><div><Label>Public Enabled</Label><p className="text-xs text-muted-foreground">Cho user dùng trang /coding-ai.</p></div><Switch checked={Boolean(effectiveConfig.public_enabled ?? true)} onCheckedChange={(v) => setConfigDraft({ ...effectiveConfig, public_enabled: v })} /></div>
                <div className="flex items-center justify-between rounded-2xl border p-3"><div><Label>Sandbox Global</Label><p className="text-xs text-muted-foreground">Chỉ bật khi đã khóa an toàn.</p></div><Switch checked={Boolean(effectiveConfig.sandbox_global_enabled ?? false)} onCheckedChange={(v) => setConfigDraft({ ...effectiveConfig, sandbox_global_enabled: v })} /></div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label>Base URL MiMo</Label><Input value={effectiveConfig.mimo_base_url ?? "https://token-plan-sgp.xiaomimimo.com/v1"} onChange={(e) => setConfigDraft({ ...effectiveConfig, mimo_base_url: e.target.value })} /></div>
                <div className="space-y-2"><Label>Default model</Label><Input value={effectiveConfig.default_model ?? "mimo-v2.5"} onChange={(e) => setConfigDraft({ ...effectiveConfig, default_model: e.target.value })} /></div>
                <div className="space-y-2"><Label>Pro model</Label><Input value={effectiveConfig.pro_model ?? "mimo-v2.5-pro"} onChange={(e) => setConfigDraft({ ...effectiveConfig, pro_model: e.target.value })} /></div>
                <div className="space-y-2"><Label>Global daily token limit</Label><Input type="number" value={effectiveConfig.global_daily_token_limit ?? 80000000} onChange={(e) => setConfigDraft({ ...effectiveConfig, global_daily_token_limit: Number(e.target.value) })} /></div>
                <div className="space-y-2"><Label>Monthly stop at tokens</Label><Input type="number" value={effectiveConfig.global_monthly_stop_at_tokens ?? 1500000000} onChange={(e) => setConfigDraft({ ...effectiveConfig, global_monthly_stop_at_tokens: Number(e.target.value) })} /></div>
                <div className="space-y-2"><Label>Max input chars</Label><Input type="number" value={effectiveConfig.max_input_chars ?? 24000} onChange={(e) => setConfigDraft({ ...effectiveConfig, max_input_chars: Number(e.target.value) })} /></div>
              </div>
              <div className="space-y-2"><Label>Maintenance message</Label><Input value={effectiveConfig.maintenance_message ?? ""} onChange={(e) => setConfigDraft({ ...effectiveConfig, maintenance_message: e.target.value })} /></div>
              <div className="space-y-2"><Label>System prompt</Label><Textarea rows={5} value={effectiveConfig.system_prompt ?? ""} onChange={(e) => setConfigDraft({ ...effectiveConfig, system_prompt: e.target.value })} /></div>
              <Button onClick={() => runAdminAction.mutate({ action: "save_config", config: effectiveConfig })} disabled={runAdminAction.isPending}>Lưu cấu hình AI</Button>
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle>Model đang hỗ trợ</CardTitle><CardDescription>Chỉ cho user chọn model nằm trong gói.</CardDescription></CardHeader><CardContent className="space-y-2">{MODEL_OPTIONS.map((m) => <Badge key={m} variant="secondary" className="mr-2">{m}</Badge>)}<div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">Sandbox/Terminal để gói Max nhưng mặc định global tắt. Khi bật phải đảm bảo không có service key/env production trong sandbox.</div></CardContent></Card>
        </div>
      )}

      {tab === "plans" && (
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <CardHeader><CardTitle>Tạo/sửa gói AI</CardTitle><CardDescription>Cấp model, token/ngày, message/ngày và quyền sandbox.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1"><Label>Plan code</Label><Input value={planDraft.plan_code} onChange={(e) => setPlanDraft({ ...planDraft, plan_code: e.target.value })} /></div>
                <div className="space-y-1"><Label>Label</Label><Input value={planDraft.label} onChange={(e) => setPlanDraft({ ...planDraft, label: e.target.value })} /></div>
                <div className="space-y-1"><Label>Daily tokens</Label><Input type="number" value={planDraft.daily_token_limit} onChange={(e) => setPlanDraft({ ...planDraft, daily_token_limit: Number(e.target.value) })} /></div>
                <div className="space-y-1"><Label>Daily messages</Label><Input type="number" value={planDraft.daily_message_limit} onChange={(e) => setPlanDraft({ ...planDraft, daily_message_limit: Number(e.target.value) })} /></div>
                <div className="space-y-1"><Label>Max tokens/request</Label><Input type="number" value={planDraft.max_tokens_per_request} onChange={(e) => setPlanDraft({ ...planDraft, max_tokens_per_request: Number(e.target.value) })} /></div>
                <div className="space-y-1"><Label>Max input chars</Label><Input type="number" value={planDraft.max_input_chars} onChange={(e) => setPlanDraft({ ...planDraft, max_input_chars: Number(e.target.value) })} /></div>
              </div>
              <div className="space-y-1"><Label>Allowed models, phân tách dấu phẩy</Label><Input value={csvToArrayText(planDraft.allowed_models)} onChange={(e) => setPlanDraft({ ...planDraft, allowed_models: e.target.value })} /></div>
              <div className="space-y-1"><Label>Description</Label><Textarea value={planDraft.description} onChange={(e) => setPlanDraft({ ...planDraft, description: e.target.value })} /></div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="flex items-center justify-between rounded-xl border p-3"><Label>Enabled</Label><Switch checked={Boolean(planDraft.enabled)} onCheckedChange={(v) => setPlanDraft({ ...planDraft, enabled: v })} /></div>
                <div className="flex items-center justify-between rounded-xl border p-3"><Label>Sandbox</Label><Switch checked={Boolean(planDraft.sandbox_enabled)} onCheckedChange={(v) => setPlanDraft({ ...planDraft, sandbox_enabled: v })} /></div>
                <div className="flex items-center justify-between rounded-xl border p-3"><Label>Terminal</Label><Switch checked={Boolean(planDraft.terminal_enabled)} onCheckedChange={(v) => setPlanDraft({ ...planDraft, terminal_enabled: v })} /></div>
              </div>
              <Button onClick={() => runAdminAction.mutate({ action: "upsert_plan", plan: planDraft })} disabled={runAdminAction.isPending}>Lưu gói</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Danh sách gói</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table><TableHeader><TableRow><TableHead>Gói</TableHead><TableHead>Models</TableHead><TableHead>Limit/ngày</TableHead><TableHead>Sandbox</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>{plans.map((p) => <TableRow key={p.plan_code}><TableCell><div className="font-medium">{p.label}</div><div className="text-xs text-muted-foreground">{p.plan_code}</div></TableCell><TableCell className="max-w-[260px] truncate">{csvToArrayText(p.allowed_models)}</TableCell><TableCell>{numberText(p.daily_token_limit)} / {numberText(p.daily_message_limit)} tin</TableCell><TableCell>{p.sandbox_enabled ? <Badge>on</Badge> : <Badge variant="outline">off</Badge>}</TableCell><TableCell><Button size="sm" variant="soft" onClick={() => fillPlan(p)}>Sửa</Button></TableCell></TableRow>)}</TableBody></Table>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "keys" && (
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <CardHeader><CardTitle>Tạo key vượt mở token</CardTitle><CardDescription>Chỉnh giới hạn IP, thiết bị, lượt dùng/ngày giống flow Fake Lag nhưng tách riêng.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {lastCreatedKey && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><div className="font-semibold">Key mới tạo, chỉ hiện lần này:</div><div className="mt-1 break-all font-mono">{lastCreatedKey}</div><Button size="sm" className="mt-2" onClick={() => copyText(lastCreatedKey)}>Copy key</Button></div>}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1"><Label>Prefix</Label><Input value={keyDraft.prefix} onChange={(e) => setKeyDraft({ ...keyDraft, prefix: e.target.value })} /></div>
                <div className="space-y-1"><Label>Key thủ công, bỏ trống để tự tạo</Label><Input value={keyDraft.code} onChange={(e) => setKeyDraft({ ...keyDraft, code: e.target.value })} /></div>
                <div className="space-y-1"><Label>Title</Label><Input value={keyDraft.title} onChange={(e) => setKeyDraft({ ...keyDraft, title: e.target.value })} /></div>
                <div className="space-y-1"><Label>Grant plan</Label><Select value={keyDraft.plan_code_to_grant} onValueChange={(v) => setKeyDraft({ ...keyDraft, plan_code_to_grant: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{plans.map((p) => <SelectItem key={p.plan_code} value={p.plan_code}>{p.label} ({p.plan_code})</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1"><Label>Grant hours</Label><Input type="number" value={keyDraft.grant_hours} onChange={(e) => setKeyDraft({ ...keyDraft, grant_hours: Number(e.target.value) })} /></div>
                <div className="space-y-1"><Label>Bonus tokens/ngày</Label><Input type="number" value={keyDraft.bonus_daily_tokens} onChange={(e) => setKeyDraft({ ...keyDraft, bonus_daily_tokens: Number(e.target.value) })} /></div>
                <div className="space-y-1"><Label>Bonus messages/ngày</Label><Input type="number" value={keyDraft.bonus_daily_messages} onChange={(e) => setKeyDraft({ ...keyDraft, bonus_daily_messages: Number(e.target.value) })} /></div>
                <div className="space-y-1"><Label>Max uses total</Label><Input type="number" value={keyDraft.max_uses_total} onChange={(e) => setKeyDraft({ ...keyDraft, max_uses_total: Number(e.target.value) })} /></div>
                <div className="space-y-1"><Label>Max uses/day</Label><Input type="number" value={keyDraft.max_uses_per_day} onChange={(e) => setKeyDraft({ ...keyDraft, max_uses_per_day: Number(e.target.value) })} /></div>
                <div className="space-y-1"><Label>Daily IP limit</Label><Input type="number" value={keyDraft.daily_ip_limit} onChange={(e) => setKeyDraft({ ...keyDraft, daily_ip_limit: Number(e.target.value) })} /></div>
                <div className="space-y-1"><Label>Daily device limit</Label><Input type="number" value={keyDraft.daily_device_limit} onChange={(e) => setKeyDraft({ ...keyDraft, daily_device_limit: Number(e.target.value) })} /></div>
                <div className="space-y-1"><Label>Expires at ISO hoặc bỏ trống</Label><Input value={keyDraft.expires_at} onChange={(e) => setKeyDraft({ ...keyDraft, expires_at: e.target.value })} /></div>
              </div>
              <div className="grid gap-3 md:grid-cols-2"><div className="flex items-center justify-between rounded-xl border p-3"><Label>Mỗi user 1 lần</Label><Switch checked={Boolean(keyDraft.per_user_once)} onCheckedChange={(v) => setKeyDraft({ ...keyDraft, per_user_once: v })} /></div><div className="flex items-center justify-between rounded-xl border p-3"><Label>Bắt buộc device</Label><Switch checked={Boolean(keyDraft.require_device_id)} onCheckedChange={(v) => setKeyDraft({ ...keyDraft, require_device_id: v })} /></div></div>
              <div className="space-y-1"><Label>Note</Label><Textarea value={keyDraft.note} onChange={(e) => setKeyDraft({ ...keyDraft, note: e.target.value })} /></div>
              <Button onClick={() => runAdminAction.mutate({ action: "create_redeem_key", key: keyDraft })} disabled={runAdminAction.isPending}>Tạo key vượt</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Key đã tạo</CardTitle><CardDescription>Key disabled/blocked có thể mở lại ngay tại đây.</CardDescription></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table><TableHeader><TableRow><TableHead>Key</TableHead><TableHead>Gói</TableHead><TableHead>Limit</TableHead><TableHead>Used</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>{keys.map((k) => <TableRow key={k.id}><TableCell><div className="font-mono text-xs">{k.code_mask}</div><div className="text-xs text-muted-foreground">{k.title}</div></TableCell><TableCell>{k.plan_code_to_grant}<div className="text-xs text-muted-foreground">{k.grant_hours}h</div></TableCell><TableCell>IP {k.daily_ip_limit} / Device {k.daily_device_limit}<div className="text-xs text-muted-foreground">day {k.max_uses_per_day}, total {k.max_uses_total}</div></TableCell><TableCell>{numberText(k.used_count)}</TableCell><TableCell>{activeBadge(k.status)}</TableCell><TableCell className="space-x-2">{k.status === "active" ? <Button size="sm" variant="destructive" onClick={() => runAdminAction.mutate({ action: "update_redeem_key_status", id: k.id, status: "disabled" })}>Block</Button> : <Button size="sm" variant="soft" onClick={() => runAdminAction.mutate({ action: "update_redeem_key_status", id: k.id, status: "active" })}>Mở block</Button>}</TableCell></TableRow>)}</TableBody></Table>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "users" && (
        <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <Card>
            <CardHeader><CardTitle>Cấp/mở quyền user</CardTitle><CardDescription>Nhập email hoặc User ID rồi bấm tìm. Nếu đúng tài khoản, form sẽ tự điền user thật trước khi lưu.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1"><Label>User ID Supabase</Label><Input value={accessDraft.user_id} onChange={(e) => setAccessDraft({ ...accessDraft, user_id: e.target.value })} /></div>
              <div className="space-y-1"><Label>Email</Label><Input value={accessDraft.email ?? ""} onChange={(e) => setAccessDraft({ ...accessDraft, email: e.target.value })} /></div>
              <Button type="button" variant="soft" onClick={() => lookupUser.mutate()} disabled={lookupUser.isPending}><Search className="mr-2 h-4 w-4" /> Tìm tài khoản</Button>
              {lookupResult?.user && <div className="rounded-2xl border bg-slate-50 p-3 text-sm"><div className="font-medium">Đã xác thực tài khoản</div><div>Email: {lookupResult.user.email || accessDraft.email}</div><div className="break-all font-mono text-xs text-muted-foreground">User ID: {lookupResult.user.id || accessDraft.user_id}</div></div>}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1"><Label>Plan</Label><Select value={accessDraft.plan_code || defaultPlanCode} onValueChange={(v) => setAccessDraft({ ...accessDraft, plan_code: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{plans.map((p) => <SelectItem key={p.plan_code} value={p.plan_code}>{p.label} ({p.plan_code})</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1"><Label>Status</Label><Select value={accessDraft.status || "active"} onValueChange={(v) => setAccessDraft({ ...accessDraft, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1"><Label>Override tokens/ngày</Label><Input type="number" value={accessDraft.daily_token_limit_override ?? ""} onChange={(e) => setAccessDraft({ ...accessDraft, daily_token_limit_override: e.target.value })} /></div>
                <div className="space-y-1"><Label>Override messages/ngày</Label><Input type="number" value={accessDraft.daily_message_limit_override ?? ""} onChange={(e) => setAccessDraft({ ...accessDraft, daily_message_limit_override: e.target.value })} /></div>
                <div className="space-y-1"><Label>IP limit/ngày</Label><Input type="number" value={accessDraft.daily_ip_limit_override ?? ""} onChange={(e) => setAccessDraft({ ...accessDraft, daily_ip_limit_override: e.target.value })} /></div>
                <div className="space-y-1"><Label>Device limit/ngày</Label><Input type="number" value={accessDraft.daily_device_limit_override ?? ""} onChange={(e) => setAccessDraft({ ...accessDraft, daily_device_limit_override: e.target.value })} /></div>
                <div className="space-y-1 md:col-span-2"><Label>Expires at</Label><Input type="datetime-local" value={accessDraft.expires_at ?? ""} onChange={(e) => setAccessDraft({ ...accessDraft, expires_at: e.target.value })} /></div>
              </div>
              <div className="space-y-1"><Label>Note</Label><Textarea value={accessDraft.note ?? ""} onChange={(e) => setAccessDraft({ ...accessDraft, note: e.target.value })} /></div>
              <div className="flex flex-wrap gap-2"><Button onClick={() => saveAccess()} disabled={runAdminAction.isPending}>Lưu quyền user</Button><Button variant="destructive" onClick={() => saveAccess({ status: "blocked" })} disabled={!accessDraft.user_id || runAdminAction.isPending}>Block</Button><Button variant="soft" onClick={() => saveAccess({ status: "active" })} disabled={!accessDraft.user_id || runAdminAction.isPending}>Mở block</Button><Button variant="outline" onClick={() => deleteAccess.mutate({ id: accessDraft.id, user_id: accessDraft.user_id })} disabled={!accessDraft.user_id || deleteAccess.isPending}><Trash2 className="mr-2 h-4 w-4" /> Xóa quyền</Button></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>User access gần đây</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table><TableHeader><TableRow><TableHead>User</TableHead><TableHead>Gói</TableHead><TableHead>Override</TableHead><TableHead>Hạn</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>{accesses.map((a) => <TableRow key={a.id}><TableCell><div className="text-xs">{a.email || "-"}</div><div className="font-mono text-[11px] text-muted-foreground">{a.user_id}</div></TableCell><TableCell>{a.plan_code}<div className="text-xs text-muted-foreground">{a.source}</div></TableCell><TableCell>{a.daily_token_limit_override ? numberText(a.daily_token_limit_override) : "plan"} / {a.daily_message_limit_override || "plan"}</TableCell><TableCell>{formatDate(a.expires_at)}</TableCell><TableCell>{activeBadge(a.status)}</TableCell><TableCell className="flex flex-wrap gap-2"><Button size="sm" variant="soft" onClick={() => fillAccess(a)}>Sửa</Button>{a.status === "active" ? <Button size="sm" variant="destructive" onClick={() => runAdminAction.mutate({ action: "set_user_access", access: { ...a, status: "blocked" } })}>Block</Button> : <Button size="sm" variant="soft" onClick={() => runAdminAction.mutate({ action: "set_user_access", access: { ...a, status: "active" } })}>Mở</Button>}<Button size="sm" variant="outline" onClick={() => deleteAccess.mutate({ id: a.id, user_id: a.user_id })}>Xóa</Button></TableCell></TableRow>)}</TableBody></Table>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "logs" && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Card><CardHeader><CardTitle>Usage logs</CardTitle></CardHeader><CardContent className="max-h-[520px] overflow-auto"><Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>User</TableHead><TableHead>Model</TableHead><TableHead>Tokens</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{usageLogs.map((l) => <TableRow key={l.id}><TableCell>{formatDate(l.created_at)}</TableCell><TableCell className="max-w-[160px] truncate">{l.email || l.user_id || "-"}</TableCell><TableCell>{l.model}</TableCell><TableCell>{numberText(l.estimated_tokens)}</TableCell><TableCell>{activeBadge(l.request_status)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
          <Card><CardHeader><CardTitle>Redeem logs</CardTitle></CardHeader><CardContent className="max-h-[520px] overflow-auto"><Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>User</TableHead><TableHead>Key</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{redeemLogs.map((l) => <TableRow key={l.id}><TableCell>{formatDate(l.created_at)}</TableCell><TableCell>{l.email || l.user_id || "-"}</TableCell><TableCell className="font-mono text-xs">{l.code_mask || l.redeem_key_id}</TableCell><TableCell>{activeBadge(l.status)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
        </div>
      )}

      {tab === "sandbox" && (
        <Card><CardHeader><CardTitle>Sandbox sessions</CardTitle><CardDescription>Hiện tại chỉ là kill switch. Chưa mở terminal thật nếu chưa khóa đủ an toàn.</CardDescription></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Started</TableHead><TableHead>User</TableHead><TableHead>Status</TableHead><TableHead>Reason</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>{sandboxSessions.map((s) => <TableRow key={s.id}><TableCell>{formatDate(s.started_at)}</TableCell><TableCell>{s.email || s.user_id || "-"}</TableCell><TableCell>{activeBadge(s.status)}</TableCell><TableCell>{s.reason || "-"}</TableCell><TableCell>{s.status !== "killed" && <Button size="sm" variant="destructive" onClick={() => runAdminAction.mutate({ action: "kill_sandbox", id: s.id, reason: "admin kill" })}>Kill</Button>}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
      )}
    </div>
  );
}
