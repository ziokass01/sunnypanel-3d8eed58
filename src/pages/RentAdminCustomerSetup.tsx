import { useMemo, useState } from "react";
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

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export function RentAdminCustomerSetupPage() {
  const { session } = useAuth();
  const authToken = session?.access_token ?? null;
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selected, setSelected] = useState<RentAccount | null>(null);
  const [openEdit, setOpenEdit] = useState(false);

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
      qc.invalidateQueries({ queryKey: ["rent-admin", "users"] });
      qc.invalidateQueries({ queryKey: ["rent-admin", "users", "customer-setup-page"] });
    },
    onError: (error: any) => {
      toast({ title: "Lỗi xóa user", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold">Thuê Website / Rent - Customer Setup</h1>
        <p className="text-sm text-muted-foreground">
          Trang này tập trung đúng luồng bạn cần: tạo tài khoản thuê xong là có setup khách, mở Edit là thấy form của đúng tài khoản đó, copy SQL là chạy được ngay.
        </p>
      </div>

      {authToken ? (
        <RentCreateUserWithSetupCard
          authToken={authToken}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ["rent-admin", "users"] });
            qc.invalidateQueries({ queryKey: ["rent-admin", "users", "customer-setup-page"] });
          }}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Danh sách user thuê</CardTitle>
          <CardDescription>
            Edit mở ra sẽ có ngay form setup khách của tài khoản đó. Khi xóa user, phần integration của user đó sẽ bị xóa theo cascade ở DB.
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
                      <Button size="sm" variant="soft" onClick={() => { setSelected(user); setOpenEdit(true); }}>
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
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto p-0">
          <div className="p-6">
            <DialogHeader>
              <DialogTitle>Edit setup khách</DialogTitle>
              <DialogDescription>
                Popup này bám đúng tài khoản đang chọn. Copy SQL trong đây là chạy được ngay, không phải mò account_id thủ công.
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

                <RentClientIntegrationSection
                  authToken={authToken}
                  accountId={selectedUser.id}
                  username={selectedUser.username}
                />
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
