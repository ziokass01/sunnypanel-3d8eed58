import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { getFunction, postFunction } from "@/lib/functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";

type TenantRow = {
  tenant_id: string;
  username: string;
  auth_user_id: string;
  created_at: string;
  subscription_expires_at: string | null;
  secret_version: number;
  rotate_count: number;
  note: string | null;
};

export default function AdminRentPage() {
  const { toast } = useToast();

  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newNote, setNewNote] = useState("");
  const [creating, setCreating] = useState(false);

  const [dialog, setDialog] = useState<
    | null
    | { type: "activation"; tenant: TenantRow }
    | { type: "rotate"; tenant: TenantRow }
    | { type: "reset"; tenant: TenantRow }
    | { type: "delete"; tenant: TenantRow }
  >(null);

  const [durationDays, setDurationDays] = useState("30");

  const navigate = useNavigate();
  const { session, signOut } = useAuth();
  const authToken = session?.access_token ?? null;

  const handleAuthError = async (err: any) => {
    const code = err?.code ?? err?.message;
    // JWT_INVALID often happens when the access_token expires.
    // Don't hard sign-out: refresh the session and let the page re-fetch.
    if (code === "JWT_INVALID") {
      toast({ title: "Phiên đăng nhập hết hạn", description: "Đang làm mới phiên…" });
      try {
        await supabase.auth.refreshSession();
      } catch {
        // ignore, the next call will show an error if it still fails
      }
      return true;
    }

    if (code === "ADMIN_AUTH_REQUIRED") {
      toast({ title: "Phiên đăng nhập hết hạn", description: "Vui lòng đăng nhập lại." });
      await signOut();
      navigate("/login");
      return true;
    }
    return false;
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const token = authToken;
      const res = await getFunction<{ ok: true; tenants: TenantRow[] }>("admin-rent-tenants", { authToken: token });
      setTenants(res.tenants ?? []);
    } catch (err: any) {
      if (await handleAuthError(err)) return;
      toast({ title: "Không tải được danh sách", description: err?.message ?? String(err) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authToken) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Đã copy" });
    } catch {
      toast({ title: "Copy thất bại" });
    }
  };

  const onCreateTenant = async () => {
    const u = newUsername.trim();
    if (!u) return;

    setCreating(true);
    try {
      const token = authToken;
      const res = await postFunction<{
        ok: boolean;
        code?: string;
        msg?: string;
        tenant_id?: string;
        username?: string;
        login?: { username: string; email: string; password: string };
        tenant_secret?: string;
      }>(
        "admin-rent-create-tenant",
        {
          username: u,
          password: newPassword.trim() ? newPassword : undefined,
          note: newNote.trim() ? newNote.trim() : undefined,
        },
        { authToken: token },
      );

      if (!res.ok) {
        toast({ title: "Tạo tenant thất bại", description: res.msg ?? res.code ?? "Lỗi" });
        return;
      }

      const text = `TENANT CREATED\nusername: ${res.login?.username}\npassword: ${res.login?.password}\ntenant_id: ${res.tenant_id}\ntenant_secret: ${res.tenant_secret}`;
      await navigator.clipboard.writeText(text);
      toast({ title: "Đã tạo tenant (đã copy thông tin)" });

      setNewUsername("");
      setNewPassword("");
      setNewNote("");
      await refresh();
    } catch (err: any) {
      if (await handleAuthError(err)) return;
      toast({ title: "Lỗi", description: err?.message ?? String(err) });
    } finally {
      setCreating(false);
    }
  };

  const activeBadge = (subExp: string | null) => {
    if (!subExp) return <Badge variant="secondary">Chưa kích hoạt</Badge>;
    const ms = Date.parse(subExp);
    if (!Number.isFinite(ms)) return <Badge variant="secondary">?</Badge>;
    return ms > Date.now() ? <Badge>Active</Badge> : <Badge variant="destructive">Expired</Badge>;
  };

  const onIssueActivation = async (tenant: TenantRow) => {
    const days = Math.max(1, parseInt(durationDays || "0", 10));
    const duration_seconds = days * 24 * 3600;
    const token = authToken;
    const res = await postFunction<{ ok: boolean; code?: string; code_last4?: string; msg?: string; duration_seconds?: number }>(
      "admin-rent-issue-activation",
      { tenant_id: tenant.tenant_id, duration_seconds },
      { authToken: token },
    );

    if (!res.ok || !res.code) {
      toast({ title: "Tạo key gia hạn thất bại", description: res.msg ?? "Lỗi" });
      return;
    }

    await navigator.clipboard.writeText(res.code);
    toast({ title: "Đã tạo key gia hạn (đã copy)", description: res.code });
    setDialog(null);
  };

  const onRotate = async (tenant: TenantRow) => {
    const token = authToken;
    const res = await postFunction<{
      ok: boolean;
      tenant_secret?: string;
      subscription_expires_at?: string | null;
      penalty_applied?: boolean;
      msg?: string;
    }>("admin-rent-rotate-secret", { tenant_id: tenant.tenant_id }, { authToken: token });

    if (!res.ok) {
      toast({ title: "Rotate thất bại", description: res.msg ?? "Lỗi" });
      return;
    }

    if (res.tenant_secret) {
      await navigator.clipboard.writeText(res.tenant_secret);
      toast({
        title: "Đã rotate (đã copy secret)",
        description: res.penalty_applied ? "Đã áp dụng trừ 20%" : "Lần đầu: không trừ" ,
      });
    }

    setDialog(null);
    await refresh();
  };

  const onResetCode = async (tenant: TenantRow) => {
    const token = authToken;
    const res = await postFunction<{ ok: boolean; code?: string; msg?: string }>("admin-rent-create-reset-code", { tenant_id: tenant.tenant_id }, { authToken: token });
    if (!res.ok || !res.code) {
      toast({ title: "Tạo reset code thất bại", description: res.msg ?? "Lỗi" });
      return;
    }
    await navigator.clipboard.writeText(res.code);
    toast({ title: "Đã tạo reset code (đã copy)", description: res.code });
    setDialog(null);
  };

  const onDelete = async (tenant: TenantRow) => {
    const token = authToken;
    const res = await postFunction<{ ok: boolean; msg?: string }>("admin-rent-delete-tenant", { tenant_id: tenant.tenant_id }, { authToken: token });
    if (!res.ok) {
      toast({ title: "Xoá thất bại", description: res.msg ?? "Lỗi" });
      return;
    }
    toast({ title: "Đã xoá tenant" });
    setDialog(null);
    await refresh();
  };

  const sorted = useMemo(() => tenants, [tenants]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Tạo tenant</CardTitle>
          <CardDescription>Tạo tài khoản thuê + role tenant (auto tạo email nội bộ).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <div className="text-sm">Username</div>
            <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="vd: shopA" autoCapitalize="none" />
          </div>
          <div className="space-y-1">
            <div className="text-sm">Password (tuỳ chọn)</div>
            <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="để trống = auto" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <div className="text-sm">Note</div>
            <Input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="ghi chú" />
          </div>
          <div className="md:col-span-4">
            <Button onClick={onCreateTenant} disabled={creating || !newUsername.trim()}>
              {creating ? "Đang tạo…" : "Tạo"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách tenant</CardTitle>
          <CardDescription>Quản lý: cấp key gia hạn, rotate, reset pass, xoá.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div>Đang tải…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Hết hạn</TableHead>
                  <TableHead>Rotate</TableHead>
                  <TableHead className="text-right">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((t) => (
                  <TableRow key={t.tenant_id}>
                    <TableCell>
                      <div className="font-medium">{t.username}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="font-mono">{t.tenant_id.slice(0, 8)}…</span>
                        <Button variant="ghost" size="sm" onClick={() => copy(t.tenant_id)}>
                          Copy ID
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>{activeBadge(t.subscription_expires_at)}</TableCell>
                    <TableCell className="text-sm">
                      {t.subscription_expires_at ? new Date(Date.parse(t.subscription_expires_at)).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{t.rotate_count}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="outline" size="sm" onClick={() => { setDurationDays("30"); setDialog({ type: "activation", tenant: t }); }}>
                        Cấp key
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setDialog({ type: "rotate", tenant: t })}>
                        Rotate
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setDialog({ type: "reset", tenant: t })}>
                        Reset code
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => setDialog({ type: "delete", tenant: t })}>
                        Xoá
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {sorted.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      Chưa có tenant.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!dialog} onOpenChange={(o) => (!o ? setDialog(null) : null)}>
        {dialog?.type === "activation" && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cấp key gia hạn</DialogTitle>
              <DialogDescription>Tenant: {dialog.tenant.username}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <div className="text-sm">Số ngày</div>
              <Input value={durationDays} onChange={(e) => setDurationDays(e.target.value)} inputMode="numeric" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialog(null)}>
                Huỷ
              </Button>
              <Button onClick={() => onIssueActivation(dialog.tenant)}>Tạo & Copy</Button>
            </DialogFooter>
          </DialogContent>
        )}

        {dialog?.type === "rotate" && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rotate secret</DialogTitle>
              <DialogDescription>
                Rotate sẽ làm key khách hiện tại mất hiệu lực. Lần 2 trở đi bị trừ 20% thời gian còn lại.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialog(null)}>
                Huỷ
              </Button>
              <Button onClick={() => onRotate(dialog.tenant)}>Rotate</Button>
            </DialogFooter>
          </DialogContent>
        )}

        {dialog?.type === "reset" && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tạo reset code</DialogTitle>
              <DialogDescription>Code 1 lần để tenant đổi mật khẩu (copy tự động).</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialog(null)}>
                Huỷ
              </Button>
              <Button onClick={() => onResetCode(dialog.tenant)}>Tạo & Copy</Button>
            </DialogFooter>
          </DialogContent>
        )}

        {dialog?.type === "delete" && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Xoá tenant</DialogTitle>
              <DialogDescription>
                Xoá tenant sẽ xoá luôn auth user + key liên quan. Không thể khôi phục.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialog(null)}>
                Huỷ
              </Button>
              <Button variant="destructive" onClick={() => onDelete(dialog.tenant)}>
                Xoá
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
