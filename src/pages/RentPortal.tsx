import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { postFunction } from "@/lib/functions";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ApiOk<T> = { ok: true } & T;

type RentAccount = {
  id: string;
  username: string;
  created_at: string;
  activated_at: string | null;
  expires_at: string | null;
  max_devices: number;
  is_disabled: boolean;
  hmac_secret: string | null;
  has_hmac_view_password?: boolean;
  hmac_view_locked_until?: string | null;
};

type RentKey = {
  id: string;
  key: string;
  created_at: string;
  expires_at: string | null;
  is_active: boolean;
  note: string | null;
  starts_on_first_use: boolean;
  duration_days: number | null;
  duration_value?: number | null;
  duration_unit?: "hour" | "day" | null;
  max_devices?: number | null;
  first_used_at: string | null;
};

type RentKeyDevice = {
  id: string;
  device_id: string;
  first_seen: string;
  last_seen: string;
};

type RentKeyAuditLog = {
  id: string;
  key_id: string | null;
  action: string;
  result: string | null;
  device_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
};

type DownloadItem = {
  id: string;
  title: string;
  url: string;
  note: string | null;
};

type KeyStatusFilter = "all" | "on" | "off";
type KeyStartMode = "immediate" | "first_use";
type DurationUnit = "hour" | "day";

type TabValue = "status" | "dashboard" | "create" | "history" | "audit" | "password" | "account" | "api";

