import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";
import { getFunction, postFunction } from "@/lib/functions";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
  free_outbound_url_pass2?: string | null;
  free_min_delay_seconds_pass2?: number;
  free_link4m_rotate_days?: number;
  free_enabled: boolean;
  free_disabled_message: string;
  free_min_delay_seconds: number;
  free_min_delay_enabled?: boolean;
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
  requires_double_gate?: boolean;
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

type AdminTestResult = {
  ok: boolean;
  key?: string;
  expires_at?: string;
  ip_hash?: string | null;
  fp_hash?: string | null;
  session_id?: string | null;
  message?: string;
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

function formatVnDateTime(value?: string | null) {
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
    second: "2-digit",
  }).format(d);
}

function shortText(v?: string | null, n = 10) {
  const x = String(v ?? "").trim();
  if (!x) return "-";
  return x.length > n ? `${x.slice(0, n)}…` : x;
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



function isFreeSchemaMissingError(message: string) {
  const msg = String(message || "").toLowerCase();
  return (
    msg.includes("does not exist")
    || msg.includes("could not find the function")
    || msg.includes("check_free_ip_rate_limit")
    || msg.includes("check_free_fp_rate_limit")
    || msg.includes("licenses_free_")
    || msg.includes("relation")
  );
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

  const baseUrl = useMemo(() => (typeof window !== "undefined" ? window.location.origin : ""), []);
  const getKeyUrl = baseUrl ? `${baseUrl}/free` : "/free";
  const gateUrl = baseUrl ? `${baseUrl}/free/gate` : "/free/gate";
  const claimBaseUrl = baseUrl ? `${baseUrl}/free/claim` : "/free/claim";

  const openUrl = (u: string) => {
    if (!u) return;
    window.open(u, "_blank", "noopener");
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
          "id,free_outbound_url,free_outbound_url_pass2,free_link4m_rotate_days,free_min_delay_seconds,free_min_delay_seconds_pass2,free_enabled,free_disabled_message,free_min_delay_enabled,free_return_seconds,free_daily_limit_per_fingerprint,free_require_link4m_referrer,free_public_note,free_public_links,updated_at,updated_by",
        )
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return (data as any) as SettingsRow | null;
    },
  });

  const [outboundUrl, setOutboundUrl] = useState("");
  const [outboundUrlPass2, setOutboundUrlPass2] = useState("");
  const [rotateDays, setRotateDays] = useState(7);

  const [freeEnabled, setFreeEnabled] = useState(true);
  const [disabledMessage, setDisabledMessage] = useState("Trang GetKey đang tạm đóng.");
  const [minDelayEnabled, setMinDelayEnabled] = useState(true);
  const [minDelay, setMinDelay] = useState(25);
  const [minDelayPass2, setMinDelayPass2] = useState(25);
  const [returnSeconds, setReturnSeconds] = useState(10);
  const [dailyLimit, setDailyLimit] = useState(1);
  const [requireRef, setRequireRef] = useState(false);
  const [publicNote, setPublicNote] = useState("");
  const [publicLinksText, setPublicLinksText] = useState("");

  useEffect(() => {
    const s = settingsQuery.data;
    if (!s) return;
    setOutboundUrl(s.free_outbound_url ?? "");
    setOutboundUrlPass2((s as any).free_outbound_url_pass2 ?? "");
    setRotateDays(Number((s as any).free_link4m_rotate_days ?? 7));
    setFreeEnabled(Boolean(s.free_enabled));
    setDisabledMessage(s.free_disabled_message ?? "Trang GetKey đang tạm đóng.");
    setMinDelayEnabled(Boolean((s as any).free_min_delay_enabled ?? true));
    setMinDelay(Number(s.free_min_delay_seconds ?? 25));
    setMinDelayPass2(Number((s as any).free_min_delay_seconds_pass2 ?? s.free_min_delay_seconds ?? 25));
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
        free_outbound_url_pass2: outboundUrlPass2.trim() || null,
        free_link4m_rotate_days: Math.max(1, Math.floor(Number(rotateDays) || 7)),
        free_enabled: Boolean(freeEnabled),
        free_disabled_message: disabledMessage.trim() || "Trang GetKey đang tạm đóng.",
        free_min_delay_enabled: Boolean(minDelayEnabled),
        // IMPORTANT: when delay is disabled, force seconds = 0 (not 5/25)
        free_min_delay_seconds: minDelayEnabled ? Math.max(5, Math.floor(Number(minDelay) || 25)) : 0,
        free_min_delay_seconds_pass2: minDelayEnabled ? Math.max(5, Math.floor(Number(minDelayPass2) || 25)) : 0,
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
        .select("code,label,kind,value,duration_seconds,sort_order,enabled,requires_double_gate,updated_at")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any as KeyTypeRow[];
    },
  });

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

  const toggleVipKeyType = useMutation({
    mutationFn: async (args: { code: string; requires_double_gate: boolean }) => {
      const { error } = await supabase
        .from("licenses_free_key_types")
        .update({ requires_double_gate: args.requires_double_gate })
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

  const deleteKeyType = useMutation({
    mutationFn: async (code: string) => {
      const { error } = await supabase.from("licenses_free_key_types").delete().eq("code", code);
      if (error) throw error;
      return true;
    },
    onError: (e: any) => {
      toast({ title: "Delete failed", description: e?.message ?? "Error", variant: "destructive" });
    },
    onSuccess: async () => {
      toast({ title: "Deleted", description: "Key type removed" });
      await keyTypesQuery.refetch();
    },
  });

const disableAllKeyTypes = useMutation({
    mutationFn: async () => {
      // Some PostgREST/Supabase setups reject UPDATE without a WHERE clause.
      // Keep behavior (disable all) while satisfying that requirement.
      const { error } = await supabase
        .from("licenses_free_key_types")
        .update({ enabled: false })
        .eq("enabled", true);
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

  const [testKeyTypeCode, setTestKeyTypeCode] = useState<string>("h01");
  const [testDryRun, setTestDryRun] = useState(false);
  const [adminTestResult, setAdminTestResult] = useState<AdminTestResult | null>(null);
  const [adminTestDebug, setAdminTestDebug] = useState<{ payload: any; response?: any; error?: string } | null>(null);

  const [pingResult, setPingResult] = useState<any>(null);
  const [pingError, setPingError] = useState<string | null>(null);

  useEffect(() => {
    if (!keyTypesQuery.data?.length) return;
    if (keyTypesQuery.data.some((x) => x.code === testKeyTypeCode)) return;
    setTestKeyTypeCode(keyTypesQuery.data[0].code);
  }, [keyTypesQuery.data, testKeyTypeCode]);

  const adminTestGetKey = useMutation({
    mutationFn: async () => {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token;
      if (!token) {
        const err = new Error("ADMIN_AUTH_REQUIRED") as Error & { code?: string };
        err.code = "ADMIN_AUTH_REQUIRED";
        throw err;
      }

      const payload = { key_type_code: testKeyTypeCode, dry_run: testDryRun };
      setAdminTestDebug({ payload });

      const data = await postFunction("/admin-free-test", payload, { authToken: token });
      setAdminTestDebug({ payload, response: data });
      return (data ?? { ok: false, message: "NO_RESPONSE" }) as AdminTestResult;
    },
    onSuccess: (data) => {
      setAdminTestResult(data);
      toast({ title: data.ok ? "Test success" : "Test failed", description: data.message || "Completed" });
      sessionsQuery.refetch();
      issuesQuery.refetch();
    },
    onError: (e: any) => {
      const code = String(e?.code ?? "").trim();
      const msg = String(e?.message ?? "Error");
      setAdminTestDebug((prev) => (prev ? { ...prev, error: msg } : { payload: null, error: msg }));

      if (code === "ADMIN_AUTH_REQUIRED" || msg === "ADMIN_AUTH_REQUIRED") {
        toast({
          title: "Test failed",
          description: "ADMIN_AUTH_REQUIRED: Bạn cần đăng nhập và có quyền admin để chạy test.",
          variant: "destructive",
        });
        return;
      }

      const isFetch = msg.toLowerCase().includes("failed to fetch");
      toast({
        title: "Test failed",
        description: isFetch
          ? `${msg}. Gợi ý: (1) CORS/OPTIONS bị chặn, (2) deploy sai tên function (/admin-free-test vs /free-admin-test), (3) backend URL/project mismatch. (tried URLs thường nằm trong message)`
          : msg.includes("MISCONFIG")
            ? `${msg} (gợi ý: kiểm tra migration FREE_RATE_LIMIT đã apply)`
            : msg,
        variant: "destructive",
      });
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

  const freeSchemaHint = useMemo(() => {
    const errs = [
      settingsQuery.error,
      keyTypesQuery.error,
      sessionsQuery.error,
      issuesQuery.error,
    ]
      .map((e: any) => String(e?.message ?? ""))
      .filter(Boolean);
    const hit = errs.find((m) => isFreeSchemaMissingError(m));
    return hit ?? null;
  }, [settingsQuery.error, keyTypesQuery.error, sessionsQuery.error, issuesQuery.error]);

  const revokeLicense = useMutation({
    mutationFn: async (args: { issueId: string; licenseId: string }) => {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token;
      if (!token) throw new Error("UNAUTHORIZED");
      await postFunction(
        "/admin-free-delete-issued",
        { issue_id: args.issueId, license_id: args.licenseId, revoke: true, delete_issue: false, reason: "admin revoke" },
        { authToken: token },
      );
    },
    onSuccess: () => {
      toast({ title: "Updated", description: "Đã chặn key (is_active=false, expires_at=now)." });
      issuesQuery.refetch();
    },
    onError: (e: any) => {
      toast({ title: "Failed", description: e?.message ?? "Không thể chặn key.", variant: "destructive" });
    },
  });

  const blockIp = useMutation({
    mutationFn: async (args: { ipHash: string; reason: string }) => {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token;
      if (!token) throw new Error("UNAUTHORIZED");
      await postFunction("/admin-free-block", { ip_hash: args.ipHash, reason: args.reason || null }, { authToken: token });
    },
    onSuccess: () => {
      toast({ title: "Blocked", description: "IP hash đã được block vĩnh viễn." });
      sessionsQuery.refetch();
    },
    onError: (e: any) => toast({ title: "Block failed", description: e?.message ?? "Error", variant: "destructive" }),
  });

  const blockFp = useMutation({
    mutationFn: async (args: { fpHash: string; reason: string }) => {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token;
      if (!token) throw new Error("UNAUTHORIZED");
      await postFunction("/admin-free-block", { fingerprint_hash: args.fpHash, reason: args.reason || null }, { authToken: token });
    },
    onSuccess: () => {
      toast({ title: "Blocked", description: "Fingerprint hash đã được block vĩnh viễn." });
      sessionsQuery.refetch();
    },
    onError: (e: any) => toast({ title: "Block failed", description: e?.message ?? "Error", variant: "destructive" }),
  });

  const deleteSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token;
      if (!token) throw new Error("UNAUTHORIZED");
      await postFunction("/admin-free-delete-session", { session_id: sessionId }, { authToken: token });
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: "Session đã được xóa." });
      sessionsQuery.refetch();
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e?.message ?? "Error", variant: "destructive" }),
  });

  const deleteIssuedKey = useMutation({
    mutationFn: async (args: { issueId: string; licenseId: string; reason: string }) => {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token;
      if (!token) throw new Error("UNAUTHORIZED");
      await postFunction(
        "/admin-free-delete-issued",
        { issue_id: args.issueId, license_id: args.licenseId, revoke: true, delete_issue: true, reason: args.reason || "Deleted by admin" },
        { authToken: token },
      );
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: "Issued key record đã xóa và key đã revoke." });
      issuesQuery.refetch();
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e?.message ?? "Error", variant: "destructive" }),
  });


  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Free GetKey Settings</CardTitle>
          <CardDescription>
            Admin toàn quyền: mở/tắt trang GetKey, cấu hình Link4M, delay, auto-return, limit theo fingerprint.
          </CardDescription>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="soft" onClick={() => openUrl(getKeyUrl)}>
              Open GetKey
            </Button>
            <Button type="button" variant="outline" onClick={() => copyText(getKeyUrl)}>
              Copy GetKey URL
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {freeSchemaHint ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
              <div className="font-medium text-destructive">Thiếu cấu hình Free DB/RPC</div>
              <div className="mt-1 text-muted-foreground">
                Hãy apply các migration Free trong <span className="font-mono">supabase/migrations/*free*.sql</span>
                (đặc biệt RPC <span className="font-mono">check_free_ip_rate_limit</span>,
                <span className="font-mono">check_free_fp_rate_limit</span> và các bảng
                <span className="font-mono"> licenses_free_*</span>) rồi reload trang này.
              </div>
              <div className="mt-2 break-all font-mono text-xs">{freeSchemaHint}</div>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div>
              <div className="font-medium">Bật/tắt trang GetKey</div>
              <div className="text-xs text-muted-foreground">Tắt: người dùng không thể lấy key.</div>
            </div>
            <Switch checked={freeEnabled} onCheckedChange={setFreeEnabled} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Link4M outbound URL (https)</div>
              <Input
                value={outboundUrl}
                onChange={(e) => setOutboundUrl(e.target.value)}
                placeholder="https://link4m.co/st?api=YOUR_TOKEN&url=..."
                inputMode="url"
              />
              <div className="text-xs text-muted-foreground">
                Đây là link Link4M outbound. Hệ thống sẽ tự build URL dẫn về Gate bằng template:
                <div className="mt-1 font-mono text-xs">
                  • Dùng <span className="font-semibold">{`{GATE_URL}`}</span> (raw) hoặc <span className="font-semibold">{`{GATE_URL_ENC}`}</span> (encode)
                </div>
                <div className="mt-1 font-mono text-xs">Ví dụ: https://link4m.co/st?api=YOUR_TOKEN&url={"{GATE_URL_ENC}"}</div>
                <div className="mt-1">Với Link4M: bạn nên dùng placeholder. Riêng link Quick Link dạng <span className="font-mono">/st?api=...&amp;url=...</span> (hoặc api-shorten) thì backend sẽ tự thay tham số <span className="font-mono">url=...</span> bằng Gate URL. Nếu Link4M khác mà thiếu placeholder, backend sẽ báo lỗi <span className="font-mono">OUTBOUND_URL_TEMPLATE_INVALID</span>.</div>
              </div>
            

<div className="space-y-2">
  <div className="text-sm font-medium">Link4M outbound URL Pass2 (VIP)</div>
  <Input
    value={outboundUrlPass2}
    onChange={(e) => setOutboundUrlPass2(e.target.value)}
    placeholder="https://link4m.co/st?api=YOUR_TOKEN_PASS2&url=..."
    inputMode="url"
  />
  <div className="text-xs text-muted-foreground">
    Nếu trống: hệ thống sẽ dùng lại outbound Pass1. Link Pass2 cũng được giữ cố định theo bucket thời gian, không tạo mới mỗi lần Get Key. Nên dùng placeholder <span className="font-mono">{'{GATE_URL_ENC}'}</span>.
  </div>
</div>

<div className="space-y-2">
  <div className="text-sm font-medium">Rotate days (Link4M bucket)</div>
  <Input
    type="number"
    value={rotateDays}
    onChange={(e) => setRotateDays(Number(e.target.value))}
    min={1}
  />
  <div className="text-xs text-muted-foreground">
    Trong cùng 1 bucket, Link4M Pass1/Pass2 sẽ giữ nguyên link cố định. Hết số ngày này hệ thống mới tự đổi link mới. (Ví dụ: 7 ngày)
  </div>
</div>
</div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Thông báo khi tắt</div>
              <Textarea value={disabledMessage} onChange={(e) => setDisabledMessage(e.target.value)} rows={3} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-medium">Delay tối thiểu Pass1 (giây)</div>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-muted-foreground">Bật</div>
                  <Switch checked={minDelayEnabled} onCheckedChange={setMinDelayEnabled} />
                </div>
              </div>
              <Input
                type="number"
                value={minDelay}
                onChange={(e) => setMinDelay(Number(e.target.value))}
                min={5}
                disabled={!minDelayEnabled}
              />
              <div className="text-xs text-muted-foreground">
                {minDelayEnabled
                  ? "Gate chỉ hợp lệ sau thời gian này (chống spam/bypass cơ bản)."
                  : "Đang tắt: không kiểm tra delay ở /free/gate."}
              </div>
            </div>

<div className="space-y-2">
  <div className="text-sm font-medium">Delay tối thiểu Pass2 (giây)</div>
  <Input
    type="number"
    value={minDelayPass2}
    onChange={(e) => setMinDelayPass2(Number(e.target.value))}
    min={5}
    disabled={!minDelayEnabled}
  />
  <div className="text-xs text-muted-foreground">
    VIP 2-pass: Pass2 chỉ hợp lệ sau thời gian này (tính từ lúc Pass1 OK).
  </div>
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
                   Nếu bật: gate sẽ ưu tiên kiểm tra <span className="font-mono">document.referrer</span> có host chứa <span className="font-mono">link4m</span>.
                   Lưu ý: referrer có thể bị browser/shortlink chặn (policy/redirect). Hệ thống sẽ fallback cho qua nếu URL gate có token hợp lệ.
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
            <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
              Save settings
            </Button>
            <Button variant="secondary" onClick={() => settingsQuery.refetch()} disabled={settingsQuery.isFetching}>
              Reload
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            Updated: {formatVnDateTime(settingsQuery.data?.updated_at ?? "")}
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
              disabled={disableAllKeyTypes.isPending}
            >
              Disable all
            </Button>
            <Button variant="outline" onClick={() => keyTypesQuery.refetch()} disabled={keyTypesQuery.isFetching}>
              Reload
            </Button>
          </div>
        </CardHeader>
        <CardContent className="text-xs md:text-sm">
          <div className="mb-4 rounded-md border p-3">
            <div className="font-medium">Tạo / bật loại key</div>
            <div className="text-xs text-muted-foreground">Chọn loại + thời gian rồi bấm Create. Nếu đã tồn tại, sẽ tự bật.</div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <div className="text-sm font-medium">Loại</div>
                <Select value={newKind} onValueChange={(v) => setNewKind(v as any)}>
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
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Tên hiển thị (optional)</div>
                <Input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder={newKind === "hour" ? "Ví dụ: 6 giờ" : "Ví dụ: 3 ngày"}
                />
              </div>
            </div>

            <div className="mt-3">
              <Button onClick={() => createKeyType.mutate()} disabled={createKeyType.isPending}>
                Create / Enable
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>On</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Seconds</TableHead>
                <TableHead>VIP 2-pass</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(keyTypesQuery.data ?? []).map((k) => (
                <TableRow key={k.code}>
                  <TableCell className="w-16">
                    <Switch
                      checked={k.enabled}
                      onCheckedChange={(v) => toggleKeyType.mutate({ code: k.code, enabled: Boolean(v) })}
                    />
                  </TableCell>
                  <TableCell className="font-mono">{k.code}</TableCell>
                  <TableCell>{k.label}</TableCell>
                  <TableCell>{k.kind}</TableCell>
                  <TableCell>{k.value}</TableCell>
                  <TableCell className="font-mono">{k.duration_seconds}</TableCell>
                  <TableCell className="w-24">
                    <Switch
                      checked={Boolean((k as any).requires_double_gate ?? false)}
                      onCheckedChange={(v) => toggleVipKeyType.mutate({ code: k.code, requires_double_gate: Boolean(v) })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Delete"
                      onClick={() => {
                        const ok = window.confirm(`Delete key type ${k.code}? This cannot be undone.`);
                        if (ok) deleteKeyType.mutate(k.code);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!keyTypesQuery.data?.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                    No rows
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
            </Table>
          </div>
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
                <SelectItem value="gate_fail">gate_fail</SelectItem>
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
        <CardHeader>
          <CardTitle>🧪 Admin Test GetKey</CardTitle>
          <CardDescription>
            Chạy test server-side để kiểm tra flow phát key. Dùng thêm “Ping backend” để xem backend có phản hồi / CORS có ổn.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                setPingError(null);
                setPingResult(null);
                try {
                  const data = await getFunction("/free-config");
                  setPingResult(data);
                } catch (e: any) {
                  setPingError(String(e?.message ?? "PING_FAILED"));
                }
              }}
            >
              Ping backend (free-config)
            </Button>
          </div>

          {pingError ? <div className="text-sm text-destructive">{pingError}</div> : null}
          {pingResult ? (
            <div className="rounded-md border p-3 text-xs space-y-1">
              <div className="font-medium">Ping response</div>
              <pre className="whitespace-pre-wrap break-words">{JSON.stringify(pingResult, null, 2)}</pre>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <div className="text-sm font-medium">Key type</div>
              <Select value={testKeyTypeCode} onValueChange={setTestKeyTypeCode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(keyTypesQuery.data ?? []).map((k) => (
                    <SelectItem key={k.code} value={k.code}>
                      {k.code} - {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="text-sm">Dry run (không phát key)</div>
              <Switch checked={testDryRun} onCheckedChange={setTestDryRun} />
            </div>
            <div className="flex items-end">
              <Button onClick={() => adminTestGetKey.mutate()} disabled={adminTestGetKey.isPending || !testKeyTypeCode}>
                {adminTestGetKey.isPending ? "Testing..." : "Test"}
              </Button>
            </div>
          </div>

          {adminTestDebug ? (
            <div className="rounded-md border p-3 text-xs space-y-2">
              <div className="font-medium">Debug</div>
              <div>
                <div className="text-muted-foreground">Request payload</div>
                <pre className="whitespace-pre-wrap break-words">{JSON.stringify(adminTestDebug.payload, null, 2)}</pre>
              </div>
              {adminTestDebug.response ? (
                <div>
                  <div className="text-muted-foreground">Response JSON</div>
                  <pre className="whitespace-pre-wrap break-words">{JSON.stringify(adminTestDebug.response, null, 2)}</pre>
                </div>
              ) : null}
              {adminTestDebug.error ? (
                <div className="text-destructive">Error: {adminTestDebug.error}</div>
              ) : null}
            </div>
          ) : null}

          {adminTestResult ? (
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div>Result: {adminTestResult.ok ? "OK" : "FAILED"}</div>
              <div>Message: {adminTestResult.message || "-"}</div>
              <div>Key: {adminTestResult.key || "-"}</div>
              <div>Expires: {formatVnDateTime(adminTestResult.expires_at)}</div>
              <div>
                IP hash: <span className="font-mono">{shortText(adminTestResult.ip_hash, 12)}</span>
              </div>
              <div>
                FP hash: <span className="font-mono">{shortText(adminTestResult.fp_hash, 12)}</span>
              </div>
              <div>
                Session: <span className="font-mono">{shortText(adminTestResult.session_id, 12)}</span>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Sessions</CardTitle>
          <Button variant="secondary" onClick={() => sessionsQuery.refetch()} disabled={sessionsQuery.isFetching}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="text-xs md:text-sm">
          <div className="overflow-x-auto">
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
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(sessionsQuery.data ?? []).map((s) => (
                <TableRow key={s.session_id}>
                  <TableCell className="whitespace-nowrap">{formatVnDateTime(s.created_at)}</TableCell>
                  <TableCell>{s.status}</TableCell>
                  <TableCell className="font-mono">
                    {s.key_type_code ?? "-"} {s.duration_seconds ? `(${s.duration_seconds}s)` : ""}
                  </TableCell>
                  <TableCell>{s.reveal_count}</TableCell>
                  <TableCell className="font-mono">{shortText(s.ip_hash, 12)}</TableCell>
                  <TableCell className="font-mono">{shortText(s.fingerprint_hash, 12)}</TableCell>
                  <TableCell className="text-xs">{s.last_error ?? ""}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const reason = window.prompt("Lý do block IP (optional):", "manual block") ?? "";
                          if (s.ip_hash) blockIp.mutate({ ipHash: s.ip_hash, reason });
                        }}
                      >
                        Block IP
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const reason = window.prompt("Lý do block FP (optional):", "manual block") ?? "";
                          if (s.fingerprint_hash) blockFp.mutate({ fpHash: s.fingerprint_hash, reason });
                        }}
                      >
                        Block FP
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          const ok = window.confirm("Delete session này?");
                          if (ok) deleteSession.mutate(s.session_id);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!sessionsQuery.data?.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                    No rows
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
            </Table>
          </div>
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
          <div className="overflow-x-auto">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>IP hash</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(issuesQuery.data ?? []).map((i) => (
                <TableRow key={i.issue_id}>
                  <TableCell className="whitespace-nowrap">{formatVnDateTime(i.created_at)}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatVnDateTime(i.expires_at)}</TableCell>
                  <TableCell className="font-mono">{i.key_mask}</TableCell>
                  <TableCell className="font-mono">{shortText(i.session_id, 12)}</TableCell>
                  <TableCell className="font-mono">{shortText(i.ip_hash, 12)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openUrl(`/licenses/${i.license_id}`)}>
                        Open
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={revokeLicense.isPending}
                        onClick={() => {
                          const ok = window.confirm("Chặn key này? (is_active=false + expires_at=now)");
                          if (ok) revokeLicense.mutate({ issueId: i.issue_id, licenseId: i.license_id });
                        }}
                      >
                        Revoke
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={deleteIssuedKey.isPending}
                        onClick={() => {
                          const ok = window.confirm("Delete issued key record này? Key sẽ bị revoke trước khi xóa log.");
                          if (!ok) return;
                          const reason = window.prompt("Reason (optional):", "admin delete") ?? "";
                          deleteIssuedKey.mutate({ issueId: i.issue_id, licenseId: i.license_id, reason });
                        }}
                      >
                        Delete key
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!issuesQuery.data?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    No rows
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
