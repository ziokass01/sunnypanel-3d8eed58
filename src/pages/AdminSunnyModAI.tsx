import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Bot,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  TerminalSquare,
  Trash2,
  Users,
  WalletCards,
  Search,
  Unlock,
  Ban,
  RotateCcw,
  Database,
  Server,
  CreditCard,
  Box,
} from "lucide-react";

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
  { value: "blocked", label: "blocked - khóa" },
  { value: "expired", label: "expired - hết hạn" },
] as const;
const INTEGRATION_OPTIONS = [
  { code: "convex", label: "Convex style realtime", icon: Database, note: "Chỉ lấy concept realtime/thread; hệ chính vẫn là Supabase." },
  { code: "stripe", label: "Stripe/paywall blueprint", icon: CreditCard, note: "Để map gói trả phí sau này; hiện tắt để tránh nổ billing." },
  { code: "e2b", label: "E2B sandbox blueprint", icon: Box, note: "Sandbox code tách worker, chỉ bật khi có secrets riêng." },
  { code: "docker", label: "Docker job runner blueprint", icon: Server, note: "Dành cho gói cao nhất; không chạy bằng service role production." },
] as const;

type TabKey = "overview" | "plans" | "keys" | "users" | "logs" | "sandbox";
type Dashboard = {
  ok: boolean;
  config: any;
  plans: any[];
  keys: any[];
  accesses: any[];
  usage_logs: any[];
  redeem_logs: any[];
  sandbox_sessions: any[];
  integrations?: any[];
  stats: any;
};

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

function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function num(value: any) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? new Intl.NumberFormat("vi-VN").format(n) : "0";
}

function csv(value: any) {
  if (Array.isArray(value)) return value.join(",");
  return String(value ?? "");
}

function badge(status?: string | null) {
  const s = String(status ?? "").toLowerCase();
  if (s === "active" || s === "ok") return <Badge>active</Badge>;
  if (s === "blocked" || s === "disabled" || s === "error") return <Badge variant="destructive">{s}</Badge>;
  if (s === "expired") return <Badge variant="outline">expired</Badge>;
  return <Badge variant="outline">{s || "-"}</Badge>;
}