const LS_TOKEN = "rent_token_v1";

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function normalizeKeyInput(input: string) {
  return input.trim().toUpperCase();
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function maskSecret(secret: string, show: boolean) {
  if (show) return secret;
  return "•".repeat(Math.max(16, Math.min(32, secret.length || 16)));
}

function shortId(input: string | null | undefined, keep = 8) {
  if (!input) return "-";
  return input.length <= keep ? input : `${input.slice(0, keep)}…`;
}

function statusPillClass(active: boolean) {
  return active
    ? "inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700"
    : "inline-flex rounded-full border border-muted-foreground/20 bg-muted px-2 py-1 text-xs font-medium text-muted-foreground";
}

function keyModeLabel(key: Pick<RentKey, "starts_on_first_use">) {
  return key.starts_on_first_use ? "Dùng lần đầu mới chạy" : "Chạy ngay";
}

function keyExpiryLabel(key: Pick<RentKey, "starts_on_first_use" | "first_used_at" | "expires_at">) {
  if (key.starts_on_first_use && !key.first_used_at) return "Chưa bắt đầu";
  if (!key.expires_at) return "Không giới hạn";
  return fmtDate(key.expires_at);
}

function getDurationValue(key: RentKey) {
  return Number(key.duration_value ?? key.duration_days ?? 0);
}

function getDurationUnit(key: RentKey): DurationUnit {
  return key.duration_unit === "hour" ? "hour" : "day";
}

function keyDurationLabel(key: Pick<RentKey, "duration_value" | "duration_unit" | "duration_days">) {
  const value = Number(key.duration_value ?? key.duration_days ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "-";
  const unit = key.duration_unit === "hour" ? "giờ" : "ngày";
  return `${value} ${unit}`;
}

function mapAuditAction(action: string) {
  const map: Record<string, string> = {
    verify: "Xác thực key",
    create_key_random: "Tạo key ngẫu nhiên",
    create_key_custom: "Tạo key tự chọn",
    update_key_config: "Cập nhật key",
    enable_key: "Bật key",
    disable_key: "Tắt key",
    delete_key: "Xóa key",
    start_key_first_use: "Bắt đầu tính hạn",
    set_hmac_view_password: "Đặt mật khẩu xem HMAC",
    unlock_hmac_view_password_success: "Mở khóa HMAC thành công",
    unlock_hmac_view_password_failed: "Mở khóa HMAC thất bại",
    copy_hmac_secret: "Sao chép HMAC",
    admin_clear_hmac_view_password: "Admin xóa mật khẩu xem HMAC",
  };
  return map[action] ?? action;
}

function mapAuditResult(result: string | null | undefined) {
  if (!result) return "-";
  const map: Record<string, string> = {
    VALID: "Hợp lệ",
    KEY_NOT_FOUND: "Không tìm thấy key",
    BAD_SIGNATURE: "Sai chữ ký",
    BAD_TIMESTAMP: "Sai thời gian",
    KEY_DISABLED: "Key đã tắt",
    KEY_EXPIRED: "Key đã hết hạn",
    DEVICE_LIMIT: "Vượt quá số thiết bị",
    KEY_BAD_DURATION: "Thời lượng không hợp lệ",
    KEY_TAMPERED: "Key không hợp lệ",
    ok: "Thành công",
    success: "Thành công",
  };
  return map[result] ?? result;
}

function formatLockTime(iso: string | null | undefined) {
  if (!iso) return null;
  const remainMs = new Date(iso).getTime() - Date.now();
  if (remainMs <= 0) return null;
  const sec = Math.ceil(remainMs / 1000);
  if (sec < 60) return `${sec} giây`;
  const min = Math.ceil(sec / 60);
  return `${min} phút`;
}

function isSoonExpired(key: RentKey) {
  if (!key.expires_at) return false;
  const diff = new Date(key.expires_at).getTime() - Date.now();
  return diff > 0 && diff <= 3 * 24 * 60 * 60 * 1000;
}

function calcCountdown(endAtMs: number | null) {
  if (!endAtMs) return 0;
  return Math.max(0, Math.ceil((endAtMs - Date.now()) / 1000));
}

export function RentPortalPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(LS_TOKEN);
  });

  const [tab, setTab] = useState<TabValue>("status");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [activationKey, setActivationKey] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [keyNote, setKeyNote] = useState("");
  const [durationValue, setDurationValue] = useState("30");
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("day");
  const [maxDevicesValue, setMaxDevicesValue] = useState("1");
  const [keyStartMode, setKeyStartMode] = useState<KeyStartMode>("immediate");
  const [resetCode, setResetCode] = useState("");
  const [newPass, setNewPass] = useState("");
  const [lastCreatedKey, setLastCreatedKey] = useState<string | null>(null);
  const [keySearch, setKeySearch] = useState("");
  const [keyStatusFilter, setKeyStatusFilter] = useState<KeyStatusFilter>("all");
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [editDurationValue, setEditDurationValue] = useState("30");
  const [editDurationUnit, setEditDurationUnit] = useState<DurationUnit>("day");
  const [editMaxDevicesValue, setEditMaxDevicesValue] = useState("1");
  const [editKeyStartMode, setEditKeyStartMode] = useState<KeyStartMode>("immediate");
  const [editKeyNote, setEditKeyNote] = useState("");
  const [hmacDialogOpen, setHmacDialogOpen] = useState(false);
  const [hmacPassword, setHmacPassword] = useState("");
  const [hmacPasswordConfirm, setHmacPasswordConfirm] = useState("");
  const [hmacUnlockPassword, setHmacUnlockPassword] = useState("");
  const [showHmac, setShowHmac] = useState(false);
  const [hmacSecret, setHmacSecret] = useState<string | null>(null);
  const [hmacVisibleUntil, setHmacVisibleUntil] = useState<number | null>(null);

  const logout = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(LS_TOKEN);
    }
    setToken(null);
    setShowHmac(false);
    setHmacSecret(null);
    setHmacVisibleUntil(null);
    setLastCreatedKey(null);
    setSelectedKeyId(null);
    setKeyDialogOpen(false);
    setHmacDialogOpen(false);
    qc.clear();
  };

  useEffect(() => {
    if (!showHmac || !hmacVisibleUntil) return;
    const timer = window.setInterval(() => {
      if (Date.now() >= hmacVisibleUntil) {
        setShowHmac(false);
        setHmacSecret(null);
        setHmacVisibleUntil(null);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [showHmac, hmacVisibleUntil]);

  const meQ = useQuery({
    queryKey: ["rent", "me", token],
    enabled: !!token,
    queryFn: async () => {
      const res = await postFunction<ApiOk<{ account: RentAccount }>>(
        "/rent-user",
        { action: "me" },
        { authToken: token ?? undefined },
      );
      return res.account;
    },
    retry: false,
  });

  const account = meQ.data;
  const isActive = !!account?.expires_at && new Date(account.expires_at).getTime() > Date.now() && !account.is_disabled;

  const keysQ = useQuery({
    queryKey: ["rent", "keys", token],
    enabled: !!token && isActive,
    queryFn: async () => {
      const res = await postFunction<ApiOk<{ keys: RentKey[] }>>(
        "/rent-user",
        { action: "list_keys" },
        { authToken: token ?? undefined },
      );
      return res.keys;
    },
    retry: false,
  });

  const logsQ = useQuery({
    queryKey: ["rent", "key_logs", token],
    enabled: !!token && isActive,
    queryFn: async () => {
      const res = await postFunction<ApiOk<{ logs: RentKeyAuditLog[] }>>(
        "/rent-user",
        { action: "list_key_logs", limit: 100 },
        { authToken: token ?? undefined },
      );
      return res.logs;
    },
    retry: false,
  });

  const downloadsQ = useQuery({
    queryKey: ["rent", "downloads", token],
    enabled: !!token,
    queryFn: async () => {
      const res = await postFunction<ApiOk<{ items: DownloadItem[] }>>(
        "/rent-user",
        { action: "list_downloads" },
        { authToken: token ?? undefined },
      );
      return res.items;
    },
    retry: false,
  });

  const selectedKey = useMemo(
    () => (keysQ.data ?? []).find((row) => row.id === selectedKeyId) ?? null,
    [keysQ.data, selectedKeyId],
  );

  const keyDevicesQ = useQuery({
    queryKey: ["rent", "key_devices", token, selectedKeyId],
    enabled: !!token && isActive && !!selectedKeyId,
    queryFn: async () => {
      const res = await postFunction<ApiOk<{ devices: RentKeyDevice[] }>>(
        "/rent-user",
        { action: "list_key_devices", key_id: selectedKeyId },
        { authToken: token ?? undefined },
      );
      return res.devices;
    },
    retry: false,
  });

  const keyLogsQ = useQuery({
    queryKey: ["rent", "key_logs", token, selectedKeyId],
    enabled: !!token && isActive && !!selectedKeyId,
    queryFn: async () => {
      const res = await postFunction<ApiOk<{ logs: RentKeyAuditLog[] }>>(
        "/rent-user",
        { action: "list_key_logs", key_id: selectedKeyId, limit: 30 },
        { authToken: token ?? undefined },
      );
      return res.logs;
    },
    retry: false,
  });

  const loginM = useMutation({
    mutationFn: async () => {
      const res = await postFunction<ApiOk<{ token: string }>>(
        "/rent-user",
        { action: "login", username: username.trim(), password },
        {},
      );
      return res.token;
    },
    onSuccess: (nextToken) => {
      if (typeof window !== "undefined") window.localStorage.setItem(LS_TOKEN, nextToken);
      setToken(nextToken);
      setPassword("");
      toast({ title: "Đăng nhập thành công" });
    },
    onError: (error: any) => {
      toast({ title: "Đăng nhập thất bại", description: String(error?.message ?? error), variant: "destructive" });
    },
  });

  const activateM = useMutation({
    mutationFn: async () => {
      const res = await postFunction<ApiOk<{ expires_at: string; activated_at: string | null }>>(
        "/rent-user",
        { action: "activate", code: activationKey.trim().toUpperCase() },
        { authToken: token ?? undefined },
      );
      return res;
    },
    onSuccess: (res) => {
      toast({ title: "Kích hoạt thành công", description: `Hết hạn: ${fmtDate(res.expires_at)}` });
      setActivationKey("");
      qc.invalidateQueries({ queryKey: ["rent", "me"] });
      qc.invalidateQueries({ queryKey: ["rent", "keys"] });
      qc.invalidateQueries({ queryKey: ["rent", "key_logs"] });
    },
    onError: (error: any) => {
      toast({ title: "Kích hoạt thất bại", description: String(error?.message ?? error), variant: "destructive" });
    },
  });

  const buildDurationPayload = (value: string, unit: DurationUnit) => {
    const parsed = Math.max(1, Math.min(999999, parseInt(value || "0", 10) || 1));
    return { duration_value: parsed, duration_unit: unit };
  };

  const createKeyM = useMutation({
    mutationFn: async (mode: "random" | "custom") => {
      const res = await postFunction<ApiOk<{ key: RentKey }>>(
        "/rent-user",
        {
          action: mode === "random" ? "generate_key" : "create_key",
          key: mode === "custom" ? normalizeKeyInput(customKey) : null,
          note: keyNote.trim() || null,
          start_mode: keyStartMode,
          max_devices: Math.max(1, Math.min(999999, parseInt(maxDevicesValue || "0", 10) || 1)),
          ...buildDurationPayload(durationValue, durationUnit),
        },
        { authToken: token ?? undefined },
      );
      return res.key;
    },
    onSuccess: (createdKey) => {
      setLastCreatedKey(createdKey.key);
      setCustomKey("");
      setKeyNote("");
      setDurationValue("30");
      setDurationUnit("day");
      setMaxDevicesValue("1");
      setKeyStartMode("immediate");
      qc.invalidateQueries({ queryKey: ["rent", "keys"] });
      qc.invalidateQueries({ queryKey: ["rent", "key_logs"] });
      toast({ title: "Đã tạo key" });
    },
    onError: (error: any) => {
      toast({ title: "Tạo key thất bại", description: String(error?.message ?? error), variant: "destructive" });
    },
  });

  const updateKeyM = useMutation({
    mutationFn: async () => {
      if (!selectedKey) throw new Error("Chưa chọn key");
      const res = await postFunction<ApiOk<{ key: RentKey }>>(
        "/rent-user",
        {
          action: "update_key",
          key_id: selectedKey.id,
          note: editKeyNote.trim() || null,
          start_mode: editKeyStartMode,
          max_devices: Math.max(1, Math.min(999999, parseInt(editMaxDevicesValue || "0", 10) || 1)),
          ...buildDurationPayload(editDurationValue, editDurationUnit),
        },
        { authToken: token ?? undefined },
      );
      return res.key;
    },
    onSuccess: () => {
      toast({ title: "Đã cập nhật key" });
      qc.invalidateQueries({ queryKey: ["rent", "keys"] });
      qc.invalidateQueries({ queryKey: ["rent", "key_logs"] });
      qc.invalidateQueries({ queryKey: ["rent", "key_logs", token, selectedKeyId] });
      setKeyDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Cập nhật thất bại", description: String(error?.message ?? error), variant: "destructive" });
    },
  });

  const toggleKeyM = useMutation({
    mutationFn: async (key: RentKey) => {
      const res = await postFunction<ApiOk<{ key: RentKey }>>(
        "/rent-user",
        { action: "toggle_key", key_id: key.id, is_active: !key.is_active },
        { authToken: token ?? undefined },
      );
      return res.key;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rent", "keys"] });
      qc.invalidateQueries({ queryKey: ["rent", "key_logs"] });
    },
    onError: (error: any) => {
      toast({ title: "Đổi trạng thái thất bại", description: String(error?.message ?? error), variant: "destructive" });
    },
  });

  const deleteKeyM = useMutation({
    mutationFn: async (keyId: string) => {
      await postFunction<ApiOk<Record<string, never>>>(
        "/rent-user",
        { action: "delete_key", key_id: keyId },
        { authToken: token ?? undefined },
      );
    },
    onSuccess: () => {
      toast({ title: "Đã xóa key" });
      qc.invalidateQueries({ queryKey: ["rent", "keys"] });
      qc.invalidateQueries({ queryKey: ["rent", "key_logs"] });
      setKeyDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Xóa key thất bại", description: String(error?.message ?? error), variant: "destructive" });
    },
  });

  const resetPassM = useMutation({
    mutationFn: async () => {
      await postFunction<ApiOk<Record<string, never>>>(
        "/rent-user",
        { action: "reset_password", username: account?.username ?? username.trim(), code: resetCode.trim(), new_password: newPass },
        {},
      );
    },
    onSuccess: () => {
      setResetCode("");
      setNewPass("");
      toast({ title: "Đổi mật khẩu thành công" });
    },
    onError: (error: any) => {
      toast({ title: "Đổi mật khẩu thất bại", description: String(error?.message ?? error), variant: "destructive" });
    },
  });

  const logoutM = useMutation({
    mutationFn: async () => {
      await postFunction<ApiOk<Record<string, never>>>(
        "/rent-user",
        { action: "logout" },
        { authToken: token ?? undefined },
      );
    },
    onSettled: () => {
      logout();
    },
  });

  const setHmacPasswordM = useMutation({
    mutationFn: async (passwordValue: string) => {
      const res = await postFunction<ApiOk<{ hmac_secret: string }>>(
        "/rent-user",
        { action: "set_hmac_view_password", password: passwordValue },
        { authToken: token ?? undefined },
      );
      return res;
    },
    onSuccess: (res) => {
      const until = Date.now() + 60_000;
      setHmacSecret(res.hmac_secret);
      setShowHmac(true);
      setHmacVisibleUntil(until);
      setHmacDialogOpen(false);
      setHmacPassword("");
      setHmacPasswordConfirm("");
      qc.invalidateQueries({ queryKey: ["rent", "me"] });
      qc.invalidateQueries({ queryKey: ["rent", "key_logs"] });
      toast({ title: "Đã đặt mật khẩu xem HMAC" });
    },
    onError: (error: any) => {
      toast({ title: "Không đặt được mật khẩu", description: String(error?.message ?? error), variant: "destructive" });
    },
  });

  const unlockHmacM = useMutation({
    mutationFn: async () => {
      const res = await postFunction<ApiOk<{ hmac_secret: string }>>(
        "/rent-user",
        { action: "unlock_hmac_view_password", password: hmacUnlockPassword },
        { authToken: token ?? undefined },
      );
      return res;
    },
    onSuccess: (res) => {
      const until = Date.now() + 60_000;
      setHmacSecret(res.hmac_secret);
      setShowHmac(true);
      setHmacVisibleUntil(until);
      setHmacDialogOpen(false);
      setHmacUnlockPassword("");
      qc.invalidateQueries({ queryKey: ["rent", "me"] });
      qc.invalidateQueries({ queryKey: ["rent", "key_logs"] });
      toast({ title: "Đã mở khóa HMAC" });
    },
    onError: (error: any) => {
      toast({ title: "Không mở khóa được", description: String(error?.message ?? error), variant: "destructive" });
      qc.invalidateQueries({ queryKey: ["rent", "me"] });
      qc.invalidateQueries({ queryKey: ["rent", "key_logs"] });
    },
  });

  const copyHmacM = useMutation({
    mutationFn: async () => {
      await postFunction<ApiOk<Record<string, never>>>(
        "/rent-user",
        { action: "log_copy_hmac_secret" },
        { authToken: token ?? undefined },
      );
    },
  });

  const keys = keysQ.data ?? [];
  const logs = logsQ.data ?? [];

  const filteredKeys = useMemo(() => {
    const q = keySearch.trim().toLowerCase();
    return keys.filter((key) => {
      const passStatus = keyStatusFilter === "all"
        ? true
        : keyStatusFilter === "on"
          ? key.is_active
          : !key.is_active;
      if (!passStatus) return false;
      if (!q) return true;
      return [key.key, key.note ?? "", keyModeLabel(key), keyDurationLabel(key), keyExpiryLabel(key)]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [keys, keySearch, keyStatusFilter]);

  const dashboardStats = useMemo(() => {
    const total = keys.length;
    const enabled = keys.filter((key) => key.is_active).length;
    const disabled = Math.max(0, total - enabled);
    const firstUse = keys.filter((key) => key.starts_on_first_use).length;
    const soonExpired = keys.filter((key) => isSoonExpired(key)).length;
    return { total, enabled, disabled, firstUse, soonExpired };
  }, [keys]);

  const openKeyDialog = (key: RentKey) => {
    setSelectedKeyId(key.id);
    setEditDurationValue(String(getDurationValue(key) || 30));
    setEditDurationUnit(getDurationUnit(key));
    setEditMaxDevicesValue(String(key.max_devices ?? 1));
    setEditKeyStartMode(key.starts_on_first_use ? "first_use" : "immediate");
    setEditKeyNote(key.note ?? "");
    setKeyDialogOpen(true);
  };

  const handleOpenHmac = () => {
    if (!account) return;
    setHmacPassword("");
    setHmacPasswordConfirm("");
    setHmacUnlockPassword("");
    setHmacDialogOpen(true);
  };

  const hmacCountdown = calcCountdown(hmacVisibleUntil);
  const lockRemain = formatLockTime(account?.hmac_view_locked_until);

  if (!token) {
    return (
      <div className="container max-w-xl py-10">
        <Card>
          <CardHeader>
            <CardTitle>Đăng nhập trang thuê</CardTitle>
            <CardDescription>Nhập tài khoản và mật khẩu để vào trang quản lý của bạn.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Tài khoản</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Nhập tài khoản" />
            </div>
            <div className="space-y-2">
              <Label>Mật khẩu</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Nhập mật khẩu" />
            </div>
            <Button className="w-full" onClick={() => loginM.mutate()} disabled={loginM.isPending}>
              {loginM.isPending ? "Đang đăng nhập..." : "Đăng nhập"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container space-y-6 py-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Thuê Website</h1>
          <p className="mt-2 text-sm text-muted-foreground">Quản lý tài khoản, key sử dụng, API xác thực và tệp tải xuống của bạn.</p>
        </div>
        <Button variant="secondary" onClick={() => logoutM.mutate()} disabled={logoutM.isPending}>
          Đăng xuất
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)} className="space-y-4">
        <div className="overflow-x-auto pb-1">
          <TabsList className="inline-flex h-auto min-w-max gap-2 rounded-xl p-1">
            <TabsTrigger value="status">Trạng thái</TabsTrigger>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="create">Tạo key</TabsTrigger>
            <TabsTrigger value="history">Lịch sử key</TabsTrigger>
            <TabsTrigger value="audit">Audit Log</TabsTrigger>
            <TabsTrigger value="password">Đổi mật khẩu</TabsTrigger>
            <TabsTrigger value="account">Thông tin tài khoản</TabsTrigger>
            <TabsTrigger value="api">API &amp; Tải xuống</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="status">
          <Card>
            <CardHeader>
              <CardTitle>Trạng thái</CardTitle>
              <CardDescription>Kiểm tra tài khoản thuê đã kích hoạt và còn hạn hay chưa.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">User</div><div className="mt-2 text-xl font-semibold">{account?.username ?? "-"}</div></div>
              <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">Activated at</div><div className="mt-2 text-xl font-semibold">{fmtDate(account?.activated_at)}</div></div>
              <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">Expires at</div><div className="mt-2 text-xl font-semibold">{fmtDate(account?.expires_at)}</div></div>
              <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">Disabled</div><div className="mt-2 text-xl font-semibold">{account?.is_disabled ? "YES" : "NO"}</div></div>
            </CardContent>
          </Card>

          {!isActive ? (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Kích hoạt tài khoản</CardTitle>
                <CardDescription>Nhập key kích hoạt để mở khóa tài khoản thuê.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Activation key</Label>
                  <Input value={activationKey} onChange={(e) => setActivationKey(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX" />
                </div>
                <Button onClick={() => activateM.mutate()} disabled={activateM.isPending || !activationKey.trim()}>
                  {activateM.isPending ? "Đang kích hoạt..." : "Kích hoạt"}
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="dashboard">
          <Card>
            <CardHeader>
              <CardTitle>Dashboard</CardTitle>
              <CardDescription>Xem nhanh tình trạng key hiện có.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">Tổng số key</div><div className="mt-2 text-2xl font-semibold">{dashboardStats.total}</div></div>
                <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">Đang bật</div><div className="mt-2 text-2xl font-semibold">{dashboardStats.enabled}</div></div>
                <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">Đang tắt</div><div className="mt-2 text-2xl font-semibold">{dashboardStats.disabled}</div></div>
                <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">Dùng lần đầu mới chạy</div><div className="mt-2 text-2xl font-semibold">{dashboardStats.firstUse}</div></div>
                <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">Sắp hết hạn</div><div className="mt-2 text-2xl font-semibold">{dashboardStats.soonExpired}</div></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setTab("create")}>Tạo key</Button>
                <Button variant="secondary" onClick={() => setTab("history")}>Lịch sử key</Button>
                <Button variant="secondary" onClick={() => setTab("audit")}>Audit Log</Button>
                <Button variant="outline" onClick={() => { keysQ.refetch(); logsQ.refetch(); }}>Làm mới</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle>Tạo key</CardTitle>
              <CardDescription>Tạo key mới để dùng với menu hoặc ứng dụng của bạn.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Key tự nhập (để trống nếu muốn random)</Label>
                <Input value={customKey} onChange={(e) => setCustomKey(e.target.value)} placeholder="ABCD-EFGH-IJKL-MNOP" />
                <p className="text-xs text-muted-foreground">4 nhóm x 4 ký tự, chỉ A-Z và 0-9.</p>
              </div>
              <div className="space-y-2">
                <Label>Ghi chú</Label>
                <Textarea value={keyNote} onChange={(e) => setKeyNote(e.target.value)} placeholder="Ghi chú cho key" rows={3} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Thời lượng</Label>
                  <Input type="number" min={1} max={999999} value={durationValue} onChange={(e) => setDurationValue(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Đơn vị</Label>
                  <Select value={durationUnit} onValueChange={(value) => setDurationUnit(value as DurationUnit)}>
                    <SelectTrigger><SelectValue placeholder="Chọn đơn vị" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hour">Giờ</SelectItem>
                      <SelectItem value="day">Ngày</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Số máy tối đa</Label>
                <Input
                  type="number"
                  min={1}
                  max={999999}
                  value={maxDevicesValue}
                  onChange={(e) => setMaxDevicesValue(e.target.value)}
                  placeholder="1"
                />
                <p className="text-xs text-muted-foreground">Từ 1 đến 999999 máy.</p>

                <Label>Kiểu chạy</Label>
                <div className="flex flex-wrap gap-2">
                  <Button variant={keyStartMode === "immediate" ? "default" : "outline"} onClick={() => setKeyStartMode("immediate")}>Chạy ngay</Button>
                  <Button variant={keyStartMode === "first_use" ? "default" : "outline"} onClick={() => setKeyStartMode("first_use")}>Dùng lần đầu mới chạy</Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => createKeyM.mutate("random")} disabled={createKeyM.isPending}>Tạo ngẫu nhiên</Button>
                <Button variant="secondary" onClick={() => createKeyM.mutate("custom")} disabled={createKeyM.isPending || !customKey.trim()}>Tạo key tự chọn</Button>
              </div>
              {lastCreatedKey ? (
                <div className="rounded-lg border p-3 text-sm">
                  <div className="text-xs text-muted-foreground">Key vừa tạo</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <code className="rounded bg-muted px-2 py-1 break-all">{lastCreatedKey}</code>
                    <Button size="sm" variant="soft" onClick={async () => { const ok = await copyText(lastCreatedKey); toast({ title: ok ? "Đã sao chép" : "Không sao chép được" }); }}>Sao chép</Button>
                    <Button size="sm" variant="ghost" onClick={() => setLastCreatedKey(null)}>Ẩn</Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Lịch sử key</CardTitle>
              <CardDescription>Tìm kiếm, xem và chỉnh sửa key của bạn.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[1fr,auto,auto,auto,auto] md:items-end">
                <div className="space-y-2">
                  <Label>Tìm key / ghi chú / kiểu chạy</Label>
                  <Input value={keySearch} onChange={(e) => setKeySearch(e.target.value)} placeholder="Tìm kiếm key" />
                </div>
                <Button variant={keyStatusFilter === "all" ? "default" : "outline"} onClick={() => setKeyStatusFilter("all")}>Tất cả</Button>
                <Button variant={keyStatusFilter === "on" ? "default" : "outline"} onClick={() => setKeyStatusFilter("on")}>Đang bật</Button>
                <Button variant={keyStatusFilter === "off" ? "default" : "outline"} onClick={() => setKeyStatusFilter("off")}>Đang tắt</Button>
                <Button variant="secondary" onClick={() => { keysQ.refetch(); logsQ.refetch(); }}>Làm mới</Button>
              </div>

              <div className="grid gap-3 md:hidden">
                {keysQ.isLoading ? <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Đang tải key...</div> : null}
                {!keysQ.isLoading && filteredKeys.length === 0 ? <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Chưa có key phù hợp.</div> : null}
                {filteredKeys.map((key) => (
                  <div key={key.id} className="rounded-xl border p-4 space-y-3">
                    <div className="font-mono text-sm break-all">{key.key}</div>
                    <div className="grid gap-2 text-sm">
                      <div><span className="text-muted-foreground">Hết hạn:</span> {keyExpiryLabel(key)}</div>
                      <div><span className="text-muted-foreground">Trạng thái:</span> <span className={statusPillClass(key.is_active)}>{key.is_active ? "ON" : "OFF"}</span></div>
                      <div><span className="text-muted-foreground">Kiểu chạy:</span> {keyModeLabel(key)}</div>
                      <div><span className="text-muted-foreground">Thời lượng:</span> {keyDurationLabel(key)}</div>
                      {key.note ? <div><span className="text-muted-foreground">Ghi chú:</span> {key.note}</div> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="soft" onClick={() => openKeyDialog(key)}>Xem / Sửa</Button>
                      <Button size="sm" variant="outline" onClick={async () => { const ok = await copyText(key.key); toast({ title: ok ? "Đã sao chép" : "Không sao chép được" }); }}>Sao chép</Button>
                      <Button size="sm" variant="secondary" onClick={() => toggleKeyM.mutate(key)} disabled={toggleKeyM.isPending}>{key.is_active ? "Tắt" : "Bật"}</Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteKeyM.mutate(key.id)} disabled={deleteKeyM.isPending}>Xóa</Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden rounded-lg border md:block">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Key</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Kiểu chạy</TableHead>
                        <TableHead>Thời lượng</TableHead>
                        <TableHead>Hết hạn</TableHead>
                        <TableHead>Trạng thái</TableHead>
                        <TableHead>Ghi chú</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {keysQ.isLoading ? (
                        <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Đang tải key...</TableCell></TableRow>
                      ) : filteredKeys.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Chưa có key phù hợp.</TableCell></TableRow>
                      ) : filteredKeys.map((key) => (
                        <TableRow key={key.id}>
                          <TableCell><div className="font-mono text-xs break-all">{key.key}</div></TableCell>
                          <TableCell className="whitespace-nowrap">{fmtDate(key.created_at)}</TableCell>
                          <TableCell>{keyModeLabel(key)}</TableCell>
                          <TableCell>{keyDurationLabel(key)}</TableCell>
                          <TableCell className="whitespace-nowrap">{keyExpiryLabel(key)}</TableCell>
                          <TableCell><span className={statusPillClass(key.is_active)}>{key.is_active ? "ON" : "OFF"}</span></TableCell>
                          <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">{key.note || "-"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button size="sm" variant="soft" onClick={() => openKeyDialog(key)}>Xem / Sửa</Button>
                              <Button size="sm" variant="outline" onClick={async () => { const ok = await copyText(key.key); toast({ title: ok ? "Đã sao chép" : "Không sao chép được" }); }}>Sao chép</Button>
                              <Button size="sm" variant="secondary" onClick={() => toggleKeyM.mutate(key)} disabled={toggleKeyM.isPending}>{key.is_active ? "Tắt" : "Bật"}</Button>
                              <Button size="sm" variant="destructive" onClick={() => deleteKeyM.mutate(key.id)} disabled={deleteKeyM.isPending}>Xóa</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle>Audit Log</CardTitle>
                <CardDescription>Lịch sử xác thực và thao tác gần đây.</CardDescription>
              </div>
              <Button variant="secondary" onClick={() => logsQ.refetch()} disabled={logsQ.isFetching}>Làm mới</Button>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:hidden">
                {logsQ.isLoading ? <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Đang tải log...</div> : null}
                {!logsQ.isLoading && logs.length === 0 ? <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Chưa có log nào.</div> : null}
                {logs.map((log) => {
                  const keyValue = keys.find((row) => row.id === log.key_id)?.key ?? "-";
                  return (
                    <div key={log.id} className="rounded-xl border p-4 space-y-2 text-sm">
                      <div className="font-medium">{mapAuditAction(log.action)}</div>
                      <div className="text-muted-foreground">{fmtDate(log.created_at)}</div>
                      <div>Kết quả: {mapAuditResult(log.result)}</div>
                      <div>Thiết bị: {shortId(log.device_id, 12)}</div>
                      <div className="break-all">Key: {keyValue}</div>
                    </div>
                  );
                })}
              </div>
              <div className="hidden rounded-lg border md:block">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Thời gian</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Kết quả</TableHead>
                        <TableHead>Thiết bị</TableHead>
                        <TableHead>Key</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logsQ.isLoading ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Đang tải log...</TableCell></TableRow> : null}
                      {!logsQ.isLoading && logs.length === 0 ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Chưa có log nào.</TableCell></TableRow> : null}
                      {logs.map((log) => {
                        const keyValue = keys.find((row) => row.id === log.key_id)?.key ?? "-";
                        return (
                          <TableRow key={log.id}>
                            <TableCell className="whitespace-nowrap">{fmtDate(log.created_at)}</TableCell>
                            <TableCell>{mapAuditAction(log.action)}</TableCell>
                            <TableCell>{mapAuditResult(log.result)}</TableCell>
                            <TableCell>{shortId(log.device_id, 12)}</TableCell>
                            <TableCell className="font-mono text-xs break-all">{keyValue}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="password">
          <Card>
            <CardHeader>
              <CardTitle>Đổi mật khẩu</CardTitle>
              <CardDescription>Nhập code và mật khẩu mới.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-xl">
              <div className="space-y-2">
                <Label>Reset code</Label>
                <Input value={resetCode} onChange={(e) => setResetCode(e.target.value)} placeholder="RC-XXXX-XXXX-XXXX" />
              </div>
              <div className="space-y-2">
                <Label>Mật khẩu mới</Label>
                <Input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Nhập mật khẩu mới" />
              </div>
              <Button onClick={() => resetPassM.mutate()} disabled={resetPassM.isPending || !resetCode.trim() || !newPass.trim()}>
                {resetPassM.isPending ? "Đang đổi mật khẩu..." : "Đổi mật khẩu"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account">
          <Card>
            <CardHeader>
              <CardTitle>Thông tin tài khoản</CardTitle>
              <CardDescription>Thông tin cơ bản của tài khoản thuê.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">Username</div><div className="mt-2 text-lg font-semibold break-all">{account?.username ?? "-"}</div></div>
              <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">Trạng thái tài khoản</div><div className="mt-2 text-lg font-semibold">{account?.is_disabled ? "Đã khóa" : isActive ? "Đang hoạt động" : "Chưa kích hoạt / hết hạn"}</div></div>
              <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">Ngày tạo</div><div className="mt-2 text-lg font-semibold">{fmtDate(account?.created_at)}</div></div>
              <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">Kích hoạt lúc</div><div className="mt-2 text-lg font-semibold">{fmtDate(account?.activated_at)}</div></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api">
          <Card>
            <CardHeader>
              <CardTitle>API &amp; Tải xuống</CardTitle>
              <CardDescription>Thông tin xác thực, JSON mẫu và các tệp hỗ trợ.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-xl border p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">HMAC</div>
                    <div className="text-sm text-muted-foreground">Dùng để ký <code>sig_user</code>. Master secret đã tích hợp trong server, bạn không cần và cũng không thể gửi từ client.</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={handleOpenHmac}>Xem HMAC</Button>
                    {showHmac ? <Button variant="ghost" onClick={() => { setShowHmac(false); setHmacSecret(null); setHmacVisibleUntil(null); }}>Ẩn HMAC</Button> : null}
                  </div>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 font-mono text-sm break-all">{maskSecret(hmacSecret ?? "", showHmac)}</div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {showHmac && hmacCountdown > 0 ? <span>Còn {hmacCountdown} giây</span> : null}
                  {lockRemain ? <span>Đang khóa tạm: {lockRemain}</span> : null}
                </div>
                {showHmac && hmacCountdown > 0 ? (
                  <Button
                    variant="soft"
                    onClick={async () => {
                      const ok = await copyText(hmacSecret ?? "");
                      if (ok) copyHmacM.mutate();
                      toast({ title: ok ? "Đã sao chép" : "Không sao chép được" });
                    }}
                  >
                    Sao chép
                  </Button>
                ) : null}
              </div>

              <div className="rounded-xl border p-4 space-y-3">
                <div className="font-medium">API verify</div>
                <code className="block rounded-lg bg-muted p-3 text-xs break-all">POST {import.meta.env.VITE_SUPABASE_URL}/functions/v1/rent-verify-key</code>
                <div className="text-sm text-muted-foreground">JSON mẫu chỉ dùng <code>sig_user</code>. Master secret đã nằm trong server.</div>
                <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">{`{
  "username": "${account?.username ?? "name"}",
  "key": "XXXX-XXXX-XXXX-XXXX",
  "device_id": "device-name",
  "ts": 1710000000,
  "sig_user": "HMAC_SHA256_HEX(user_hmac_secret, username|key|device_id|ts)"
}`}</pre>
              </div>

              <div className="rounded-xl border p-4 space-y-4">
                <div>
                  <div className="font-medium">Files / Downloads</div>
                  <div className="text-sm text-muted-foreground">Tải các tệp hỗ trợ sử dụng cho app, menu hoặc C++/libcurl.</div>
                </div>
                <div className="grid gap-3">
                  {(downloadsQ.data ?? []).map((item) => (
                    <div key={item.id} className="rounded-lg border p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="font-medium">{item.title}</div>
                        {item.note ? <div className="text-sm text-muted-foreground">{item.note}</div> : null}
                      </div>
                      <Button asChild>
                        <a href={item.url} target="_blank" rel="noreferrer">Tải xuống</a>
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border p-4 text-sm space-y-2">
                  <div className="font-medium">Hướng dẫn C++ / libcurl</div>
                  <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                    <li>Tải file CA pack về máy và giải nén.</li>
                    <li>Trỏ <code>CURLOPT_CAINFO</code> tới file CA bundle đã giải nén.</li>
                    <li>Nếu dùng <code>SunnyCABundle.h</code>, hãy ghi bundle ra file rồi set lại <code>CURLOPT_CAINFO</code>.</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={keyDialogOpen} onOpenChange={setKeyDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Chi tiết key</DialogTitle>
            <DialogDescription>Xem thiết bị đã dùng và chỉnh sửa cấu hình key.</DialogDescription>
          </DialogHeader>
          {selectedKey ? (
            <div className="space-y-5">
              <div className="rounded-lg border p-4">
                <div className="font-mono text-sm break-all">{selectedKey.key}</div>
                <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                  <div>Ngày tạo: {fmtDate(selectedKey.created_at)}</div>
                  <div>Hết hạn: {keyExpiryLabel(selectedKey)}</div>
                  <div>Kiểu chạy: {keyModeLabel(selectedKey)}</div>
                  <div>Thời lượng: {keyDurationLabel(selectedKey)}</div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Thời lượng</Label>
                  <Input type="number" min={1} max={999999} value={editDurationValue} onChange={(e) => setEditDurationValue(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Đơn vị</Label>
                  <Select value={editDurationUnit} onValueChange={(value) => setEditDurationUnit(value as DurationUnit)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hour">Giờ</SelectItem>
                      <SelectItem value="day">Ngày</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Số máy tối đa</Label>
                <Input
                  type="number"
                  min={1}
                  max={999999}
                  value={editMaxDevicesValue}
                  onChange={(e) => setEditMaxDevicesValue(e.target.value)}
                  placeholder="1"
                />
                <p className="text-xs text-muted-foreground">Từ 1 đến 999999 máy.</p>

                <Label>Kiểu chạy</Label>
                <div className="flex flex-wrap gap-2">
                  <Button variant={editKeyStartMode === "immediate" ? "default" : "outline"} onClick={() => setEditKeyStartMode("immediate")}>Chạy ngay</Button>
                  <Button variant={editKeyStartMode === "first_use" ? "default" : "outline"} onClick={() => setEditKeyStartMode("first_use")}>Dùng lần đầu mới chạy</Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Ghi chú</Label>
                <Textarea value={editKeyNote} onChange={(e) => setEditKeyNote(e.target.value)} rows={3} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => updateKeyM.mutate()} disabled={updateKeyM.isPending}>{updateKeyM.isPending ? "Đang lưu..." : "Lưu thay đổi"}</Button>
                <Button variant="secondary" onClick={() => toggleKeyM.mutate(selectedKey)} disabled={toggleKeyM.isPending}>{selectedKey.is_active ? "Tắt key" : "Bật key"}</Button>
                <Button variant="outline" onClick={async () => { const ok = await copyText(selectedKey.key); toast({ title: ok ? "Đã sao chép" : "Không sao chép được" }); }}>Sao chép</Button>
                <Button variant="destructive" onClick={() => deleteKeyM.mutate(selectedKey.id)} disabled={deleteKeyM.isPending}>Xóa key</Button>
              </div>

              <Separator />

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Thiết bị đã dùng</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {keyDevicesQ.isLoading ? <div className="text-muted-foreground">Đang tải thiết bị...</div> : null}
                    {(keyDevicesQ.data ?? []).length === 0 && !keyDevicesQ.isLoading ? <div className="text-muted-foreground">Chưa có thiết bị nào.</div> : null}
                    {(keyDevicesQ.data ?? []).map((device) => (
                      <div key={device.id} className="rounded-lg border p-3">
                        <div className="font-mono break-all">{device.device_id}</div>
                        <div className="mt-1 text-muted-foreground">Lần đầu: {fmtDate(device.first_seen)}</div>
                        <div className="text-muted-foreground">Lần cuối: {fmtDate(device.last_seen)}</div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Audit log của key</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {keyLogsQ.isLoading ? <div className="text-muted-foreground">Đang tải log...</div> : null}
                    {(keyLogsQ.data ?? []).length === 0 && !keyLogsQ.isLoading ? <div className="text-muted-foreground">Chưa có log nào.</div> : null}
                    {(keyLogsQ.data ?? []).map((log) => (
                      <div key={log.id} className="rounded-lg border p-3">
                        <div className="font-medium">{mapAuditAction(log.action)}</div>
                        <div className="text-muted-foreground">{fmtDate(log.created_at)}</div>
                        <div>Kết quả: {mapAuditResult(log.result)}</div>
                        <div>Thiết bị: {shortId(log.device_id, 12)}</div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={hmacDialogOpen} onOpenChange={setHmacDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mật khẩu xem HMAC</DialogTitle>
            <DialogDescription>
              {account?.has_hmac_view_password ? "Nhập đúng mật khẩu để mở HMAC trong 60 giây." : "Bạn cần đặt mật khẩu xem HMAC trước khi mở."}
            </DialogDescription>
          </DialogHeader>
          {account?.has_hmac_view_password ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Mật khẩu xem HMAC</Label>
                <Input type="password" value={hmacUnlockPassword} onChange={(e) => setHmacUnlockPassword(e.target.value)} placeholder="Nhập mật khẩu" />
              </div>
              {lockRemain ? <div className="text-sm text-destructive">Bạn đang bị khóa tạm. Thử lại sau {lockRemain}.</div> : null}
              <Button onClick={() => unlockHmacM.mutate()} disabled={unlockHmacM.isPending || !hmacUnlockPassword.trim() || !!lockRemain}>
                {unlockHmacM.isPending ? "Đang mở khóa..." : "Xem HMAC"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Mật khẩu mới</Label>
                <Input type="password" value={hmacPassword} onChange={(e) => setHmacPassword(e.target.value)} placeholder="Ví dụ: vip2026" />
              </div>
              <div className="space-y-2">
                <Label>Nhập lại mật khẩu mới</Label>
                <Input type="password" value={hmacPasswordConfirm} onChange={(e) => setHmacPasswordConfirm(e.target.value)} placeholder="Nhập lại mật khẩu" />
              </div>
              <p className="text-xs text-muted-foreground">Tối thiểu 4 ký tự, có cả chữ và số.</p>
              <Button
                onClick={() => {
                  const pwd = hmacPassword.trim();
                  if (!/[A-Za-z]/.test(pwd) || !/[0-9]/.test(pwd) || pwd.length < 4) {
                    toast({ title: "Mật khẩu chưa hợp lệ", description: "Cần ít nhất 4 ký tự và phải có cả chữ lẫn số.", variant: "destructive" });
                    return;
                  }
                  if (pwd !== hmacPasswordConfirm.trim()) {
                    toast({ title: "Mật khẩu chưa khớp", description: "Hai ô nhập lại phải giống nhau.", variant: "destructive" });
                    return;
                  }
                  setHmacPassword(pwd);
                  setHmacPasswordConfirm(hmacPasswordConfirm.trim());
                  setHmacPasswordM.mutate(pwd);
                }}
                disabled={setHmacPasswordM.isPending || !hmacPassword.trim() || !hmacPasswordConfirm.trim()}
              >
                {setHmacPasswordM.isPending ? "Đang lưu..." : "Đặt mật khẩu và mở HMAC"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
