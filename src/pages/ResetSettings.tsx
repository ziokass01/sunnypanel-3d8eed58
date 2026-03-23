import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ShieldCheck, ShieldEllipsis } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/error-message";
import { fetchResetActivities, fetchResetSettings, updateResetSettings } from "@/features/reset-settings/reset-settings-api";

function secondsToText(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d} ngày`);
  if (h) parts.push(`${h} giờ`);
  if (m) parts.push(`${m} phút`);
  return parts.join(" ") || `${seconds} giây`;
}

function activityBadge(action: string) {
  const a = String(action).toUpperCase();
  if (a === "PUBLIC_RESET") return "secondary" as const;
  if (a === "RESET_DEVICES_PENALTY") return "destructive" as const;
  return "outline" as const;
}

export function ResetSettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const turnstileSiteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim();

  const settingsQuery = useQuery({
    queryKey: ["reset_settings"],
    queryFn: fetchResetSettings,
  });

  const [activityFilter, setActivityFilter] = useState<"all" | "PUBLIC_RESET" | "RESET_DEVICES" | "RESET_DEVICES_PENALTY">("all");
  const [activityQueryText, setActivityQueryText] = useState("");

  const activityQuery = useQuery({
    queryKey: ["reset_activity"],
    queryFn: () => fetchResetActivities(100),
  });

  const settings = settingsQuery.data;

  const [form, setForm] = useState<any>(null);

  const currentForm = useMemo(() => {
    if (form) return form;
    return settings
      ? {
          enabled: settings.enabled,
          require_turnstile: settings.require_turnstile,
          free_first_penalty_pct: settings.free_first_penalty_pct,
          free_next_penalty_pct: settings.free_next_penalty_pct,
          paid_first_penalty_pct: settings.paid_first_penalty_pct,
          paid_next_penalty_pct: settings.paid_next_penalty_pct,
          public_check_limit: settings.public_check_limit,
          public_check_window_seconds: settings.public_check_window_seconds,
          public_reset_limit: settings.public_reset_limit,
          public_reset_window_seconds: settings.public_reset_window_seconds,
          user_max_duration_seconds: settings.user_max_duration_seconds,
          disabled_message: settings.disabled_message,
        }
      : null;
  }, [form, settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentForm) throw new Error("FORM_NOT_READY");
      const payload = {
        enabled: Boolean(currentForm.enabled),
        require_turnstile: Boolean(currentForm.require_turnstile),
        free_first_penalty_pct: Number(currentForm.free_first_penalty_pct),
        free_next_penalty_pct: Number(currentForm.free_next_penalty_pct),
        paid_first_penalty_pct: Number(currentForm.paid_first_penalty_pct),
        paid_next_penalty_pct: Number(currentForm.paid_next_penalty_pct),
        public_check_limit: Number(currentForm.public_check_limit),
        public_check_window_seconds: Number(currentForm.public_check_window_seconds),
        public_reset_limit: Number(currentForm.public_reset_limit),
        public_reset_window_seconds: Number(currentForm.public_reset_window_seconds),
        user_max_duration_seconds: Number(currentForm.user_max_duration_seconds),
        disabled_message: String(currentForm.disabled_message ?? "").trim(),
      };
      return updateResetSettings(payload as any);
    },
    onSuccess: async (row) => {
      setForm(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["reset_settings"] }),
        queryClient.invalidateQueries({ queryKey: ["reset_activity"] }),
      ]);
      toast({
        title: "Đã lưu Reset Settings",
        description: row.enabled ? "Public reset đang bật." : "Public reset đang tắt.",
      });
    },
    onError: (err) => {
      toast({
        title: "Lưu settings thất bại",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    },
  });

  function updateField<K extends string>(key: K, value: any) {
    setForm((prev: any) => ({ ...(prev ?? currentForm ?? {}), [key]: value }));
  }

  const hasUnsavedChanges = Boolean(form);

  const filteredActivities = useMemo(() => {
    const q = activityQueryText.trim().toLowerCase();
    return (activityQuery.data ?? []).filter((row) => {
      const actionOk = activityFilter === "all" ? true : row.action === activityFilter;
      if (!actionOk) return false;
      if (!q) return true;
      return String(row.license_key ?? "").toLowerCase().includes(q);
    });
  }, [activityFilter, activityQuery.data, activityQueryText]);

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reset Settings</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Điều chỉnh luật Reset Key public, giới hạn 30 ngày cho user sale và lớp chống abuse.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={settings?.enabled ? "default" : "secondary"}>
            {settings?.enabled ? "Public reset: ON" : "Public reset: OFF"}
          </Badge>
          <Button variant="outline" onClick={() => navigate("/settings/reset-logs")}>Mở Reset Logs</Button>
          <Button variant="outline" disabled={!hasUnsavedChanges || saveMutation.isPending} onClick={() => setForm(null)}>
            Hoàn tác
          </Button>
          <Button disabled={!currentForm || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? "Đang lưu..." : "Lưu settings"}
          </Button>
        </div>
      </header>

      {!turnstileSiteKey ? (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <div>
              Frontend chưa có <code>VITE_TURNSTILE_SITE_KEY</code>. Nếu bật <b>require_turnstile</b>, trang Reset Key sẽ yêu cầu widget nhưng frontend chưa render được.
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Chính sách Reset Key</CardTitle>
            <CardDescription>Luật phạt cho key free / key mua và trạng thái bật tắt của trang reset public.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">Bật Reset Key public</div>
                    <div className="text-xs text-muted-foreground">Tắt là user chỉ check được trạng thái nhưng không reset được.</div>
                  </div>
                  <Switch checked={Boolean(currentForm?.enabled)} onCheckedChange={(v) => updateField("enabled", v)} />
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">Bật Turnstile</div>
                    <div className="text-xs text-muted-foreground">Chỉ nên bật khi frontend đã có site key và function đã có secret key.</div>
                  </div>
                  <Switch checked={Boolean(currentForm?.require_turnstile)} onCheckedChange={(v) => updateField("require_turnstile", v)} />
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  {turnstileSiteKey ? <ShieldCheck className="h-4 w-4" /> : <ShieldEllipsis className="h-4 w-4" />}
                  {turnstileSiteKey ? "Frontend site key đã có." : "Frontend site key chưa có."}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border p-4 space-y-3">
                <div className="font-medium">Penalty cho key free</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Free lần 1 (%)</Label>
                    <Input type="number" min={0} max={100} value={currentForm?.free_first_penalty_pct ?? 50} onChange={(e) => updateField("free_first_penalty_pct", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Free lần sau (%)</Label>
                    <Input type="number" min={0} max={100} value={currentForm?.free_next_penalty_pct ?? 50} onChange={(e) => updateField("free_next_penalty_pct", e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border p-4 space-y-3">
                <div className="font-medium">Penalty cho key mua</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Paid lần 1 (%)</Label>
                    <Input type="number" min={0} max={100} value={currentForm?.paid_first_penalty_pct ?? 0} onChange={(e) => updateField("paid_first_penalty_pct", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Paid lần sau (%)</Label>
                    <Input type="number" min={0} max={100} value={currentForm?.paid_next_penalty_pct ?? 20} onChange={(e) => updateField("paid_next_penalty_pct", e.target.value)} />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border p-4 space-y-3">
                <div className="font-medium">Rate limit check</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Số lần check / window</Label>
                    <Input type="number" min={1} value={currentForm?.public_check_limit ?? 12} onChange={(e) => updateField("public_check_limit", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Window check (giây)</Label>
                    <Input type="number" min={30} value={currentForm?.public_check_window_seconds ?? 300} onChange={(e) => updateField("public_check_window_seconds", e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border p-4 space-y-3">
                <div className="font-medium">Rate limit reset</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Số lần reset / window</Label>
                    <Input type="number" min={1} value={currentForm?.public_reset_limit ?? 5} onChange={(e) => updateField("public_reset_limit", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Window reset (giây)</Label>
                    <Input type="number" min={30} value={currentForm?.public_reset_window_seconds ?? 600} onChange={(e) => updateField("public_reset_window_seconds", e.target.value)} />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border p-4 space-y-2">
                <Label>User max duration (giây)</Label>
                <Input type="number" min={3600} value={currentForm?.user_max_duration_seconds ?? 2592000} onChange={(e) => updateField("user_max_duration_seconds", e.target.value)} />
                <div className="text-xs text-muted-foreground">
                  Hiện tại tương đương: {secondsToText(Number(currentForm?.user_max_duration_seconds ?? 2592000))}
                </div>
              </div>

              <div className="rounded-xl border p-4 space-y-2">
                <Label>Thông báo khi reset bị tắt</Label>
                <Textarea rows={4} value={currentForm?.disabled_message ?? ""} onChange={(e) => updateField("disabled_message", e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ảnh chụp cấu hình</CardTitle>
            <CardDescription>Nhìn nhanh để biết hệ thống đang khóa theo luật nào.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-xl border p-3 flex items-center justify-between gap-3">
              <span>Public reset</span>
              <Badge variant={currentForm?.enabled ? "default" : "secondary"}>{currentForm?.enabled ? "ON" : "OFF"}</Badge>
            </div>
            <div className="rounded-xl border p-3 flex items-center justify-between gap-3">
              <span>Turnstile</span>
              <Badge variant={currentForm?.require_turnstile ? "default" : "secondary"}>{currentForm?.require_turnstile ? "ON" : "OFF"}</Badge>
            </div>
            <div className="rounded-xl border p-3">Free lần 1: <b>{currentForm?.free_first_penalty_pct ?? 50}%</b></div>
            <div className="rounded-xl border p-3">Free lần sau: <b>{currentForm?.free_next_penalty_pct ?? 50}%</b></div>
            <div className="rounded-xl border p-3">Paid lần 1: <b>{currentForm?.paid_first_penalty_pct ?? 0}%</b></div>
            <div className="rounded-xl border p-3">Paid lần sau: <b>{currentForm?.paid_next_penalty_pct ?? 20}%</b></div>
            <div className="rounded-xl border p-3">User sale tối đa: <b>{secondsToText(Number(currentForm?.user_max_duration_seconds ?? 2592000))}</b></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Reset Activity</CardTitle>
          <CardDescription>Xem nhanh những lần reset gần đây để soi abuse hoặc chỉnh lại penalty.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Input value={activityQueryText} onChange={(e) => setActivityQueryText(e.target.value)} placeholder="Lọc theo key..." />
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value as any)}
            >
              <option value="all">Tất cả action</option>
              <option value="PUBLIC_RESET">PUBLIC_RESET</option>
              <option value="RESET_DEVICES">RESET_DEVICES</option>
              <option value="RESET_DEVICES_PENALTY">RESET_DEVICES_PENALTY</option>
            </select>
            <div className="flex items-center text-sm text-muted-foreground">{filteredActivities.length} bản ghi</div>
          </div>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Penalty</TableHead>
                  <TableHead className="hidden md:table-cell">Devices removed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activityQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Đang tải log reset...</TableCell>
                  </TableRow>
                ) : filteredActivities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Chưa có log reset nào.</TableCell>
                  </TableRow>
                ) : (
                  filteredActivities.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-sm">{new Date(row.created_at).toLocaleString()}</TableCell>
                      <TableCell><Badge variant={activityBadge(row.action)}>{row.action}</Badge></TableCell>
                      <TableCell className="font-mono text-xs md:text-sm break-all">{row.license_key}</TableCell>
                      <TableCell>{typeof row.detail?.penalty_pct === "number" ? `${row.detail.penalty_pct}%` : "—"}</TableCell>
                      <TableCell className="hidden md:table-cell">{row.detail?.devices_removed ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
