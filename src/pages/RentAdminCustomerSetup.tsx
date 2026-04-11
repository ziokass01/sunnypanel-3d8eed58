import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { postFunction } from "@/lib/functions";
import { getErrorMessage } from "@/lib/error-message";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RentCreateUserWithSetupCard } from "@/components/rent/RentCreateUserWithSetupCard";
import { RentClientIntegrationSection } from "@/components/rent/RentClientIntegrationSection";

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
  note: string | null;
};

type ActivationKeyRow = {
  id: string;
  code: string;
  duration_seconds: number | null;
  duration_days?: number | null;
  created_at: string;
  claimed_by: string | null;
  claimed_at: string | null;
  revoked_at: string | null;
  note: string | null;
  target_account_id: string | null;
};

type ResetCodeRow = {
  id: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
};

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function activationStatus(row: ActivationKeyRow) {
  if (row.revoked_at) return "Revoked";
  if (row.claimed_at) return "Claimed";
  return "Unused";
}

export function RentAdminCustomerSetupPage() {
  const { session } = useAuth();
  const authToken = session?.access_token ?? null;
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selected, setSelected] = useState<RentAccount | null>(null);
  const [openEdit, setOpenEdit] = useState(false);

  const [editMaxDevices, setEditMaxDevices] = useState("1");
  const [editDisabled, setEditDisabled] = useState(false);
  const [editNote, setEditNote] = useState("");

  const [issueDays, setIssueDays] = useState("30");
  const [issueNote, setIssueNote] = useState("");
  const [customActivationKey, setCustomActivationKey] = useState("");
  const [lastActivationKey, setLastActivationKey] = useState<string | null>(null);

  const [resetMinutes, setResetMinutes] = useState("30");
  const [lastResetCode, setLastResetCode] = useState<string | null>(null);

  const [customRotateHmac, setCustomRotateHmac] = useState("");
  const [lastNewHmac, setLastNewHmac] = useState<string | null>(null);

  const usersQ = useQuery({
    queryKey: ["rent-admin", "users", "customer-setup-page"],
    enabled: !!authToken,
    queryFn: async () => {
      const res = await postFunction<ApiOk<{ users: RentAccount[] }>>(
        "/admin-rent",
        { action: "list_users" },
        { authToken },
      );
      return res.users;
    },
  });

  const selectedUser = useMemo(() => {
    if (!selected) return null;
    return (usersQ.data ?? []).find((row) => row.id === selected.id) ?? selected;
  }, [selected, usersQ.data]);

  const activationKeysQ = useQuery({
    queryKey: ["rent-admin", "activation-keys", selectedUser?.id],
    enabled: !!authToken && !!selectedUser?.id && openEdit,
    queryFn: async () => {
      const res = await postFunction<ApiOk<{ keys: ActivationKeyRow[] }>>(
        "/admin-rent",
        { action: "list_activation_keys", account_id: selectedUser?.id ?? null, limit: 50 },
        { authToken },
      );
      return res.keys;
    },
  });

  const resetHistoryQ = useQuery({
    queryKey: ["rent-admin", "reset-codes", selectedUser?.id],
    enabled: !!authToken && !!selectedUser?.id && openEdit,
    queryFn: async () => {
      const res = await postFunction<ApiOk<{ rows: ResetCodeRow[] }>>(
        "/admin-rent",
        { action: "list_reset_codes", account_id: selectedUser!.id, limit: 20 },
        { authToken },
      );
      return res.rows;
    },
  });

  useEffect(() => {
    if (!selectedUser) return;
    setEditMaxDevices(String(selectedUser.max_devices ?? 1));
    setEditDisabled(!!selectedUser.is_disabled);
    setEditNote(selectedUser.note ?? "");
    setIssueDays("30");
    setIssueNote("");
    setCustomActivationKey("");
    setLastActivationKey(null);
    setResetMinutes("30");
    setLastResetCode(null);
    setCustomRotateHmac("");
    setLastNewHmac(null);
  }, [selectedUser?.id]);

  const invalidateUsers = () => {
    qc.invalidateQueries({ queryKey: ["rent-admin", "users"] });
    qc.invalidateQueries({ queryKey: ["rent-admin", "users", "customer-setup-page"] });
  };

  const deleteUserM = useMutation({
    mutationFn: async (accountId: string) => {
      await postFunction<ApiOk<Record<string, never>>>(
        "/admin-rent",
        { action: "delete_user", account_id: accountId },
        { authToken },
      );
    },
    onSuccess: () => {
      toast({ title: "Đã xóa user" });
      setSelected(null);
      setOpenEdit(false);
      invalidateUsers();
    },
    onError: (error: any) => {
      toast({ title: "Lỗi xóa user", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  const updateUserM = useMutation({
    mutationFn: async () => {
      if (!selectedUser) throw new Error("NO_SELECTED");
      const maxDevices = Math.max(1, Math.min(20, parseInt(editMaxDevices || "1", 10) || 1));
      const res = await postFunction<ApiOk<{ user: RentAccount }>>(
        "/admin-rent",
        {
          action: "update_user",
          account_id: selectedUser.id,
          max_devices: maxDevices,
          is_disabled: editDisabled,
          note: editNote.trim() || null,
        },
        { authToken },
      );
      return res.user;
    },
    onSuccess: (user) => {
      setSelected(user);
      toast({ title: "Đã lưu thay đổi" });
      invalidateUsers();
    },
    onError: (error: any) => {
      toast({ title: "Lỗi cập nhật", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  const issueKeyM = useMutation({
    mutationFn: async () => {
      if (!selectedUser) throw new Error("NO_SELECTED");
      const days = Math.max(1, Math.min(999999, parseInt(issueDays || "30", 10) || 30));
      const res = await postFunction<ApiOk<{ code: string; duration_seconds: number | null; duration_days?: number | null }>>(
        "/admin-rent",
        {
          action: "issue_activation",
          account_id: selectedUser.id,
          days,
          note: issueNote.trim() || null,
          custom_code: customActivationKey.trim() ? customActivationKey.trim().toUpperCase() : null,
        },
        { authToken },
      );
      return res;
    },
    onSuccess: (res) => {
      setLastActivationKey(res.code);
      setCustomActivationKey("");
      toast({ title: "Đã tạo activation key" });
      qc.invalidateQueries({ queryKey: ["rent-admin", "activation-keys", selectedUser?.id] });
    },
    onError: (error: any) => {
      toast({ title: "Lỗi tạo activation key", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  const deleteActivationKeyM = useMutation({
    mutationFn: async (keyId: string) => {
      await postFunction<ApiOk<Record<string, never>>>(
        "/admin-rent",
        { action: "delete_activation_key", key_id: keyId },
        { authToken },
      );
    },
    onSuccess: () => {
      toast({ title: "Đã xóa activation key" });
      qc.invalidateQueries({ queryKey: ["rent-admin", "activation-keys", selectedUser?.id] });
    },
    onError: (error: any) => {
      toast({ title: "Lỗi xóa key", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  const resetCodeM = useMutation({
    mutationFn: async () => {
      if (!selectedUser) throw new Error("NO_SELECTED");
      const minutes = Math.max(5, Math.min(24 * 60, parseInt(resetMinutes || "30", 10) || 30));
      const res = await postFunction<ApiOk<{ code: string; expires_at: string }>>(
        "/admin-rent",
        { action: "create_reset_code", account_id: selectedUser.id, minutes },
        { authToken },
      );
      return res;
    },
    onSuccess: (res) => {
      setLastResetCode(res.code);
      toast({ title: "Đã tạo reset code" });
      qc.invalidateQueries({ queryKey: ["rent-admin", "reset-codes", selectedUser?.id] });
    },
    onError: (error: any) => {
      toast({ title: "Lỗi tạo reset code", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  const rotateHmacM = useMutation({
    mutationFn: async () => {
      if (!selectedUser) throw new Error("NO_SELECTED");
      const res = await postFunction<ApiOk<{ new_hmac_secret: string; new_expires_at: string | null; penalized: boolean }>>(
        "/admin-rent",
        {
          action: "rotate_hmac",
          account_id: selectedUser.id,
          new_hmac: customRotateHmac.trim() || null,
        },
        { authToken },
      );
      return res;
    },
    onSuccess: (res) => {
      setLastNewHmac(res.new_hmac_secret);
      setCustomRotateHmac("");
      toast({
        title: res.penalized ? "Đã rotate HMAC (đã trừ 20% thời gian còn lại)" : "Đã rotate HMAC",
      });
      invalidateUsers();
    },
    onError: (error: any) => {
      toast({ title: "Lỗi rotate HMAC", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  const clearHmacViewPasswordM = useMutation({
    mutationFn: async () => {
      if (!selectedUser) throw new Error("NO_SELECTED");
      await postFunction<ApiOk<Record<string, never>>>(
        "/admin-rent",
        { action: "clear_hmac_view_password", account_id: selectedUser.id },
        { authToken },
      );
    },
    onSuccess: () => {
      toast({ title: "Đã xóa mật khẩu xem HMAC" });
    },
    onError: (error: any) => {
      toast({ title: "Lỗi xóa mật khẩu xem HMAC", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  const resetDefaultM = useMutation({
    mutationFn: async () => {
      if (!selectedUser) throw new Error("NO_SELECTED");
      await postFunction<ApiOk<Record<string, never>>>(
        "/admin-rent",
        { action: "reset_password_default", account_id: selectedUser.id },
        { authToken },
      );
    },
    onSuccess: () => {
      toast({ title: "Đã reset mật khẩu về mặc định" });
    },
    onError: (error: any) => {
      const message = getErrorMessage(error);
      toast({
        title: "Lỗi reset mật khẩu",
        description: message.includes("RENT_DEFAULT_PASSWORD_NOT_CONFIGURED")
          ? "Mật khẩu mặc định chưa được cấu hình. Vui lòng liên hệ quản trị hệ thống."
          : message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold">Thuê Website / Rent - Customer Setup</h1>
        <p className="text-sm text-muted-foreground">
          Giữ nguyên luồng tạo tài khoản + setup khách, đồng thời trả lại đầy đủ nhóm thao tác nhạy cảm trong popup Edit như tạo key, reset pass, rotate secret và reset code.
        </p>
      </div>

      {authToken ? (
        <RentCreateUserWithSetupCard
          authToken={authToken}
          onCreated={() => {
            invalidateUsers();
          }}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Danh sách user thuê</CardTitle>
          <CardDescription>
            Edit giờ có đủ cả setup khách lẫn nhóm thao tác key/reset/secret như bản admin đầy đủ.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Activated</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Max devices</TableHead>
                  <TableHead>Disabled</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(usersQ.data ?? []).map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.username}</TableCell>
                    <TableCell>{fmtDate(user.created_at)}</TableCell>
                    <TableCell>{fmtDate(user.activated_at)}</TableCell>
                    <TableCell>{user.expires_at ? fmtDate(user.expires_at) : "Chưa kích hoạt"}</TableCell>
                    <TableCell>{user.max_devices}</TableCell>
                    <TableCell>{user.is_disabled ? "YES" : "NO"}</TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button
                        size="sm"
                        variant="soft"
                        onClick={() => {
                          setSelected(user);
                          setOpenEdit(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          if (!window.confirm(`Xóa user ${user.username}?`)) return;
                          deleteUserM.mutate(user.id);
                        }}
                        disabled={deleteUserM.isPending}
                      >
                        Xóa
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(usersQ.data ?? []).length === 0 && !usersQ.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">Chưa có user thuê.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
          <div className="p-6">
            <DialogHeader>
              <DialogTitle>Edit setup khách + thao tác account</DialogTitle>
              <DialogDescription>
                Popup này gom lại đủ cả setup khách, tạo activation key, reset pass, rotate HMAC secret, reset code và chỉnh thông tin cơ bản.
              </DialogDescription>
            </DialogHeader>

            {selectedUser && authToken ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg border p-3 text-sm">
                  <div className="font-medium">{selectedUser.username}</div>
                  <div className="text-muted-foreground">
                    Created: {fmtDate(selectedUser.created_at)} • Activated: {fmtDate(selectedUser.activated_at)} • Expires: {selectedUser.expires_at ? fmtDate(selectedUser.expires_at) : "Chưa kích hoạt"}
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border p-4">
                  <div className="font-medium">(1) Thông tin cơ bản</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Max devices</Label>
                      <Input value={editMaxDevices} onChange={(e) => setEditMaxDevices(e.target.value)} />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <div className="font-medium">Disabled</div>
                        <div className="text-sm text-muted-foreground">Bật nếu muốn khóa user.</div>
                      </div>
                      <Switch checked={editDisabled} onCheckedChange={setEditDisabled} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Note</Label>
                      <Textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Ghi chú cho user" />
                    </div>
                  </div>
                  <Button onClick={() => updateUserM.mutate()} disabled={updateUserM.isPending}>
                    {updateUserM.isPending ? "Đang lưu..." : "Lưu thay đổi"}
                  </Button>
                </div>

                <div className="space-y-3 rounded-lg border p-4">
                  <div className="font-medium">(2) Tạo activation key</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Days</Label>
                      <Input value={issueDays} onChange={(e) => setIssueDays(e.target.value)} inputMode="numeric" placeholder="30" />
                    </div>
                    <div className="space-y-2">
                      <Label>Note</Label>
                      <Input value={issueNote} onChange={(e) => setIssueNote(e.target.value)} placeholder="vd: gói 30 ngày" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Key 1 tự nhập, để trống = Key 2 random</Label>
                      <Input value={customActivationKey} onChange={(e) => setCustomActivationKey(e.target.value)} placeholder="ABCD-EFGH-IJKL-MNOP" />
                      <p className="text-xs text-muted-foreground">Format XXXX-XXXX-XXXX-XXXX, A-Z/0-9.</p>
                    </div>
                  </div>
                  <Button onClick={() => issueKeyM.mutate()} disabled={issueKeyM.isPending}>
                    {issueKeyM.isPending ? "Đang tạo..." : "Tạo activation key"}
                  </Button>
                  {lastActivationKey ? (
                    <div className="rounded-lg border p-3 text-sm">
                      <div className="text-xs text-muted-foreground">Key vừa tạo</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <code className="rounded bg-muted px-2 py-1">{lastActivationKey}</code>
                        <Button
                          size="sm"
                          variant="soft"
                          onClick={async () => {
                            const ok = await copyText(lastActivationKey);
                            toast({ title: ok ? "Đã copy" : "Không copy được" });
                          }}
                        >
                          Copy
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setLastActivationKey(null)}>Ẩn</Button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-3 rounded-lg border p-4">
                  <div className="font-medium">(3) Danh sách activation keys + xóa key</div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Key</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Days</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Claimed at</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(activationKeysQ.data ?? []).map((row) => {
                          const status = activationStatus(row);
                          const disableDelete = status !== "Unused";
                          return (
                            <TableRow key={row.id}>
                              <TableCell className="font-mono text-xs">
                                <div>{row.code}</div>
                                {row.note ? <div className="text-[11px] text-muted-foreground">{row.note}</div> : null}
                              </TableCell>
                              <TableCell>{fmtDate(row.created_at)}</TableCell>
                              <TableCell>{row.duration_days ?? Math.round((row.duration_seconds ?? 0) / 86400)}</TableCell>
                              <TableCell>{status}</TableCell>
                              <TableCell>{row.claimed_at ? fmtDate(row.claimed_at) : "-"}</TableCell>
                              <TableCell className="space-x-2 text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    const ok = await copyText(row.code);
                                    toast({ title: ok ? "Đã copy" : "Không copy được" });
                                  }}
                                >
                                  Copy
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  title={disableDelete ? "đã dùng" : "Xóa key chưa dùng"}
                                  disabled={disableDelete || deleteActivationKeyM.isPending}
                                  onClick={() => deleteActivationKeyM.mutate(row.id)}
                                >
                                  Xóa
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {(activationKeysQ.data ?? []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Chưa có activation key nào.</TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border p-4">
                  <div className="font-medium">(4) Reset code</div>
                  <div className="space-y-2">
                    <Label>Minutes</Label>
                    <Input value={resetMinutes} onChange={(e) => setResetMinutes(e.target.value)} />
                  </div>
                  <Button variant="soft" onClick={() => resetCodeM.mutate()} disabled={resetCodeM.isPending}>
                    {resetCodeM.isPending ? "Đang tạo..." : "Tạo reset code"}
                  </Button>
                  {lastResetCode ? (
                    <div className="rounded-lg border p-3 text-sm">
                      <div className="text-xs text-muted-foreground">Code vừa tạo</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <code className="rounded bg-muted px-2 py-1">{lastResetCode}</code>
                        <Button
                          size="sm"
                          variant="soft"
                          onClick={async () => {
                            const ok = await copyText(lastResetCode);
                            toast({ title: ok ? "Đã copy" : "Không copy được" });
                          }}
                        >
                          Copy
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setLastResetCode(null)}>Ẩn</Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Created</TableHead>
                          <TableHead>Expires</TableHead>
                          <TableHead>Used at</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(resetHistoryQ.data ?? []).map((row) => (
                          <TableRow key={row.id}>
                            <TableCell>{fmtDate(row.created_at)}</TableCell>
                            <TableCell>{fmtDate(row.expires_at)}</TableCell>
                            <TableCell>{row.used_at ? fmtDate(row.used_at) : "-"}</TableCell>
                          </TableRow>
                        ))}
                        {(resetHistoryQ.data ?? []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">Chưa có reset code nào.</TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border p-4">
                  <div className="font-medium">(5) Reset pass / secret</div>
                  <div className="space-y-2">
                    <Label>Custom HMAC, để trống = random</Label>
                    <Input value={customRotateHmac} onChange={(e) => setCustomRotateHmac(e.target.value)} placeholder="để trống = random" />
                    <p className="text-xs text-muted-foreground">Nếu user còn hạn, rotate có thể trừ 20% thời gian còn lại.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="soft" onClick={() => rotateHmacM.mutate()} disabled={rotateHmacM.isPending}>
                      {rotateHmacM.isPending ? "Đang rotate..." : "Rotate HMAC"}
                    </Button>
                    <Button variant="soft" onClick={() => resetDefaultM.mutate()} disabled={resetDefaultM.isPending}>
                      {resetDefaultM.isPending ? "Đang reset..." : "Reset pass"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (!selectedUser) return;
                        if (!window.confirm(`Xóa mật khẩu xem HMAC của ${selectedUser.username}?`)) return;
                        clearHmacViewPasswordM.mutate();
                      }}
                      disabled={clearHmacViewPasswordM.isPending}
                    >
                      {clearHmacViewPasswordM.isPending ? "Đang xóa..." : "Xóa mật khẩu xem HMAC"}
                    </Button>
                  </div>
                  {lastNewHmac ? (
                    <div className="rounded-lg border p-3 text-sm">
                      <div className="text-xs text-muted-foreground">HMAC mới</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <code className="max-w-full break-all rounded bg-muted px-2 py-1">{lastNewHmac}</code>
                        <Button
                          size="sm"
                          variant="soft"
                          onClick={async () => {
                            const ok = await copyText(lastNewHmac);
                            toast({ title: ok ? "Đã copy" : "Không copy được" });
                          }}
                        >
                          Copy
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setLastNewHmac(null)}>Ẩn</Button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="font-medium">(6) Setup khách / integration</div>
                  <RentClientIntegrationSection
                    authToken={authToken}
                    accountId={selectedUser.id}
                    username={selectedUser.username}
                  />
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-muted-foreground">Chưa chọn user.</div>
            )}
          </div>

          <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t bg-background p-4">
            <Button variant="soft" onClick={() => { setOpenEdit(false); setSelected(null); }}>Đóng</Button>
            {selectedUser ? (
              <Button
                variant="destructive"
                onClick={() => {
                  if (!window.confirm(`Xóa user ${selectedUser.username}?`)) return;
                  deleteUserM.mutate(selectedUser.id);
                }}
                disabled={deleteUserM.isPending}
              >
                {deleteUserM.isPending ? "Đang xóa..." : "Xóa user"}
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
