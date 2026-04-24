import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, KeyRound, Plus, Search, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/error-message";
import { postFunction } from "@/lib/functions";

const APP_CODE = "fake-lag";
const KEY_PREFIX = "FAKELAG";

type FakeLagLicenseRow = {
  id: string;
  key: string;
  created_at: string;
  expires_at: string | null;
  start_on_first_use?: boolean | null;
  starts_on_first_use?: boolean | null;
  first_used_at?: string | null;
  activated_at?: string | null;
  duration_seconds?: number | null;
  duration_days?: number | null;
  max_devices: number | null;
  max_ips?: number | null;
  max_verify?: number | null;
  verify_count?: number | null;
  is_active: boolean | null;
  public_reset_disabled?: boolean | null;
  note: string | null;
  app_code?: string | null;
  deleted_at?: string | null;
};

type RuleDefaults = {
  keyPrefix: string;
  defaultDurationSeconds: number;
  maxDevices: number;
  maxIps: number;
  maxVerify: number;
  allowReset: boolean;
};

type FormState = {
  id: string | null;
  key: string;
  licenseType: "fixed" | "first_use";
  expiresAt: string;
  durationValue: number;
  durationUnit: "minutes" | "hours" | "days";
  maxDevices: number;
  maxIps: number;
  maxVerify: number;
  isActive: boolean;
  publicResetDisabled: boolean;
  note: string;
};

function normalizeRule(row?: any): RuleDefaults {
  return {
    keyPrefix: String(row?.key_prefix || KEY_PREFIX).trim().toUpperCase() || KEY_PREFIX,
    defaultDurationSeconds: Math.max(60, Number(row?.default_duration_seconds ?? 86400)),
    maxDevices: Math.max(1, Number(row?.max_devices_per_key ?? 1)),
    maxIps: Math.max(1, Number(row?.max_ips_per_key ?? 1)),
    maxVerify: Math.max(1, Number(row?.max_verify_per_key ?? 1)),
    allowReset: Boolean(row?.allow_reset ?? false),
  };
}

function emptyForm(rule?: RuleDefaults): FormState {
  const r = rule ?? normalizeRule();
  const duration = secondsToFields(r.defaultDurationSeconds);
  return {
    id: null,
    key: "",
    licenseType: "first_use",
    expiresAt: "",
    durationValue: duration.durationValue,
    durationUnit: duration.durationUnit,
    maxDevices: r.maxDevices,
    maxIps: r.maxIps,
    maxVerify: r.maxVerify,
    isActive: true,
    publicResetDisabled: !r.allowReset,
    note: "",
  };
}

