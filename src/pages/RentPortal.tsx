import { useMemo, useState } from "react";
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

type ApiOk<T> = { ok: true } & T;

type RentAccount = {
  id: string;
  username: string;
  created_at: string;
  activated_at: string | null;
  expires_at: string | null;
  max_devices: number;
  is_disabled: boolean;
  hmac_secret: string;
};

type RentKey = {
  id: string;
  key: string;
  created_at: string;
  is_active: boolean;
  note: string | null;
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
    ? "border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700"
    : "border border-muted-foreground/20 bg-muted px-2 py-1 text-xs font-medium text-muted-foreground";
}

export function RentPortalPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(LS_TOKEN);
  });

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [activationKey, setActivationKey] = useState("");
  const [showHmac, setShowHmac] = useState(false);
  const [customKey, setCustomKey] = useState("");
  const [keyNote, setKeyNote] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPass, setNewPass] = useState("");
  const [lastCreatedKey, setLastCreatedKey] = useState<string | null>(null);
  const [keySearch, setKeySearch] = useState("");
  const [keyStatusFilter, setKeyStatusFilter] = useState<KeyStatusFilter>("all");
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);

  const logout = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(LS_TOKEN);
    }
    setToken(null);
    setShowHmac(false);
    setLastCreatedKey(null);
    setSelectedKeyId(null);
    setKeyDialogOpen(false);
    qc.clear();
  };

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

  const recentLogsQ = useQuery({
    queryKey: ["rent", "key_logs", "recent", token],
    enabled: !!token && isActive,
    queryFn: async () => {
      const res = await postFunction<ApiOk<{ logs: RentKeyAuditLog[] }>>(
        "/rent-user",
        { action: "list_key_logs", limit: 20 },
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
      toast({
        title: "Đăng nhập thất bại",
        description: String(error?.message ?? error),
        variant: "destructive",
      });
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
      toast({
        title: "Kích hoạt thất bại",
        description: String(error?.message ?? error),
        variant: "destructive",
      });
    },
  });

  const createKeyM = useMutation({
    mutationFn: async (mode: "random" | "custom") => {
      const res = await postFunction<ApiOk<{ key: RentKey }>>(
        "/rent-user",
        {
          action: mode === "random" ? "generate_key" : "create_key",
          key: mode === "custom" ? normalizeKeyInput(customKey) : null,
          note: keyNote.trim() || null,
        },
        { authToken: token ?? undefined },
      );
      return res.key;
    },
    onSuccess: (createdKey) => {
      setLastCreatedKey(createdKey.key);
      setCustomKey("");
      setKeyNote("");
      qc.invalidateQueries({ queryKey: ["rent", "keys"] });
      qc.invalidateQueries({ queryKey: ["rent", "key_logs"] });
      toast({ title: "Đã tạo key" });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi tạo key",
        description: String(error?.message ?? error),
        variant: "destructive",
      });
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
      toast({
        title: "Lỗi cập nhật key",
        description: String(error?.message ?? error),
        variant: "destructive",
      });
    },
  });

  const deleteKeyM = useMutation({
    mutationFn: async (keyId: string) => {
      await postFunction<ApiOk<{}>>(
        "/rent-user",
        { action: "delete_key", key_id: keyId },
        { authToken: token ?? undefined },
      );
    },
    onSuccess: () => {
      if (selectedKeyId) {
        setKeyDialogOpen(false);
        setSelectedKeyId(null);
      }
      toast({ title: "Đã xóa key" });
      qc.invalidateQueries({ queryKey: ["rent", "keys"] });
      qc.invalidateQueries({ queryKey: ["rent", "key_logs"] });
      qc.invalidateQueries({ queryKey: ["rent", "key_devices"] });
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi xóa key",
        description: String(error?.message ?? error),
        variant: "destructive",
      });
    },
  });

  const resetPassM = useMutation({
    mutationFn: async () => {
      const targetUsername = account?.username ?? username.trim();
      const res = await postFunction<ApiOk<{}>>(
        "/rent-user",
        {
          action: "reset_password",
          username: targetUsername,
          code: resetCode.trim(),
          new_password: newPass,
        },
        {},
      );
      return res;
    },
    onSuccess: () => {
      toast({ title: "Đổi mật khẩu thành công" });
      setResetCode("");
      setNewPass("");
    },
    onError: (error: any) => {
      toast({
        title: "Đổi mật khẩu thất bại",
        description: String(error?.message ?? error),
        variant: "destructive",
      });
    },
  });

  const verifyJson = useMemo(() => {
    const targetUsername = account?.username ?? "name";
    return JSON.stringify(
      {
        username: targetUsername,
        key: "XXXX-XXXX-XXXX-XXXX",
        device_id: "your_device_id",
        ts: 1710000000,
        sig_user: "HMAC_SHA256_HEX(user_hmac_secret, username|key|device_id|ts)",
      },
      null,
      2,
    );
  }, [account?.username]);

  const filteredKeys = useMemo(() => {
    const query = keySearch.trim().toLowerCase();
    return (keysQ.data ?? []).filter((row) => {
      if (keyStatusFilter === "on" && !row.is_active) return false;
      if (keyStatusFilter === "off" && row.is_active) return false;
      if (!query) return true;
      const hay = `${row.key} ${row.note ?? ""}`.toLowerCase();
      return hay.includes(query);
    });
  }, [keysQ.data, keySearch, keyStatusFilter]);

  const openKeyDialog = (key: RentKey) => {
    setSelectedKeyId(key.id);
    setKeyDialogOpen(true);
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Thuê Website</h1>
          <p className="text-sm text-muted-foreground">
            Portal người thuê. Hình thức quản lý key bám theo kiểu admin để dễ dùng, nhưng lõi quyền vẫn tách riêng cho user domain.
          </p>
        </div>
        {token ? (
          <Button variant="soft" onClick={logout}>
            Đăng xuất
          </Button>
        ) : null}
      </div>

      {!token ? (
        <Card>
          <CardHeader>
            <CardTitle>Đăng nhập tài khoản thuê</CardTitle>
            <CardDescription>Đây là tài khoản user domain, không phải tài khoản admin domain.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="user123" />
            </div>
            <div className="space-y-2">
              <Label>Mật khẩu</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <div className="md:col-span-2">
              <Button onClick={() => loginM.mutate()} disabled={!username.trim() || !password || loginM.isPending}>
                {loginM.isPending ? "Đang đăng nhập..." : "Đăng nhập"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="status" className="w-full">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2">
            <TabsTrigger value="status">Trạng thái</TabsTrigger>
            <TabsTrigger value="keys" disabled={!isActive}>Keys</TabsTrigger>
            <TabsTrigger value="password">Đổi mật khẩu</TabsTrigger>
            <TabsTrigger value="info">Thông tin</TabsTrigger>
          </TabsList>

          <TabsContent value="status" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Trạng thái</CardTitle>
                <CardDescription>Kiểm tra tài khoản thuê đã kích hoạt và còn hạn hay chưa.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {meQ.isLoading ? (
                  <div className="text-sm text-muted-foreground">Đang tải...</div>
                ) : meQ.isError ? (
                  <div className="space-y-3">
                    <div className="text-sm text-destructive">Không lấy được trạng thái. Bạn có thể đăng xuất rồi đăng nhập lại.</div>
                    <Button variant="soft" onClick={logout}>Đăng xuất phiên lỗi</Button>
                  </div>
                ) : account ? (
                  <>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border p-3 text-sm">
                        <div className="text-xs text-muted-foreground">User</div>
                        <div className="font-medium">{account.username}</div>
                      </div>
                      <div className="rounded-lg border p-3 text-sm">
                        <div className="text-xs text-muted-foreground">Activated at</div>
                        <div className="font-medium">{fmtDate(account.activated_at)}</div>
                      </div>
                      <div className="rounded-lg border p-3 text-sm">
                        <div className="text-xs text-muted-foreground">Expires at</div>
                        <div className="font-medium">{account.expires_at ? fmtDate(account.expires_at) : "Chưa kích hoạt"}</div>
                      </div>
                      <div className="rounded-lg border p-3 text-sm">
                        <div className="text-xs text-muted-foreground">Max devices</div>
                        <div className="font-medium">{account.max_devices}</div>
                      </div>
                      <div className="rounded-lg border p-3 text-sm md:col-span-2">
                        <div className="text-xs text-muted-foreground">Disabled</div>
                        <div className="font-medium">{account.is_disabled ? "YES" : "NO"}</div>
                      </div>
                    </div>

                    {!isActive ? (
                      <>
                        <Separator />
                        <div className="space-y-2">
                          <Label>Nhập key kích hoạt</Label>
                          <Input
                            value={activationKey}
                            onChange={(e) => setActivationKey(e.target.value)}
                            placeholder="XXXX-XXXX-XXXX-XXXX"
                          />
                          <p className="text-xs text-muted-foreground">Nhập key kích hoạt để mở khóa tài khoản thuê.</p>
                          <Button onClick={() => activateM.mutate()} disabled={!activationKey.trim() || activateM.isPending}>
                            {activateM.isPending ? "Đang kích hoạt..." : "Kích hoạt"}
                          </Button>
                        </div>
                      </>
                    ) : null}
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">Chưa có dữ liệu.</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="keys" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Keys</CardTitle>
                <CardDescription>
                  Giao diện quản lý theo kiểu admin để dễ theo dõi, nhưng chỉ thao tác trên key của chính tài khoản thuê này. Không có quyền chạm vào Free/Licenses 1-2 thật.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isActive ? (
                  <div className="text-sm text-muted-foreground">Bạn cần kích hoạt trước khi tạo key.</div>
                ) : (
                  <>
                    <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
                      <div className="space-y-3 rounded-lg border p-4">
                        <div className="font-medium">Tạo key mới</div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Key tự nhập (để trống nếu muốn random)</Label>
                            <Input value={customKey} onChange={(e) => setCustomKey(e.target.value)} placeholder="ABCD-EFGH-IJKL-MNOP" />
                            <p className="text-xs text-muted-foreground">4 nhóm x 4 ký tự, chỉ A-Z và 0-9.</p>
                          </div>
                          <div className="space-y-2">
                            <Label>Note (tuỳ chọn)</Label>
                            <Input value={keyNote} onChange={(e) => setKeyNote(e.target.value)} placeholder="Ghi chú cho key" />
                            <p className="text-xs text-muted-foreground">Để bạn tự phân biệt key nào đang dùng.</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button onClick={() => createKeyM.mutate("random")} disabled={createKeyM.isPending}>
                            {createKeyM.isPending ? "Đang tạo..." : "Random key"}
                          </Button>
                          <Button
                            variant="soft"
                            onClick={() => createKeyM.mutate("custom")}
                            disabled={createKeyM.isPending || !customKey.trim()}
                          >
                            Tạo key theo ý
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-3 rounded-lg border p-4">
                        <div className="font-medium">Tóm tắt nhanh</div>
                        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                          <div className="rounded-md border p-3 text-sm">
                            <div className="text-xs text-muted-foreground">Tổng số key</div>
                            <div className="mt-1 text-lg font-semibold">{keysQ.data?.length ?? 0}</div>
                          </div>
                          <div className="rounded-md border p-3 text-sm">
                            <div className="text-xs text-muted-foreground">Đang bật</div>
                            <div className="mt-1 text-lg font-semibold">{(keysQ.data ?? []).filter((row) => row.is_active).length}</div>
                          </div>
                          <div className="rounded-md border p-3 text-sm">
                            <div className="text-xs text-muted-foreground">Audit log gần đây</div>
                            <div className="mt-1 text-lg font-semibold">{recentLogsQ.data?.length ?? 0}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {lastCreatedKey ? (
                      <div className="rounded-lg border p-3 text-sm">
                        <div className="text-xs text-muted-foreground">Key vừa tạo</div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <code className="rounded bg-muted px-2 py-1">{lastCreatedKey}</code>
                          <Button
                            size="sm"
                            variant="soft"
                            onClick={async () => {
                              const ok = await copyText(lastCreatedKey);
                              toast({ title: ok ? "Đã copy" : "Không copy được" });
                            }}
                          >
                            Copy
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setLastCreatedKey(null)}>
                            Ẩn
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    <Separator />

                    <div className="grid gap-3 md:grid-cols-[1fr,auto,auto,auto] md:items-end">
                      <div className="space-y-2">
                        <Label>Tìm key / note</Label>
                        <Input value={keySearch} onChange={(e) => setKeySearch(e.target.value)} placeholder="Search key/note..." />
                      </div>
                      <Button variant={keyStatusFilter === "all" ? "default" : "outline"} onClick={() => setKeyStatusFilter("all")}>All</Button>
                      <Button variant={keyStatusFilter === "on" ? "default" : "outline"} onClick={() => setKeyStatusFilter("on")}>Đang bật</Button>
                      <Button variant={keyStatusFilter === "off" ? "default" : "outline"} onClick={() => setKeyStatusFilter("off")}>Đang tắt</Button>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          qc.invalidateQueries({ queryKey: ["rent", "keys"] });
                          qc.invalidateQueries({ queryKey: ["rent", "key_logs"] });
                          qc.invalidateQueries({ queryKey: ["rent", "key_devices"] });
                        }}
                      >
                        Refresh
                      </Button>
                    </div>

                    <div className="rounded-lg border">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Key</TableHead>
                              <TableHead className="hidden md:table-cell">Created</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="hidden lg:table-cell">Note</TableHead>
                              <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {keysQ.isLoading ? (
                              <TableRow>
                                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Đang tải key...</TableCell>
                              </TableRow>
                            ) : filteredKeys.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Chưa có key phù hợp.</TableCell>
                              </TableRow>
                            ) : (
                              filteredKeys.map((key) => (
                                <TableRow key={key.id}>
                                  <TableCell>
                                    <div className="font-mono text-xs md:text-sm break-all">{key.key}</div>
                                    <div className="mt-1 text-xs text-muted-foreground md:hidden">{fmtDate(key.created_at)}</div>
                                    {key.note ? <div className="mt-1 text-xs text-muted-foreground lg:hidden">{key.note}</div> : null}
                                  </TableCell>
                                  <TableCell className="hidden md:table-cell whitespace-nowrap">{fmtDate(key.created_at)}</TableCell>
                                  <TableCell>
                                    <span className={statusPillClass(key.is_active)}>{key.is_active ? "ON" : "OFF"}</span>
                                  </TableCell>
                                  <TableCell className="hidden lg:table-cell max-w-[240px] truncate text-sm text-muted-foreground">{key.note || "-"}</TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex flex-wrap justify-end gap-2">
                                      <Button size="sm" variant="soft" onClick={() => openKeyDialog(key)}>Xem</Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={async () => {
                                          const ok = await copyText(key.key);
                                          toast({ title: ok ? "Đã copy" : "Không copy được" });
                                        }}
                                      >
                                        Copy
                                      </Button>
                                      <Button size="sm" variant="secondary" onClick={() => toggleKeyM.mutate(key)} disabled={toggleKeyM.isPending}>
                                        {key.is_active ? "Tắt" : "Bật"}
                                      </Button>
                                      <Button size="sm" variant="destructive" onClick={() => deleteKeyM.mutate(key.id)} disabled={deleteKeyM.isPending}>
                                        Xóa
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle>Audit log gần đây</CardTitle>
                  <CardDescription>Log xác thực và thao tác key của chính user này.</CardDescription>
                </div>
                <Button variant="secondary" onClick={() => recentLogsQ.refetch()} disabled={recentLogsQ.isFetching}>
                  Refresh
                </Button>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Result</TableHead>
                          <TableHead className="hidden md:table-cell">Device</TableHead>
                          <TableHead className="hidden md:table-cell">Key</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentLogsQ.isLoading ? (
                          <TableRow>
                            <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Đang tải log...</TableCell>
                          </TableRow>
                        ) : (recentLogsQ.data ?? []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Chưa có audit log nào.</TableCell>
                          </TableRow>
                        ) : (
                          (recentLogsQ.data ?? []).map((log) => (
                            <TableRow key={log.id}>
                              <TableCell className="whitespace-nowrap">{fmtDate(log.created_at)}</TableCell>
                              <TableCell>{log.action}</TableCell>
                              <TableCell>{log.result ?? "-"}</TableCell>
                              <TableCell className="hidden md:table-cell font-mono text-xs">{shortId(log.device_id, 18)}</TableCell>
                              <TableCell className="hidden md:table-cell font-mono text-xs">{shortId(log.key_id, 12)}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="password" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Đổi mật khẩu</CardTitle>
                <CardDescription>Nhập code và mật khẩu mới.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input value={account?.username ?? username} disabled placeholder="user123" />
                </div>
                <div className="space-y-2">
                  <Label>Reset code</Label>
                  <Input value={resetCode} onChange={(e) => setResetCode(e.target.value)} placeholder="RC-XXXX-XXXX-XXXX" />
                  <p className="text-xs text-muted-foreground">Code này do admin tạo, dùng 1 lần và có thời hạn.</p>
                </div>
                <div className="space-y-2">
                  <Label>Mật khẩu mới</Label>
                  <Input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="••••••••" />
                  <p className="text-xs text-muted-foreground">Đổi xong thì đăng nhập lại bằng mật khẩu mới.</p>
                </div>
                <Button onClick={() => resetPassM.mutate()} disabled={!resetCode.trim() || !newPass || resetPassM.isPending}>
                  {resetPassM.isPending ? "Đang đổi..." : "Đổi mật khẩu"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="info" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Thông tin</CardTitle>
                <CardDescription>HMAC được ẩn mặc định. API verify và Files/Downloads chỉ hiển thị tại tab này.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!account ? (
                  <div className="text-sm text-muted-foreground">Chưa có dữ liệu.</div>
                ) : (
                  <>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border p-3 text-sm">
                        <div className="text-xs text-muted-foreground">Username</div>
                        <div className="font-medium">{account.username}</div>
                      </div>
                      <div className="rounded-lg border p-3 text-sm">
                        <div className="text-xs text-muted-foreground">Created at</div>
                        <div className="font-medium">{fmtDate(account.created_at)}</div>
                      </div>
                      <div className="rounded-lg border p-3 text-sm">
                        <div className="text-xs text-muted-foreground">Activated at</div>
                        <div className="font-medium">{fmtDate(account.activated_at)}</div>
                      </div>
                      <div className="rounded-lg border p-3 text-sm">
                        <div className="text-xs text-muted-foreground">Expires at</div>
                        <div className="font-medium">{account.expires_at ? fmtDate(account.expires_at) : "Chưa kích hoạt"}</div>
                      </div>
                      <div className="rounded-lg border p-3 text-sm">
                        <div className="text-xs text-muted-foreground">Max devices</div>
                        <div className="font-medium">{account.max_devices}</div>
                      </div>
                      <div className="rounded-lg border p-3 text-sm">
                        <div className="text-xs text-muted-foreground">Disabled</div>
                        <div className="font-medium">{account.is_disabled ? "YES" : "NO"}</div>
                      </div>
                    </div>

                    <div className="rounded-lg border p-3 text-sm">
                      <div className="text-xs text-muted-foreground">HMAC</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <code className="max-w-full break-all rounded bg-muted px-2 py-1 text-xs">{maskSecret(account.hmac_secret, showHmac)}</code>
                        <Button size="sm" variant="soft" onClick={() => setShowHmac((value) => !value)}>
                          {showHmac ? "👁 Ẩn" : "👁 Hiện"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const ok = await copyText(account.hmac_secret);
                            toast({ title: ok ? "Đã copy" : "Không copy được" });
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-3 rounded-lg border p-4 text-sm">
                      <div>
                        <div className="font-medium">API verify</div>
                        <div className="text-muted-foreground">
                          Gửi request tới endpoint bên dưới để verify rent key từ app/menu/UI. Master secret đã tích hợp trong server, bạn không cần (và không thể) gửi từ client.
                        </div>
                      </div>

                      <div className="rounded-md bg-muted p-3 font-mono text-xs break-all">
                        {(import.meta.env.VITE_SUPABASE_URL as string | undefined)
                          ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rent-verify-key`
                          : "VITE_SUPABASE_URL/functions/v1/rent-verify-key"}
                      </div>

                      <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{verifyJson}</pre>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const ok = await copyText(verifyJson);
                            toast({ title: ok ? "Đã copy JSON mẫu" : "Không copy được" });
                          }}
                        >
                          Copy JSON mẫu
                        </Button>
                      </div>

                      <div className="text-xs text-muted-foreground">
                        Chữ ký user dùng công thức: <code>username|key|device_id|ts</code>, với <code>ts</code> là Unix time theo giây. Không có và không cần <code>sig_master</code> ở phía client.
                      </div>
                    </div>

                    <div className="space-y-3 rounded-lg border p-4 text-sm">
                      <div>
                        <div className="font-medium">Files / Downloads</div>
                        <div className="text-muted-foreground">Các mục bật ở admin sẽ hiện ở đây để bạn tải thủ công.</div>
                      </div>

                      <div className="space-y-2">
                        {(downloadsQ.data ?? []).map((item) => (
                          <div key={item.id} className="flex flex-col gap-2 rounded-lg border p-3 md:flex-row md:items-center md:justify-between">
                            <div className="min-w-0">
                              <div className="font-medium">{item.title}</div>
                              {item.note ? <div className="text-xs text-muted-foreground">{item.note}</div> : null}
                              <div className="mt-1 break-all text-xs text-muted-foreground">{item.url}</div>
                            </div>
                            <div>
                              <Button asChild size="sm" variant="soft">
                                <a href={item.url} target="_blank" rel="noreferrer">Tải về</a>
                              </Button>
                            </div>
                          </div>
                        ))}
                        {(downloadsQ.data ?? []).length === 0 ? (
                          <div className="text-sm text-muted-foreground">Hiện chưa có file nào được bật từ admin.</div>
                        ) : null}
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        <div className="font-medium">Hướng dẫn ngắn cho C++ / libcurl (fix SSL 60)</div>
                        <ol className="space-y-1 pl-5 text-muted-foreground">
                          <li>Tải file <code>sunny_login_ca_pack.zip</code> hoặc <code>SunnyCABundle.h</code>.</li>
                          <li>Giải nén để lấy file CA bundle, ví dụ <code>sunny_cacert.pem</code>.</li>
                          <li>Set libcurl trỏ tới file bundle bằng <code>CURLOPT_CAINFO</code>.</li>
                          <li>Nếu dùng <code>SunnyCABundle.h</code>, ghi nội dung bundle ra file tạm rồi cũng set <code>CURLOPT_CAINFO</code> tới file đó.</li>
                        </ol>
                        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{`curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 1L);
curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 2L);
curl_easy_setopt(curl, CURLOPT_CAINFO, "/path/to/sunny_cacert.pem");`}</pre>
                        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{`// Nếu dùng SunnyCABundle.h
// 1) ghi bundle ra file, ví dụ /data/user/0/app/cache/ca.pem
// 2) rồi set:
curl_easy_setopt(curl, CURLOPT_CAINFO, caPemPath);`}</pre>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={keyDialogOpen} onOpenChange={(open) => {
        setKeyDialogOpen(open);
        if (!open) setSelectedKeyId(null);
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Chi tiết key</DialogTitle>
            <DialogDescription>
              Giao diện giống kiểu admin để bạn dễ xem thiết bị bind và audit log, nhưng chỉ xem dữ liệu thuộc chính tài khoản thuê này.
            </DialogDescription>
          </DialogHeader>

          {!selectedKey ? (
            <div className="text-sm text-muted-foreground">Không có key được chọn.</div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border p-3 text-sm">
                  <div className="text-xs text-muted-foreground">Key</div>
                  <div className="mt-1 font-mono break-all">{selectedKey.key}</div>
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  <div className="text-xs text-muted-foreground">Created</div>
                  <div className="mt-1">{fmtDate(selectedKey.created_at)}</div>
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className="mt-1"><span className={statusPillClass(selectedKey.is_active)}>{selectedKey.is_active ? "ON" : "OFF"}</span></div>
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  <div className="text-xs text-muted-foreground">Note</div>
                  <div className="mt-1 break-all">{selectedKey.note || "-"}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={async () => {
                    const ok = await copyText(selectedKey.key);
                    toast({ title: ok ? "Đã copy" : "Không copy được" });
                  }}
                >
                  Copy key
                </Button>
                <Button variant="secondary" onClick={() => toggleKeyM.mutate(selectedKey)} disabled={toggleKeyM.isPending}>
                  {selectedKey.is_active ? "Tắt key" : "Bật key"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    keyDevicesQ.refetch();
                    keyLogsQ.refetch();
                  }}
                >
                  Refresh
                </Button>
                <Button variant="destructive" onClick={() => deleteKeyM.mutate(selectedKey.id)} disabled={deleteKeyM.isPending}>
                  Xóa key
                </Button>
              </div>

              <div className="space-y-3 rounded-lg border p-4">
                <div className="font-medium">Thiết bị đã bind</div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Device</TableHead>
                        <TableHead>First seen</TableHead>
                        <TableHead>Last seen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {keyDevicesQ.isLoading ? (
                        <TableRow>
                          <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">Đang tải device...</TableCell>
                        </TableRow>
                      ) : (keyDevicesQ.data ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">Key này chưa có device nào bind.</TableCell>
                        </TableRow>
                      ) : (
                        (keyDevicesQ.data ?? []).map((device) => (
                          <TableRow key={device.id}>
                            <TableCell className="font-mono text-xs break-all">{device.device_id}</TableCell>
                            <TableCell>{fmtDate(device.first_seen)}</TableCell>
                            <TableCell>{fmtDate(device.last_seen)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border p-4">
                <div className="font-medium">Audit log của key</div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead>Device</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {keyLogsQ.isLoading ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">Đang tải log...</TableCell>
                        </TableRow>
                      ) : (keyLogsQ.data ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">Chưa có log cho key này.</TableCell>
                        </TableRow>
                      ) : (
                        (keyLogsQ.data ?? []).map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="whitespace-nowrap">{fmtDate(log.created_at)}</TableCell>
                            <TableCell>{log.action}</TableCell>
                            <TableCell>{log.result ?? "-"}</TableCell>
                            <TableCell className="font-mono text-xs">{shortId(log.device_id, 18)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
