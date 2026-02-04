import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type SettingsRow = {
  id: number;
  free_outbound_url: string | null;
  free_enabled: boolean;
  free_disabled_message: string;
  free_min_delay_seconds: number;
  free_return_seconds: number;
  free_daily_limit_per_fingerprint: number;
  free_require_link4m_referrer: boolean;
  free_public_note: string;
  free_public_links: any;
  updated_at: string;
  updated_by: string | null;
};

type KeyTypeRow = {
  code: string;
  label: string;
  kind: "hour" | "day";
  value: number;
  duration_seconds: number;
  sort_order: number;
  enabled: boolean;
  updated_at: string;
};

type SessionRow = {
  session_id: string;
  created_at: string;
  status: string;
  reveal_count: number;
  ip_hash: string;
  ua_hash: string;
  fingerprint_hash: string;
  last_error: string | null;
  started_at: string | null;
  gate_ok_at: string | null;
  revealed_at: string | null;
  key_type_code: string | null;
  duration_seconds: number | null;
  out_token_hash: string | null;
  claim_token_hash: string | null;
};

type IssueRow = {
  issue_id: string;
  created_at: string;
  expires_at: string;
  license_id: string;
  key_mask: string;
  session_id: string;
  ip_hash: string;
  fingerprint_hash: string;
  ua_hash: string;
};

type PublicLink = {
  label: string;
  url: string;
  icon?: string | null;
};

function utcDayRange(day: string) {
  // day = YYYY-MM-DD in UTC
  const from = `${day}T00:00:00.000Z`;
  const to = `${day}T23:59:59.999Z`;
  return { from, to };
}

function pad2(n: number) {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

function toLinksText(value: any): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((l) => {
      const label = String(l?.label ?? "").trim();
      const url = String(l?.url ?? "").trim();
      const icon = String(l?.icon ?? "").trim();
      if (!label || !url) return "";
      return `${label}|${url}${icon ? `|${icon}` : ""}`;
    })
    .filter(Boolean)
    .join("\n");
}

function parseLinksText(text: string): PublicLink[] {
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: PublicLink[] = [];
  for (const line of lines) {
    const [labelRaw, urlRaw, iconRaw] = line.split("|");
    const label = (labelRaw ?? "").trim();
    const url = (urlRaw ?? "").trim();
    const icon = (iconRaw ?? "").trim();
    if (!label || !url) continue;
    // Very light url sanity
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({ label, url, icon: icon || null });
  }
  return out.slice(0, 8);
}