function normalizeAccess(access: any) {
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
  const [queryUser, setQueryUser] = useState("");

  const dashboard = useQuery({
    queryKey: ["admin-ai-sunny-dashboard-v3"],
    enabled: Boolean(token),
    queryFn: async () => postFunction<Dashboard>("/admin-ai-sunny-control", { action: "dashboard" }, { authToken: token }),
  });

  const data = dashboard.data;
  const config = data?.config ?? {};
  const plans = data?.plans ?? [];
  const keys = data?.keys ?? [];
  const accesses = data?.accesses ?? [];
  const usageLogs = data?.usage_logs ?? [];
  const sandboxSessions = data?.sandbox_sessions ?? [];
  const integrations = data?.integrations ?? [];
  const defaultPlan = plans.find((p) => p.plan_code === "free")?.plan_code ?? plans[0]?.plan_code ?? "free";

  const [configDraft, setConfigDraft] = useState<any | null>(null);
  const effectiveConfig = configDraft ?? config;

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
      setAccessDraft((prev: any) => ({ ...prev, plan_code: defaultPlan }));
    }
  }, [defaultPlan]);

  const action = useMutation({
    mutationFn: async (payload: any) => postFunction<any>("/admin-ai-sunny-control", payload, { authToken: token }),
    onSuccess: async (res: any) => {
      if (res?.raw_code) setLastCreatedKey(String(res.raw_code));
      toast({ title: "Đã cập nhật", description: "SunnyMod AI control đã lưu thành công." });
      await dashboard.refetch();
    },
    onError: (e: any) => toast({ title: "Lỗi", description: e?.message ?? "Không thể cập nhật.", variant: "destructive" }),
  });

  const lookupUser = useMutation({
    mutationFn: async () => {
      const raw = queryUser.trim();
      const looksEmail = raw.includes("@");
      return postFunction<any>("/admin-ai-sunny-control", {
        action: "lookup_user_access",
        email: looksEmail ? raw : accessDraft.email,
        user_id: looksEmail ? accessDraft.user_id : raw || accessDraft.user_id,
      }, { authToken: token });
    },
    onSuccess: (res: any) => {
      setLookupResult(res);
      const foundUser = res?.user ?? null;
      const access = res?.access ?? null;
      if (!foundUser?.id && !access?.user_id) {
        toast({ title: "Không thấy tài khoản", description: "Email/User ID này chưa tồn tại trong Supabase Auth.", variant: "destructive" });
        return;
      }
      setAccessDraft((prev: any) => ({
        ...prev,
        ...(access ?? {}),
        id: access?.id ?? prev.id ?? "",
        user_id: access?.user_id ?? foundUser?.id ?? prev.user_id,
        email: access?.email ?? foundUser?.email ?? prev.email,
        plan_code: access?.plan_code ?? prev.plan_code ?? defaultPlan,
        status: access?.status ?? prev.status ?? "active",
        expires_at: toDateTimeLocal(access?.expires_at),
        daily_token_limit_override: access?.daily_token_limit_override ?? "",
        daily_message_limit_override: access?.daily_message_limit_override ?? "",
        daily_ip_limit_override: access?.daily_ip_limit_override ?? "",
        daily_device_limit_override: access?.daily_device_limit_override ?? "",
        note: access?.note ?? prev.note ?? "",
      }));
      toast({ title: "Đã tìm thấy", description: access ? "Đã tải quyền AI hiện tại của user." : "Tài khoản tồn tại, chưa có quyền riêng." });
    },
    onError: (e: any) => toast({ title: "Tìm user lỗi", description: e?.message ?? "Không tìm được user.", variant: "destructive" }),
  });

  const tabs = [
    { key: "overview" as TabKey, label: "Tổng quan", icon: Bot },
    { key: "plans" as TabKey, label: "Gói AI", icon: WalletCards },
    { key: "keys" as TabKey, label: "Key vượt", icon: KeyRound },
    { key: "users" as TabKey, label: "Người dùng", icon: Users },
    { key: "logs" as TabKey, label: "Usage logs", icon: ShieldCheck },
    { key: "sandbox" as TabKey, label: "Sandbox", icon: TerminalSquare },
  ];

  const saveAccess = (patch?: any) => action.mutate({ action: "set_user_access", access: normalizeAccess({ ...accessDraft, ...(patch ?? {}) }) });
  const copyKey = async (text: string) => { await navigator.clipboard.writeText(text); toast({ title: "Đã copy", description: "Key đã được copy." }); };
  const fillAccess = (a: any) => { setAccessDraft({ ...a, expires_at: toDateTimeLocal(a.expires_at), daily_token_limit_override: a.daily_token_limit_override ?? "", daily_message_limit_override: a.daily_message_limit_override ?? "", daily_ip_limit_override: a.daily_ip_limit_override ?? "", daily_device_limit_override: a.daily_device_limit_override ?? "" }); setQueryUser(a.email ?? a.user_id ?? ""); setLookupResult({ user: { id: a.user_id, email: a.email }, access: a }); setTab("users"); };
  const fillPlan = (p: any) => { setPlanDraft({ ...p, allowed_models: csv(p.allowed_models) }); setTab("plans"); };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">SunnyMod Coding AI</h1>
          <p className="mt-1 text-sm text-slate-500">Điều khiển AI, gói, key vượt, user access, quota và blueprint Sandbox/E2B/Docker. Tách riêng khỏi Fake Lag/Free/Rent.</p>
        </div>
        <Button variant="soft" onClick={() => dashboard.refetch()} disabled={dashboard.isFetching}><RefreshCw className="mr-2 h-4 w-4" /> Reload</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>Token hôm nay</CardDescription><CardTitle>{num(data?.stats?.today_tokens)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Tin hôm nay</CardDescription><CardTitle>{num(data?.stats?.today_messages)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>User active</CardDescription><CardTitle>{num(data?.stats?.active_access_count)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Key active</CardDescription><CardTitle>{num(data?.stats?.active_key_count)}</CardTitle></CardHeader></Card>
      </div>

      <Card><CardContent className="flex flex-wrap gap-2 pt-4">{tabs.map((item) => { const Icon = item.icon; return <Button key={item.key} variant={tab === item.key ? "default" : "soft"} onClick={() => setTab(item.key)}><Icon className="mr-2 h-4 w-4" />{item.label}</Button>; })}</CardContent></Card>

      {tab === "overview" && (
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader><CardTitle>Cấu hình server AI</CardTitle><CardDescription>Base URL MiMo, model mặc định, giới hạn global và kill-switch sandbox.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="flex items-center justify-between rounded-2xl border p-3"><div><Label>AI Enabled</Label><p className="text-xs text-muted-foreground">Tắt mọi request.</p></div><Switch checked={Boolean(effectiveConfig.enabled ?? true)} onCheckedChange={(v) => setConfigDraft({ ...effectiveConfig, enabled: v })} /></div>
                <div className="flex items-center justify-between rounded-2xl border p-3"><div><Label>Public Enabled</Label><p className="text-xs text-muted-foreground">Cho user dùng /coding-ai.</p></div><Switch checked={Boolean(effectiveConfig.public_enabled ?? true)} onCheckedChange={(v) => setConfigDraft({ ...effectiveConfig, public_enabled: v })} /></div>
                <div className="flex items-center justify-between rounded-2xl border p-3"><div><Label>Sandbox Global</Label><p className="text-xs text-muted-foreground">Mặc định nên tắt.</p></div><Switch checked={Boolean(effectiveConfig.sandbox_global_enabled ?? false)} onCheckedChange={(v) => setConfigDraft({ ...effectiveConfig, sandbox_global_enabled: v })} /></div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label>Base URL MiMo</Label><Input value={effectiveConfig.mimo_base_url ?? "https://token-plan-sgp.xiaomimimo.com/v1"} onChange={(e) => setConfigDraft({ ...effectiveConfig, mimo_base_url: e.target.value })} /></div>
                <div className="space-y-2"><Label>Default model</Label><Select value={effectiveConfig.default_model ?? "mimo-v2.5"} onValueChange={(v) => setConfigDraft({ ...effectiveConfig, default_model: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MODEL_OPTIONS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Pro model</Label><Select value={effectiveConfig.pro_model ?? "mimo-v2.5-pro"} onValueChange={(v) => setConfigDraft({ ...effectiveConfig, pro_model: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MODEL_OPTIONS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Global daily token limit</Label><Input type="number" value={effectiveConfig.global_daily_token_limit ?? 80000000} onChange={(e) => setConfigDraft({ ...effectiveConfig, global_daily_token_limit: Number(e.target.value) })} /></div>
                <div className="space-y-2"><Label>Monthly stop at tokens</Label><Input type="number" value={effectiveConfig.global_monthly_stop_at_tokens ?? 1500000000} onChange={(e) => setConfigDraft({ ...effectiveConfig, global_monthly_stop_at_tokens: Number(e.target.value) })} /></div>
                <div className="space-y-2"><Label>Max input chars</Label><Input type="number" value={effectiveConfig.max_input_chars ?? 24000} onChange={(e) => setConfigDraft({ ...effectiveConfig, max_input_chars: Number(e.target.value) })} /></div>
              </div>
              <div className="space-y-2"><Label>Maintenance message</Label><Input value={effectiveConfig.maintenance_message ?? ""} onChange={(e) => setConfigDraft({ ...effectiveConfig, maintenance_message: e.target.value })} /></div>
              <div className="space-y-2"><Label>System prompt</Label><Textarea rows={5} value={effectiveConfig.system_prompt ?? ""} onChange={(e) => setConfigDraft({ ...effectiveConfig, system_prompt: e.target.value })} /></div>
              <Button onClick={() => action.mutate({ action: "save_config", config: effectiveConfig })} disabled={action.isPending}>Lưu cấu hình AI</Button>
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle>HackerAI blueprint đã lọc</CardTitle><CardDescription>Không bê nguyên stack để tránh nổ Supabase production.</CardDescription></CardHeader><CardContent className="space-y-3">{INTEGRATION_OPTIONS.map((it) => { const Icon = it.icon; return <div key={it.code} className="rounded-2xl border p-3"><div className="flex items-center gap-2 font-semibold"><Icon className="h-4 w-4" />{it.label}</div><p className="mt-1 text-xs text-muted-foreground">{it.note}</p></div>; })}</CardContent></Card>
        </div>
      )}

      {tab === "plans" && (
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <Card><CardHeader><CardTitle>Tạo/sửa gói AI</CardTitle><CardDescription>Gói free nên để khoảng 20-30 tin/ngày và 30k-60k token/ngày.</CardDescription></CardHeader><CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1"><Label>Plan code</Label><Input value={planDraft.plan_code} onChange={(e) => setPlanDraft({ ...planDraft, plan_code: e.target.value })} /></div>
              <div className="space-y-1"><Label>Label</Label><Input value={planDraft.label} onChange={(e) => setPlanDraft({ ...planDraft, label: e.target.value })} /></div>
              <div className="space-y-1"><Label>Daily tokens</Label><Input type="number" value={planDraft.daily_token_limit} onChange={(e) => setPlanDraft({ ...planDraft, daily_token_limit: Number(e.target.value) })} /></div>
              <div className="space-y-1"><Label>Daily messages</Label><Input type="number" value={planDraft.daily_message_limit} onChange={(e) => setPlanDraft({ ...planDraft, daily_message_limit: Number(e.target.value) })} /></div>
              <div className="space-y-1"><Label>Max tokens/request</Label><Input type="number" value={planDraft.max_tokens_per_request} onChange={(e) => setPlanDraft({ ...planDraft, max_tokens_per_request: Number(e.target.value) })} /></div>
              <div className="space-y-1"><Label>Max input chars</Label><Input type="number" value={planDraft.max_input_chars} onChange={(e) => setPlanDraft({ ...planDraft, max_input_chars: Number(e.target.value) })} /></div>
            </div>
            <div className="space-y-1"><Label>Allowed models, cách nhau bằng dấu phẩy</Label><Input value={csv(planDraft.allowed_models)} onChange={(e) => setPlanDraft({ ...planDraft, allowed_models: e.target.value })} /></div>
            <div className="space-y-1"><Label>Description</Label><Textarea value={planDraft.description} onChange={(e) => setPlanDraft({ ...planDraft, description: e.target.value })} /></div>
            <div className="grid gap-3 md:grid-cols-3"><div className="flex items-center justify-between rounded-xl border p-3"><Label>Enabled</Label><Switch checked={Boolean(planDraft.enabled)} onCheckedChange={(v) => setPlanDraft({ ...planDraft, enabled: v })} /></div><div className="flex items-center justify-between rounded-xl border p-3"><Label>Sandbox</Label><Switch checked={Boolean(planDraft.sandbox_enabled)} onCheckedChange={(v) => setPlanDraft({ ...planDraft, sandbox_enabled: v })} /></div><div className="flex items-center justify-between rounded-xl border p-3"><Label>Terminal</Label><Switch checked={Boolean(planDraft.terminal_enabled)} onCheckedChange={(v) => setPlanDraft({ ...planDraft, terminal_enabled: v })} /></div></div>
            <Button onClick={() => action.mutate({ action: "upsert_plan", plan: planDraft })} disabled={action.isPending}>Lưu gói</Button>
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Danh sách gói</CardTitle></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Gói</TableHead><TableHead>Models</TableHead><TableHead>Limit/ngày</TableHead><TableHead>Sandbox</TableHead><TableHead /></TableRow></TableHeader><TableBody>{plans.map((p) => <TableRow key={p.plan_code}><TableCell><div className="font-medium">{p.label}</div><div className="text-xs text-muted-foreground">{p.plan_code}</div></TableCell><TableCell className="max-w-[260px] truncate">{csv(p.allowed_models)}</TableCell><TableCell>{num(p.daily_token_limit)} token / {num(p.daily_message_limit)} tin</TableCell><TableCell>{p.sandbox_enabled ? <Badge>on</Badge> : <Badge variant="outline">off</Badge>}</TableCell><TableCell><Button size="sm" variant="soft" onClick={() => fillPlan(p)}>Sửa</Button></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
        </div>
      )}

      {tab === "keys" && (
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <Card><CardHeader><CardTitle>Tạo key thủ công nội bộ</CardTitle><CardDescription>Prefix mặc định AI-SUNNY. Dùng khi admin muốn phát trực tiếp; flow public chuẩn vẫn nằm ở /admin/free-keys và /free.</CardDescription></CardHeader><CardContent className="space-y-3">
            {lastCreatedKey && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><div className="font-semibold">Key mới tạo, chỉ hiện lần này:</div><div className="mt-1 break-all font-mono">{lastCreatedKey}</div><Button size="sm" className="mt-2" onClick={() => copyKey(lastCreatedKey)}>Copy key</Button></div>}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1"><Label>Prefix</Label><Input value={keyDraft.prefix} onChange={(e) => setKeyDraft({ ...keyDraft, prefix: e.target.value })} /></div>
              <div className="space-y-1"><Label>Key thủ công, bỏ trống để tự tạo</Label><Input value={keyDraft.code} onChange={(e) => setKeyDraft({ ...keyDraft, code: e.target.value })} /></div>
              <div className="space-y-1"><Label>Title</Label><Input value={keyDraft.title} onChange={(e) => setKeyDraft({ ...keyDraft, title: e.target.value })} /></div>
              <div className="space-y-1"><Label>Grant plan</Label><Select value={keyDraft.plan_code_to_grant || defaultPlan} onValueChange={(v) => setKeyDraft({ ...keyDraft, plan_code_to_grant: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{plans.map((p) => <SelectItem key={p.plan_code} value={p.plan_code}>{p.label} ({p.plan_code})</SelectItem>)}</SelectContent></Select></div>
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
            <Button onClick={() => action.mutate({ action: "create_redeem_key", key: keyDraft })} disabled={action.isPending}>Tạo key thủ công</Button>
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Key đã tạo</CardTitle><CardDescription>Key disabled có nút mở lại. Có reset used_count/log để test lại.</CardDescription></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Key</TableHead><TableHead>Gói</TableHead><TableHead>Limit</TableHead><TableHead>Used</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{keys.map((k) => <TableRow key={k.id}><TableCell><div className="font-mono text-xs">{k.code_mask}</div><div className="text-xs text-muted-foreground">{k.title}</div></TableCell><TableCell>{k.plan_code_to_grant}<div className="text-xs text-muted-foreground">{k.grant_hours}h</div></TableCell><TableCell>IP {k.daily_ip_limit} / Device {k.daily_device_limit}<div className="text-xs text-muted-foreground">day {k.max_uses_per_day}, total {k.max_uses_total}</div></TableCell><TableCell>{num(k.used_count)}</TableCell><TableCell>{badge(k.status)}</TableCell><TableCell className="min-w-[250px] space-x-2">{k.status === "active" ? <Button size="sm" variant="destructive" onClick={() => action.mutate({ action: "update_redeem_key_status", id: k.id, status: "disabled" })}><Ban className="mr-1 h-3 w-3" />Tắt</Button> : <Button size="sm" variant="soft" onClick={() => action.mutate({ action: "update_redeem_key_status", id: k.id, status: "active" })}><Unlock className="mr-1 h-3 w-3" />Mở lại</Button>}<Button size="sm" variant="outline" onClick={() => action.mutate({ action: "reset_redeem_key_usage", id: k.id })}><RotateCcw className="mr-1 h-3 w-3" />Reset</Button><Button size="sm" variant="destructive" onClick={() => action.mutate({ action: "delete_redeem_key", id: k.id })}><Trash2 className="mr-1 h-3 w-3" />Xóa</Button></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
        </div>
      )}

      {tab === "users" && (
        <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <Card><CardHeader><CardTitle>Cấp/mở quyền user</CardTitle><CardDescription>Không gõ bừa: nhập email/User ID rồi bấm tìm để lấy đúng tài khoản Supabase Auth.</CardDescription></CardHeader><CardContent className="space-y-3">
            <div className="space-y-1"><Label>Tìm theo email hoặc User ID</Label><div className="flex gap-2"><Input value={queryUser} onChange={(e) => setQueryUser(e.target.value)} placeholder="vd: email@gmail.com hoặc user uuid" /><Button type="button" variant="soft" onClick={() => lookupUser.mutate()} disabled={lookupUser.isPending}><Search className="mr-2 h-4 w-4" />Tìm</Button></div></div>
            {lookupResult?.user && <div className="rounded-2xl border bg-slate-50 p-3 text-sm"><div className="font-medium">Tài khoản hợp lệ</div><div className="mt-1 break-all text-muted-foreground">{lookupResult.user.email} · {lookupResult.user.id}</div><div className="mt-1 text-xs text-muted-foreground">Last sign in: {formatDate(lookupResult.user.last_sign_in_at)}</div></div>}
            <div className="space-y-1"><Label>User ID Supabase</Label><Input value={accessDraft.user_id} onChange={(e) => setAccessDraft({ ...accessDraft, user_id: e.target.value })} /></div>
            <div className="space-y-1"><Label>Email</Label><Input value={accessDraft.email ?? ""} onChange={(e) => setAccessDraft({ ...accessDraft, email: e.target.value })} /></div>
            <div className="grid gap-3 md:grid-cols-2"><div className="space-y-1"><Label>Plan</Label><Select value={accessDraft.plan_code || defaultPlan} onValueChange={(v) => setAccessDraft({ ...accessDraft, plan_code: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{plans.map((p) => <SelectItem key={p.plan_code} value={p.plan_code}>{p.label} ({p.plan_code})</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label>Status</Label><Select value={accessDraft.status || "active"} onValueChange={(v) => setAccessDraft({ ...accessDraft, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div></div>
            <div className="grid gap-3 md:grid-cols-2"><div className="space-y-1"><Label>Override tokens/ngày</Label><Input type="number" value={accessDraft.daily_token_limit_override ?? ""} onChange={(e) => setAccessDraft({ ...accessDraft, daily_token_limit_override: e.target.value })} /></div><div className="space-y-1"><Label>Override messages/ngày</Label><Input type="number" value={accessDraft.daily_message_limit_override ?? ""} onChange={(e) => setAccessDraft({ ...accessDraft, daily_message_limit_override: e.target.value })} /></div><div className="space-y-1"><Label>IP limit/ngày</Label><Input type="number" value={accessDraft.daily_ip_limit_override ?? ""} onChange={(e) => setAccessDraft({ ...accessDraft, daily_ip_limit_override: e.target.value })} /></div><div className="space-y-1"><Label>Device limit/ngày</Label><Input type="number" value={accessDraft.daily_device_limit_override ?? ""} onChange={(e) => setAccessDraft({ ...accessDraft, daily_device_limit_override: e.target.value })} /></div></div>
            <div className="space-y-1"><Label>Expires at</Label><Input type="datetime-local" value={accessDraft.expires_at ?? ""} onChange={(e) => setAccessDraft({ ...accessDraft, expires_at: e.target.value })} /></div>
            <div className="space-y-1"><Label>Note</Label><Textarea value={accessDraft.note ?? ""} onChange={(e) => setAccessDraft({ ...accessDraft, note: e.target.value })} /></div>
            <div className="flex flex-wrap gap-2"><Button onClick={() => saveAccess()} disabled={action.isPending}>Lưu quyền user</Button><Button variant="destructive" onClick={() => saveAccess({ status: "blocked" })} disabled={action.isPending}><Ban className="mr-2 h-4 w-4" />Block</Button><Button variant="soft" onClick={() => saveAccess({ status: "active" })} disabled={action.isPending}><Unlock className="mr-2 h-4 w-4" />Mở block</Button><Button variant="destructive" onClick={() => action.mutate({ action: "delete_user_access", id: accessDraft.id, user_id: accessDraft.user_id })} disabled={action.isPending}><Trash2 className="mr-2 h-4 w-4" />Xóa quyền</Button></div>
          </CardContent></Card>
          <Card><CardHeader><CardTitle>User access hiện có</CardTitle></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>User</TableHead><TableHead>Gói</TableHead><TableHead>Quota</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{accesses.map((a) => <TableRow key={a.id ?? a.user_id}><TableCell><div className="font-medium">{a.email ?? "-"}</div><div className="max-w-[220px] truncate font-mono text-xs text-muted-foreground">{a.user_id}</div></TableCell><TableCell>{a.plan_code}<div className="text-xs text-muted-foreground">hết hạn: {formatDate(a.expires_at)}</div></TableCell><TableCell>{num(a.daily_token_limit_override)} token<div className="text-xs text-muted-foreground">{num(a.daily_message_limit_override)} tin</div></TableCell><TableCell>{badge(a.status)}</TableCell><TableCell className="min-w-[220px] space-x-2"><Button size="sm" variant="soft" onClick={() => fillAccess(a)}>Sửa</Button>{a.status === "active" ? <Button size="sm" variant="destructive" onClick={() => action.mutate({ action: "set_user_access", access: normalizeAccess({ ...a, status: "blocked" }) })}>Block</Button> : <Button size="sm" variant="soft" onClick={() => action.mutate({ action: "set_user_access", access: normalizeAccess({ ...a, status: "active" }) })}>Mở block</Button>}<Button size="sm" variant="destructive" onClick={() => action.mutate({ action: "delete_user_access", id: a.id, user_id: a.user_id })}>Xóa</Button></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
        </div>
      )}

      {tab === "logs" && <Card><CardHeader><CardTitle>Usage logs</CardTitle><CardDescription>Theo dõi request, token, model, lỗi MiMo.</CardDescription></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>User</TableHead><TableHead>Model</TableHead><TableHead>Tokens</TableHead><TableHead>Status</TableHead><TableHead>Error</TableHead></TableRow></TableHeader><TableBody>{usageLogs.map((l) => <TableRow key={l.id}><TableCell>{formatDate(l.created_at)}</TableCell><TableCell>{l.email}<div className="font-mono text-xs text-muted-foreground">{l.day_key}</div></TableCell><TableCell>{l.model}<div className="text-xs text-muted-foreground">{l.plan_code}</div></TableCell><TableCell>{num(l.estimated_tokens)}</TableCell><TableCell>{badge(l.request_status)}</TableCell><TableCell className="max-w-[280px] truncate">{l.error_code || l.error_message || "-"}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}

      {tab === "sandbox" && <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]"><Card><CardHeader><CardTitle>Sandbox / E2B / Docker blueprint</CardTitle><CardDescription>Lấy ý tưởng từ HackerAI nhưng mặc định khóa để an toàn.</CardDescription></CardHeader><CardContent className="space-y-3">{INTEGRATION_OPTIONS.map((it) => { const row = integrations.find((x) => x.tool_code === it.code) ?? {}; const Icon = it.icon; return <div key={it.code} className="rounded-2xl border p-4"><div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2 font-semibold"><Icon className="h-4 w-4" />{it.label}</div><p className="mt-1 text-xs text-muted-foreground">{it.note}</p></div><Switch checked={Boolean(row.enabled)} onCheckedChange={(v) => action.mutate({ action: "save_integration_policy", tool_code: it.code, enabled: v, mode: row.mode ?? "disabled", note: it.note })} /></div><div className="mt-2 text-xs text-muted-foreground">Mode: {row.mode ?? "disabled"}</div></div>; })}</CardContent></Card><Card><CardHeader><CardTitle>Sandbox sessions</CardTitle></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>User</TableHead><TableHead>Provider</TableHead><TableHead>Status</TableHead><TableHead>Started</TableHead><TableHead /></TableRow></TableHeader><TableBody>{sandboxSessions.map((s) => <TableRow key={s.id}><TableCell>{s.email ?? s.user_id}</TableCell><TableCell>{s.provider ?? "-"}</TableCell><TableCell>{badge(s.status)}</TableCell><TableCell>{formatDate(s.started_at)}</TableCell><TableCell>{s.status === "running" ? <Button size="sm" variant="destructive" onClick={() => action.mutate({ action: "kill_sandbox", id: s.id, reason: "admin kill" })}>Kill</Button> : null}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></div>}
    </div>
  );
}