function escapeILike(value: string) { return value.replace(/[\\%_]/g, "\\$&"); }
function isoToLocal(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localToIso(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
function durationToSeconds(value: number, unit: "minutes" | "hours" | "days") {
  const safe = Math.max(1, Math.trunc(Number(value)||1));
  return unit === "minutes" ? safe*60 : unit === "hours" ? safe*3600 : safe*86400;
}
function secondsToFields(seconds?: number | null): Pick<FormState, "durationValue" | "durationUnit"> {
  const safe = Math.max(60, Math.trunc(Number(seconds||86400)));
  if (safe % 86400 === 0) return { durationValue: Math.max(1, safe/86400), durationUnit: "days" };
  if (safe % 3600 === 0) return { durationValue: Math.max(1, safe/3600), durationUnit: "hours" };
  return { durationValue: Math.max(1, Math.round(safe/60)), durationUnit: "minutes" };
}
function formatVn(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "-";
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
}
function statusOf(row: FakeLagLicenseRow) {
  if (!row.is_active) return "Blocked";
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return "Expired";
  return "Active";
}
function isFirstUse(row: FakeLagLicenseRow) { return Boolean(row.start_on_first_use ?? row.starts_on_first_use); }
function firstUsedAt(row: FakeLagLicenseRow) { return row.first_used_at ?? row.activated_at ?? null; }
function remainingText(row: FakeLagLicenseRow) {
  if (isFirstUse(row) && !firstUsedAt(row)) {
    const secs = Number(row.duration_seconds ?? (row.duration_days ? row.duration_days*86400 : 0));
    return secs > 0 ? `Chưa kích hoạt · ${Math.round(secs/3600)}h` : "Chưa kích hoạt";
  }
  if (!row.expires_at) return "Không hết hạn";
  const diff = new Date(row.expires_at).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return "0m";
  const mins = Math.floor(diff/60000), days = Math.floor(mins/1440), hours = Math.floor((mins%1440)/60);
  return days ? `${days}d ${hours}h` : `${hours}h ${mins%60}m`;
}
async function logAudit(action: string, key: string, detail: Record<string, unknown>) {
  try { await supabase.rpc("log_audit", { p_action: action, p_license_key: key, p_detail: detail as any }); } catch {}
}

export function AdminFakeLagLicensesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all"|"active"|"expired"|"blocked">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<FakeLagLicenseRow | null>(null);
  const ruleQuery = useQuery({
    queryKey: ["fake-lag-license-rule-defaults"],
    queryFn: async () => {
      const { data, error } = await supabase.from("license_access_rules").select("*").eq("app_code", APP_CODE).maybeSingle();
      if (error) throw error;
      return normalizeRule(data);
    },
    retry: false,
  });
  const ruleDefaults = ruleQuery.data ?? normalizeRule();
  const [form, setForm] = useState<FormState>(() => emptyForm());

  useEffect(() => {
    if (!formOpen && !form.id) setForm(emptyForm(ruleDefaults));
  }, [ruleQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const licensesQuery = useQuery({
    queryKey: ["fake-lag-licenses", q, status],
    queryFn: async () => {
      let query = (supabase.from("licenses") as any)
        .select("id,key,created_at,expires_at,start_on_first_use,starts_on_first_use,first_used_at,activated_at,duration_seconds,duration_days,max_devices,max_ips,max_verify,verify_count,is_active,public_reset_disabled,note,app_code,deleted_at")
        .eq("app_code", APP_CODE)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      const needle = q.trim();
      if (needle) {
        const esc = escapeILike(needle);
        query = query.or(`key.ilike.%${esc}%,note.ilike.%${esc}%`);
      }
      const now = new Date().toISOString();
      if (status === "active") query = query.eq("is_active", true).or(`expires_at.is.null,expires_at.gte.${now}`);
      if (status === "expired") query = query.not("expires_at", "is", null).lt("expires_at", now);
      if (status === "blocked") query = query.eq("is_active", false);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as FakeLagLicenseRow[];
    },
  });

  const stats = useMemo(() => {
    const rows = licensesQuery.data ?? [];
    return {
      total: rows.length,
      active: rows.filter(r => statusOf(r) === "Active").length,
      blocked: rows.filter(r => statusOf(r) === "Blocked").length,
      expired: rows.filter(r => statusOf(r) === "Expired").length,
    };
  }, [licensesQuery.data]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token ?? null;
      const res = await postFunction<{ok:boolean;key?:string;msg?:string}>("/generate-license-key", { app_code: APP_CODE, key_signature: ruleDefaults.keyPrefix || KEY_PREFIX }, { authToken: token });
      if (!res.ok || !res.key) throw new Error(res.msg || "GEN_FAILED");
      return res.key;
    },
    onSuccess: (key) => {
      setForm(p => ({ ...p, key }));
      setFormOpen(true);
      toast({ title: "Đã tạo mã key", description: key });
    },
    onError: (e:any) => toast({ title: "Không tạo được key", description: getErrorMessage(e), variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const key = form.key.trim().toUpperCase();
      const safePrefix = (ruleDefaults.keyPrefix || KEY_PREFIX).replace(/[^A-Z0-9_-]/g, "");
      const keyRe = new RegExp(`^${safePrefix}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$`);
      if (!keyRe.test(key)) throw new Error(`Key phải đúng dạng ${safePrefix}-XXXX-XXXX-XXXX`);
      const firstUse = form.licenseType === "first_use";
      const durationSeconds = firstUse ? durationToSeconds(form.durationValue, form.durationUnit) : null;
      const patch: Record<string, unknown> = {
        key,
        app_code: APP_CODE,
        is_active: Boolean(form.isActive),
        max_devices: Math.max(1, Math.trunc(Number(form.maxDevices) || 1)),
        max_ips: Math.max(1, Math.trunc(Number(form.maxIps) || 1)),
        max_verify: Math.max(1, Math.trunc(Number(form.maxVerify) || 1)),
        public_reset_disabled: Boolean(form.publicResetDisabled),
        note: form.note.trim() || null,
        start_on_first_use: firstUse,
        starts_on_first_use: firstUse,
        duration_seconds: durationSeconds,
        duration_days: null,
      };
      if (firstUse) {
        patch.expires_at = null;
        patch.first_used_at = null;
        patch.activated_at = null;
      } else {
        patch.expires_at = localToIso(form.expiresAt);
        patch.first_used_at = null;
        patch.activated_at = null;
        patch.duration_seconds = null;
      }
      if (form.id) {
        const { error } = await (supabase.from("licenses") as any).update(patch).eq("id", form.id);
        if (error) throw error;
        await logAudit("FAKE_LAG_UPDATE", key, { app_code: APP_CODE, license_id: form.id, patch });
        return form.id;
      }
      const { data, error } = await (supabase.from("licenses") as any).insert(patch).select("id").single();
      if (error) throw error;
      await logAudit("FAKE_LAG_CREATE", key, { app_code: APP_CODE, license_id: data?.id, patch });
      return String(data?.id || "");
    },
    onSuccess: async () => {
      toast({ title: form.id ? "Đã lưu key" : "Đã tạo key" });
      setForm(emptyForm(ruleDefaults));
      setFormOpen(false);
      await qc.invalidateQueries({ queryKey: ["fake-lag-licenses"] });
    },
    onError: (e:any) => toast({ title: "Không lưu được key", description: getErrorMessage(e), variant: "destructive" }),
  });

  const softDeleteMutation = useMutation({
    mutationFn: async (row: FakeLagLicenseRow) => {
      const { error } = await (supabase.from("licenses") as any)
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .eq("id", row.id);
      if (error) throw error;
      await logAudit("FAKE_LAG_SOFT_DELETE", row.key, { app_code: APP_CODE, license_id: row.id });
    },
    onSuccess: async () => {
      toast({ title: "Đã chuyển key vào Trash", description: "Có thể khôi phục hoặc xóa vĩnh viễn ở tab Trash." });
      setPendingDelete(null);
      await qc.invalidateQueries({ queryKey: ["fake-lag-licenses"] });
    },
    onError: (e:any) => toast({ title: "Không xóa được key", description: getErrorMessage(e), variant: "destructive" }),
  });

  const toggleBlockMutation = useMutation({
    mutationFn: async (row: FakeLagLicenseRow) => {
      const next = !row.is_active;
      const { error } = await (supabase.from("licenses") as any).update({ is_active: next }).eq("id", row.id);
      if (error) throw error;
      await logAudit(next ? "FAKE_LAG_UNLOCK" : "FAKE_LAG_BLOCK", row.key, { app_code: APP_CODE, license_id: row.id });
    },
    onSuccess: async (_data, row) => {
      toast({ title: row.is_active ? "Đã block key" : "Đã unlock key" });
      await qc.invalidateQueries({ queryKey: ["fake-lag-licenses"] });
    },
    onError: (e:any) => toast({ title: "Không đổi được trạng thái", description: getErrorMessage(e), variant: "destructive" }),
  });

  const startCreate = () => { setForm(emptyForm(ruleDefaults)); setFormOpen(true); };
  const startEdit = (row: FakeLagLicenseRow) => {
    const firstUse = isFirstUse(row);
    const duration = secondsToFields(row.duration_seconds ?? (row.duration_days ? row.duration_days*86400 : ruleDefaults.defaultDurationSeconds));
    setForm({
      id: row.id,
      key: row.key,
      licenseType: firstUse ? "first_use" : "fixed",
      expiresAt: isoToLocal(row.expires_at),
      durationValue: duration.durationValue,
      durationUnit: duration.durationUnit,
      maxDevices: Number(row.max_devices ?? ruleDefaults.maxDevices),
      maxIps: Number(row.max_ips ?? ruleDefaults.maxIps),
      maxVerify: Number(row.max_verify ?? ruleDefaults.maxVerify),
      isActive: Boolean(row.is_active),
      publicResetDisabled: Boolean(row.public_reset_disabled ?? !ruleDefaults.allowReset),
      note: row.note ?? "",
    });
    setFormOpen(true);
  };

  useEffect(() => {
    if (!formOpen) return;
    const el = document.getElementById("fake-lag-license-form");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [formOpen]);

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Badge variant="outline">Fake Lag Licenses</Badge>
          <h1 className="text-2xl font-semibold">Licenses cho Fake Lag</h1>
          <p className="max-w-4xl text-sm text-muted-foreground">
            Chỉ quản lý key <span className="font-mono">{ruleDefaults.keyPrefix}</span>. Key vượt free và key admin tạo tay đều hiện ở đây. Khi xóa, key sẽ vào Trash trước, không xóa vĩnh viễn ngay.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="soft" onClick={startCreate}><Plus className="mr-2 h-4 w-4"/>Tạo tay</Button>
          <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}><KeyRound className="mr-2 h-4 w-4"/>Generate</Button>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Tổng key" value={stats.total}/>
        <Stat label="Active" value={stats.active}/>
        <Stat label="Blocked" value={stats.blocked}/>
        <Stat label="Expired" value={stats.expired}/>
      </div>

      {formOpen ? (
        <Card id="fake-lag-license-form" className="border-amber-200/70">
          <CardHeader>
            <CardTitle>{form.id ? "Edit Fake Lag key" : "Create Fake Lag key"}</CardTitle>
            <CardDescription>
              Mặc định lấy từ Server key Fake Lag: Device {ruleDefaults.maxDevices}, IP {ruleDefaults.maxIps}, lượt verify {ruleDefaults.maxVerify}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label>Key</Label>
                <Input className="font-mono" value={form.key} onChange={e => setForm(p => ({...p, key: e.target.value.toUpperCase()}))} placeholder={`${ruleDefaults.keyPrefix}-XXXX-XXXX-XXXX`} />
              </div>
              <div className="flex items-end"><Button type="button" variant="soft" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>Generate</Button></div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2"><Label>Loại key</Label><Select value={form.licenseType} onValueChange={v => setForm(p => ({...p, licenseType: v === "first_use" ? "first_use" : "fixed"}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="fixed">Hết hạn cố định</SelectItem><SelectItem value="first_use">Đếm từ lần dùng đầu</SelectItem></SelectContent></Select></div>
              {form.licenseType === "fixed" ? <div className="space-y-2"><Label>Hết hạn lúc</Label><Input type="datetime-local" value={form.expiresAt} onChange={e => setForm(p => ({...p, expiresAt: e.target.value}))}/></div> : <>
                <div className="space-y-2"><Label>Thời lượng</Label><Input type="number" min={1} value={form.durationValue} onChange={e => setForm(p => ({...p, durationValue: Number(e.target.value || 1)}))}/></div>
                <div className="space-y-2"><Label>Đơn vị</Label><Select value={form.durationUnit} onValueChange={v => setForm(p => ({...p, durationUnit: v as any}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="minutes">Phút</SelectItem><SelectItem value="hours">Giờ</SelectItem><SelectItem value="days">Ngày</SelectItem></SelectContent></Select></div>
              </>}
              <div className="space-y-2"><Label>Max devices</Label><Input type="number" min={1} value={form.maxDevices} onChange={e => setForm(p => ({...p, maxDevices: Number(e.target.value || 1)}))}/></div>
              <div className="space-y-2"><Label>Max IP</Label><Input type="number" min={1} value={form.maxIps} onChange={e => setForm(p => ({...p, maxIps: Number(e.target.value || 1)}))}/></div>
              <div className="space-y-2"><Label>Max verify/lượt nhập</Label><Input type="number" min={1} value={form.maxVerify} onChange={e => setForm(p => ({...p, maxVerify: Number(e.target.value || 1)}))}/></div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-2xl border p-4"><div><div className="font-medium">Active</div><div className="text-xs text-muted-foreground">Tắt là app sẽ báo key bị khóa.</div></div><Switch checked={form.isActive} onCheckedChange={v => setForm(p => ({...p, isActive: v}))}/></div>
              <div className="flex items-center justify-between rounded-2xl border p-4"><div><div className="font-medium">Cấm reset public</div><div className="text-xs text-muted-foreground">Không cho reset từ trang public.</div></div><Switch checked={form.publicResetDisabled} onCheckedChange={v => setForm(p => ({...p, publicResetDisabled: v}))}/></div>
            </div>

            <div className="space-y-2"><Label>Note</Label><Textarea rows={3} value={form.note} onChange={e => setForm(p => ({...p, note: e.target.value}))} placeholder="Ghi chú admin..."/></div>
            <div className="flex flex-wrap justify-end gap-2"><Button variant="soft" onClick={() => {setFormOpen(false); setForm(emptyForm(ruleDefaults));}}>Hủy</Button><Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>{saveMutation.isPending ? "Đang lưu..." : "Lưu key"}</Button></div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><CardTitle>Danh sách key Fake Lag</CardTitle><CardDescription>Bao gồm key admin tạo và key user nhận từ flow vượt free.</CardDescription></div>
            <div className="flex flex-wrap gap-2">
              <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input className="w-64 pl-9" value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm key/note..."/></div>
              <Select value={status} onValueChange={v => setStatus(v as any)}><SelectTrigger className="w-36"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Tất cả</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="expired">Expired</SelectItem><SelectItem value="blocked">Blocked</SelectItem></SelectContent></Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-2xl border">
            <Table><TableHeader><TableRow><TableHead>Key</TableHead><TableHead>Status</TableHead><TableHead>Hạn còn lại</TableHead><TableHead>Giới hạn</TableHead><TableHead>Verify</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {(licensesQuery.data ?? []).map(row => (
                  <TableRow key={row.id}>
                    <TableCell><div className="font-mono text-xs break-all">{row.key}</div><div className="mt-1 text-xs text-muted-foreground">Tạo: {formatVn(row.created_at)}</div>{row.note ? <div className="mt-1 max-w-xs truncate text-xs text-muted-foreground">{row.note}</div> : null}</TableCell>
                    <TableCell><Badge variant={statusOf(row) === "Active" ? "secondary" : statusOf(row) === "Blocked" ? "destructive" as any : "outline"}>{statusOf(row)}</Badge></TableCell>
                    <TableCell><div className="text-sm">{remainingText(row)}</div><div className="text-xs text-muted-foreground">Exp: {formatVn(row.expires_at)}</div></TableCell>
                    <TableCell className="text-sm"><div>Device: {row.max_devices ?? 1}</div><div>IP: {row.max_ips ?? 1}</div><div>Lượt: {row.max_verify ?? 1}</div></TableCell>
                    <TableCell>{row.verify_count ?? 0}</TableCell>
                    <TableCell><div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="soft" onClick={() => startEdit(row)}><Edit3 className="mr-1 h-3.5 w-3.5"/>Edit</Button>
                      <Button size="sm" variant="soft" onClick={() => toggleBlockMutation.mutate(row)}>{row.is_active ? <ShieldOff className="mr-1 h-3.5 w-3.5"/> : <ShieldCheck className="mr-1 h-3.5 w-3.5"/>}{row.is_active ? "Block" : "Unlock"}</Button>
                      <Button size="sm" variant="destructive" onClick={() => setPendingDelete(row)}><Trash2 className="mr-1 h-3.5 w-3.5"/>Xóa</Button>
                    </div></TableCell>
                  </TableRow>
                ))}
                {!licensesQuery.data?.length ? <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">Chưa có key Fake Lag.</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Chuyển key vào Trash?</AlertDialogTitle>
            <AlertDialogDescription>
              Key sẽ bị tạm khóa và chuyển sang Trash. Bạn vẫn có thể khôi phục hoặc xóa vĩnh viễn ở tab Trash.
              {pendingDelete?.key ? `\n\nKey đang chọn: ${pendingDelete.key}` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={softDeleteMutation.isPending}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={softDeleteMutation.isPending || !pendingDelete}
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) softDeleteMutation.mutate(pendingDelete);
              }}
            >
              {softDeleteMutation.isPending ? "Đang chuyển..." : "Chuyển vào Trash"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
function Stat({label, value}: {label:string; value:string|number}) {
  return <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div></CardContent></Card>;
}