export function AdminFreeKeysPage() {
  const { toast } = useToast();

  const isMissingFreeKeyTypesTableError = (err: unknown) => {
    const msg = String((err as any)?.message ?? "");
    return (
      msg.includes("Could not find the table 'public.licenses_free_key_types' in the schema cache") ||
      msg.includes('Could not find the table "public.licenses_free_key_types" in the schema cache') ||
      msg.includes('relation "public.licenses_free_key_types" does not exist')
    );
  };

  const isSchemaCacheMissingColumnError = (err: unknown) => {
    const msg = String((err as any)?.message ?? "");
    // Examples:
    // - Could not find the 'free_daily_limit_per_fingerprint' column of 'licenses_free_settings' in the schema cache
    // - Could not find the 'xxx' column of 'public.table' in the schema cache
    if (!msg) return false;
    if (!msg.toLowerCase().includes("schema cache")) return false;
    return msg.includes("Could not find the '") && msg.includes("' column of '");
  };

  const baseUrl = useMemo(() => (typeof window !== "undefined" ? window.location.origin : ""), []);
  const getKeyUrl = baseUrl ? `${baseUrl}/free` : "/free";
  const gateUrl = baseUrl ? `${baseUrl}/free/gate` : "/free/gate";
  const claimBaseUrl = baseUrl ? `${baseUrl}/free/claim` : "/free/claim";

  const openUrl = (u: string) => {
    if (!u) return;
    window.open(u, "_blank", "noopener,noreferrer");
  };

  const copyText = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      toast({ title: "Copied", description: "Đã copy vào clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Không thể copy. Hãy copy thủ công.", variant: "destructive" });
    }
  };

  // -------- Settings (admin-controlled) --------
  const settingsQuery = useQuery({
    queryKey: ["free-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("licenses_free_settings")
        .select(
          "id,free_outbound_url,free_enabled,free_disabled_message,free_min_delay_seconds,free_return_seconds,free_daily_limit_per_fingerprint,free_require_link4m_referrer,free_public_note,free_public_links,updated_at,updated_by",
        )
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return (data as any) as SettingsRow | null;
    },
  });

  const missingSettingsColumns = isSchemaCacheMissingColumnError(settingsQuery.error);

  const [outboundUrl, setOutboundUrl] = useState("");
  const [freeEnabled, setFreeEnabled] = useState(true);
  const [disabledMessage, setDisabledMessage] = useState("Trang GetKey đang tạm đóng.");
  const [minDelay, setMinDelay] = useState(25);
  const [returnSeconds, setReturnSeconds] = useState(10);
  const [dailyLimit, setDailyLimit] = useState(1);
  const [requireRef, setRequireRef] = useState(false);
  const [publicNote, setPublicNote] = useState("");
  const [publicLinksText, setPublicLinksText] = useState("");

  useEffect(() => {
    const s = settingsQuery.data;
    if (!s) return;
    setOutboundUrl(s.free_outbound_url ?? "");
    setFreeEnabled(Boolean(s.free_enabled));
    setDisabledMessage(s.free_disabled_message ?? "Trang GetKey đang tạm đóng.");
    setMinDelay(Number(s.free_min_delay_seconds ?? 25));
    setReturnSeconds(Number(s.free_return_seconds ?? 10));
    setDailyLimit(Number(s.free_daily_limit_per_fingerprint ?? 1));
    setRequireRef(Boolean(s.free_require_link4m_referrer));
    setPublicNote(String(s.free_public_note ?? ""));
    setPublicLinksText(toLinksText(s.free_public_links));
  }, [settingsQuery.data]);

  const saveSettings = useMutation({
    mutationFn: async () => {
      const patch = {
        free_outbound_url: outboundUrl.trim() || null,
        free_enabled: Boolean(freeEnabled),
        free_disabled_message: disabledMessage.trim() || "Trang GetKey đang tạm đóng.",
        free_min_delay_seconds: Math.max(5, Math.floor(Number(minDelay) || 25)),
        free_return_seconds: Math.max(10, Math.floor(Number(returnSeconds) || 10)),
        free_daily_limit_per_fingerprint: Math.max(1, Math.floor(Number(dailyLimit) || 1)),
        free_require_link4m_referrer: Boolean(requireRef),
        free_public_note: publicNote,
        free_public_links: parseLinksText(publicLinksText),
      };

      const { data, error } = await supabase
        .from("licenses_free_settings")
        .upsert({ id: 1, ...patch }, { onConflict: "id" })
        .select("id")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      toast({ title: "Saved", description: "Free settings updated." });
      await settingsQuery.refetch();
    },
    onError: (e: any) => {
      toast({ title: "Save failed", description: e?.message ?? "Error", variant: "destructive" });
    },
  });

  // -------- Key types --------
  const keyTypesQuery = useQuery({
    queryKey: ["free-key-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("licenses_free_key_types")
        .select("code,label,kind,value,duration_seconds,sort_order,enabled,updated_at")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any as KeyTypeRow[];
    },
  });

  const missingKeyTypesTable = isMissingFreeKeyTypesTableError(keyTypesQuery.error);

  const toggleKeyType = useMutation({
    mutationFn: async (args: { code: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("licenses_free_key_types")
        .update({ enabled: args.enabled })
        .eq("code", args.code);
      if (error) throw error;
      return true;
    },
    onError: (e: any) => {
      toast({ title: "Update failed", description: e?.message ?? "Error", variant: "destructive" });
    },
    onSuccess: async () => {
      await keyTypesQuery.refetch();
    },
  });

  const disableAllKeyTypes = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("licenses_free_key_types").update({ enabled: false });
      if (error) throw error;
      return true;
    },
    onSuccess: async () => {
      toast({ title: "Updated", description: "All key types disabled." });
      await keyTypesQuery.refetch();
    },
    onError: (e: any) => {
      toast({ title: "Update failed", description: e?.message ?? "Error", variant: "destructive" });
    },
  });

  // Create/enable a key type (hours: 1..24, days: 1..30)
  const [newKind, setNewKind] = useState<"hour" | "day">("hour");
  const [newValue, setNewValue] = useState<number>(1);
  const [newLabel, setNewLabel] = useState<string>("");

  const createKeyType = useMutation({
    mutationFn: async () => {
      const v = Math.max(1, Math.floor(Number(newValue) || 1));
      const max = newKind === "hour" ? 24 : 30;
      const value = Math.min(max, v);
      const code = `${newKind === "hour" ? "h" : "d"}${pad2(value)}`;
      const label = (newLabel?.trim() || `${value} ${newKind === "hour" ? "giờ" : "ngày"}`);
      const duration_seconds = newKind === "hour" ? value * 3600 : value * 86400;
      const sort_order = newKind === "hour" ? value : 100 + value;

      const { error } = await supabase
        .from("licenses_free_key_types")
        .upsert(
          {
            code,
            label,
            kind: newKind,
            value,
            duration_seconds,
            sort_order,
            enabled: true,
          },
          { onConflict: "code" },
        );
      if (error) throw error;
      return true;
    },
    onSuccess: async () => {
      toast({ title: "Created", description: "Key type enabled." });
      setNewLabel("");
      await keyTypesQuery.refetch();
    },
    onError: (e: any) => {
      toast({ title: "Create failed", description: e?.message ?? "Error", variant: "destructive" });
    },
  });

  // -------- Sessions / Issues --------
  const todayUtc = new Date().toISOString().slice(0, 10);
  const [day, setDay] = useState(todayUtc);
  const [status, setStatus] = useState<string>("all");
  const [ipHash, setIpHash] = useState<string>("");

  const range = useMemo(() => utcDayRange(day), [day]);

  const sessionsQuery = useQuery({
    queryKey: ["free-sessions", range.from, range.to, status, ipHash],
    queryFn: async () => {
      let q = supabase
        .from("licenses_free_sessions")
        .select(
          "session_id,created_at,status,reveal_count,ip_hash,ua_hash,fingerprint_hash,last_error,started_at,gate_ok_at,revealed_at,key_type_code,duration_seconds,out_token_hash,claim_token_hash",
        )
        .gte("created_at", range.from)
        .lte("created_at", range.to)
        .order("created_at", { ascending: false })
        .limit(200);

      if (status !== "all") q = q.eq("status", status);
      if (ipHash.trim()) q = q.eq("ip_hash", ipHash.trim());

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any as SessionRow[];
    },
  });

  const issuesQuery = useQuery({
    queryKey: ["free-issues", range.from, range.to, ipHash],
    queryFn: async () => {
      let q = supabase
        .from("licenses_free_issues")
        .select("issue_id,created_at,expires_at,license_id,key_mask,session_id,ip_hash,fingerprint_hash,ua_hash")
        .gte("created_at", range.from)
        .lte("created_at", range.to)
        .order("created_at", { ascending: false })
        .limit(200);

      if (ipHash.trim()) q = q.eq("ip_hash", ipHash.trim());
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any as IssueRow[];
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Free GetKey Settings</CardTitle>
          <CardDescription>
            Admin toàn quyền: mở/tắt trang GetKey, cấu hình Link4M, delay, auto-return, limit theo fingerprint.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div>
              <div className="font-medium">Bật/tắt trang GetKey</div>
              <div className="text-xs text-muted-foreground">Tắt: người dùng không thể lấy key.</div>
            </div>
            <Switch checked={freeEnabled} onCheckedChange={setFreeEnabled} />
          </div>

          {missingSettingsColumns ? (
            <Alert className="mb-2">
              <AlertTitle>DB chưa chạy đủ migration cho Free settings</AlertTitle>
              <AlertDescription>
                <div className="space-y-2">
                  <div>
                    Backend đang báo thiếu cột của <span className="font-mono">licenses_free_settings</span> trong schema cache.
                  </div>
                  <div>
                    Hãy chạy các migration:
                    <span className="font-mono"> 20260202090807_7f0f8af7-d5f8-441e-96ff-66aa666b9326.sql</span>,
                    <span className="font-mono"> 20260203093000_free_key_types_and_settings.sql</span>,
                    <span className="font-mono"> 20260204110000_free_public_content.sql</span>
                    &nbsp;và reload schema cache:
                  </div>
                  <div className="rounded-md border p-2 font-mono text-xs">select pg_notify('pgrst','reload schema');</div>
                  <div>Tạm thời đã khóa nút “Save settings” để tránh spam lỗi.</div>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Link4M outbound URL (https)</div>
              <Input
                value={outboundUrl}
                onChange={(e) => setOutboundUrl(e.target.value)}
                placeholder="https://link4m.com/xxxx"
                inputMode="url"
              />
              <div className="text-xs text-muted-foreground">
                Đây là link bạn đã rút gọn (Link4M) để dẫn người dùng sang /free/gate.
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Thông báo khi tắt</div>
              <Textarea value={disabledMessage} onChange={(e) => setDisabledMessage(e.target.value)} rows={3} />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Delay tối thiểu (giây)</div>
              <Input
                type="number"
                value={minDelay}
                onChange={(e) => setMinDelay(Number(e.target.value))}
                min={5}
              />
              <div className="text-xs text-muted-foreground">Gate chỉ hợp lệ sau thời gian này (chống spam/bypass cơ bản).</div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Tự quay lại /free (giây)</div>
              <Input
                type="number"
                value={returnSeconds}
                onChange={(e) => setReturnSeconds(Number(e.target.value))}
                min={10}
              />
              <div className="text-xs text-muted-foreground">Trang nhận key sẽ tự out về /free.</div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Giới hạn / 24h (theo fingerprint)</div>
              <Input
                type="number"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(Number(e.target.value))}
                min={1}
              />
              <div className="text-xs text-muted-foreground">Chặn spam tạo key vô hạn trên 1 thiết bị.</div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div>
                <div className="font-medium">Yêu cầu referrer Link4M</div>
                <div className="text-xs text-muted-foreground">
                  Nếu bật: gate sẽ kiểm tra document.referrer (có thể bị spoof, nhưng tăng độ khó).
                </div>
              </div>
              <Switch checked={requireRef} onCheckedChange={setRequireRef} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Ghi chú (hiện cho người dùng)</div>
              <Textarea
                value={publicNote}
                onChange={(e) => setPublicNote(e.target.value)}
                rows={4}
                placeholder="Ví dụ: cre, ghi chú, hướng dẫn..."
              />
              <div className="text-xs text-muted-foreground">Hiện trên /free và /free/claim (nếu có nội dung).</div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Link cộng đồng (mỗi dòng)</div>
              <Textarea
                value={publicLinksText}
                onChange={(e) => setPublicLinksText(e.target.value)}
                rows={4}
                placeholder={`Zalo|https://zalo.me/your-group|zalo\nYouTube|https://youtube.com/@yourchannel|youtube`}
              />
              <div className="text-xs text-muted-foreground">
                Format: <span className="font-mono">label|url|icon</span> (icon optional: zalo/youtube/telegram).
              </div>
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <div>
              <div className="font-medium">Link gốc (để copy/open)</div>
              <div className="text-xs text-muted-foreground">Trang nhận key dùng claim token, link gốc là base.</div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium">Trang chọn key</div>
              <div className="flex gap-2">
                <Input value={getKeyUrl} readOnly />
                <Button variant="secondary" onClick={() => copyText(getKeyUrl)}>
                  Copy
                </Button>
                <Button variant="outline" onClick={() => openUrl(getKeyUrl)}>
                  Open
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium">Gate callback</div>
              <div className="flex gap-2">
                <Input value={gateUrl} readOnly />
                <Button variant="secondary" onClick={() => copyText(gateUrl)}>
                  Copy
                </Button>
                <Button variant="outline" onClick={() => openUrl(gateUrl)}>
                  Open
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium">Trang nhận key (base)</div>
              <div className="flex gap-2">
                <Input value={claimBaseUrl} readOnly />
                <Button variant="secondary" onClick={() => copyText(claimBaseUrl)}>
                  Copy
                </Button>
                <Button variant="outline" onClick={() => openUrl(claimBaseUrl)}>
                  Open
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => saveSettings.mutate()} disabled={missingSettingsColumns || saveSettings.isPending}>
              Save settings
            </Button>
            <Button variant="secondary" onClick={() => settingsQuery.refetch()} disabled={settingsQuery.isFetching}>
              Reload
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            Updated: {settingsQuery.data?.updated_at ?? ""}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Key types (giờ/ngày)</CardTitle>
            <CardDescription>Chỉ loại nào bật thì trang /free mới hiện lựa chọn.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => disableAllKeyTypes.mutate()}
              disabled={missingKeyTypesTable || disableAllKeyTypes.isPending}
            >
              Disable all
            </Button>
            <Button
              variant="outline"
              onClick={() => keyTypesQuery.refetch()}
              disabled={missingKeyTypesTable || keyTypesQuery.isFetching}
            >
              Reload
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {missingKeyTypesTable ? (
            <Alert className="mb-4">
              <AlertTitle>DB chưa chạy migration cho Free Key Types</AlertTitle>
              <AlertDescription>
                <div className="space-y-2">
                  <div>
                    Hệ thống đang báo: <span className="font-mono">licenses_free_key_types</span> chưa có trong schema cache.
                  </div>
                  <div>
                    Hãy chạy migration <span className="font-mono">20260203093000_free_key_types_and_settings.sql</span> (và nếu
                    thiếu settings thì chạy thêm <span className="font-mono">20260202090807_7f0f8af7-d5f8-441e-96ff-66aa666b9326.sql</span>)
                    rồi reload schema cache:
                  </div>
                  <div className="rounded-md border p-2 font-mono text-xs">select pg_notify('pgrst','reload schema');</div>
                  <div>Tạm thời đã khóa các nút Create/Enable/DisableAll/Toggle để tránh spam lỗi.</div>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="mb-4 rounded-md border p-3">
            <div className="font-medium">Tạo / bật loại key</div>
            <div className="text-xs text-muted-foreground">Chọn loại + thời gian rồi bấm Create. Nếu đã tồn tại, sẽ tự bật.</div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <div className="text-sm font-medium">Loại</div>
                <Select
                  value={newKind}
                  onValueChange={(v) => setNewKind(v as any)}
                  disabled={missingKeyTypesTable}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hour">Giờ (1..24)</SelectItem>
                    <SelectItem value="day">Ngày (1..30)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Số</div>
                <Input
                  type="number"
                  value={newValue}
                  min={1}
                  max={newKind === "hour" ? 24 : 30}
                  onChange={(e) => setNewValue(Number(e.target.value))}
                  disabled={missingKeyTypesTable}
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Tên hiển thị (optional)</div>
                <Input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder={newKind === "hour" ? "Ví dụ: 6 giờ" : "Ví dụ: 3 ngày"}
                  disabled={missingKeyTypesTable}
                />
              </div>
            </div>

            <div className="mt-3">
              <Button onClick={() => createKeyType.mutate()} disabled={missingKeyTypesTable || createKeyType.isPending}>
                Create / Enable
              </Button>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>On</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Seconds</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(keyTypesQuery.data ?? []).map((k) => (
                <TableRow key={k.code}>
                  <TableCell className="w-16">
                    <Switch
                      checked={k.enabled}
                      disabled={missingKeyTypesTable || toggleKeyType.isPending}
                      onCheckedChange={(v) => {
                        if (missingKeyTypesTable) return;
                        toggleKeyType.mutate({ code: k.code, enabled: Boolean(v) });
                      }}
                    />
                  </TableCell>
                  <TableCell className="font-mono">{k.code}</TableCell>
                  <TableCell>{k.label}</TableCell>
                  <TableCell>{k.kind}</TableCell>
                  <TableCell>{k.value}</TableCell>
                  <TableCell className="font-mono">{k.duration_seconds}</TableCell>
                </TableRow>
              ))}
              {!keyTypesQuery.data?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    No rows
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Free keys monitor</CardTitle>
          <CardDescription>Log sessions + keys đã phát.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <div className="text-sm font-medium">Day (UTC)</div>
            <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Status</div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="started">started</SelectItem>
                <SelectItem value="gate_ok">gate_ok</SelectItem>
                <SelectItem value="revealed">revealed</SelectItem>
                <SelectItem value="closed">closed</SelectItem>
                <SelectItem value="init">init (legacy)</SelectItem>
                <SelectItem value="gate_returned">gate_returned (legacy)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">IP hash</div>
            <Input value={ipHash} onChange={(e) => setIpHash(e.target.value)} placeholder="sha256(ip)" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Sessions</CardTitle>
          <Button variant="secondary" onClick={() => sessionsQuery.refetch()} disabled={sessionsQuery.isFetching}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reveal</TableHead>
                <TableHead>IP hash</TableHead>
                <TableHead>FP hash</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(sessionsQuery.data ?? []).map((s) => (
                <TableRow key={s.session_id}>
                  <TableCell className="whitespace-nowrap">{s.created_at}</TableCell>
                  <TableCell>{s.status}</TableCell>
                  <TableCell className="font-mono">
                    {s.key_type_code ?? "-"} {s.duration_seconds ? `(${s.duration_seconds}s)` : ""}
                  </TableCell>
                  <TableCell>{s.reveal_count}</TableCell>
                  <TableCell className="font-mono">{s.ip_hash.slice(0, 10)}…</TableCell>
                  <TableCell className="font-mono">{s.fingerprint_hash.slice(0, 10)}…</TableCell>
                  <TableCell className="text-xs">{s.last_error ?? ""}</TableCell>
                </TableRow>
              ))}
              {!sessionsQuery.data?.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                    No rows
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Issued keys</CardTitle>
          <Button variant="secondary" onClick={() => issuesQuery.refetch()} disabled={issuesQuery.isFetching}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>IP hash</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(issuesQuery.data ?? []).map((i) => (
                <TableRow key={i.issue_id}>
                  <TableCell className="whitespace-nowrap">{i.created_at}</TableCell>
                  <TableCell className="whitespace-nowrap">{i.expires_at}</TableCell>
                  <TableCell className="font-mono">{i.key_mask}</TableCell>
                  <TableCell className="font-mono">{i.session_id.slice(0, 8)}…</TableCell>
                  <TableCell className="font-mono">{i.ip_hash.slice(0, 10)}…</TableCell>
                </TableRow>
              ))}
              {!issuesQuery.data?.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    No rows
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
