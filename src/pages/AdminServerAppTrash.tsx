import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { RotateCcw, Search, ShieldCheck, Trash2 } from "lucide-react";

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
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { postAdminFunction } from "@/lib/admin-auth";

type TrashSessionRow = {
  id: string;
  account_ref: string;
  device_id: string | null;
  status: string;
  started_at: string;
  last_seen_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  client_version: string | null;
};

type TrashEntitlementRow = {
  id: string;
  account_ref: string;
  device_id: string | null;
  plan_code: string;
  status: string;
  starts_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  created_at: string;
};


async function postTrashOp(body: Record<string, unknown>) {
  return await postAdminFunction("/server-app-runtime-ops", body);
}

type PendingDelete =
  | { kind: "session"; id: string; label: string }
  | { kind: "entitlement"; id: string; label: string }
  | null;


function formatTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function matchesSearch(query: string, ...values: Array<string | number | null | undefined>) {
  const raw = query.trim().toLowerCase();
  if (!raw) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(raw));
}

function formatMutationError(error: any) {
  const contextJson = error?.context?.json;
  if (contextJson?.friendly_message) return String(contextJson.friendly_message);
  if (contextJson?.message) return String(contextJson.message);
  if (contextJson?.msg) return String(contextJson.msg);
  if (error?.message && typeof error.message === "string") return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return "Có lỗi xảy ra. Vui lòng thử lại.";
  }
}


type FakeLagTrashLicenseRow = {
  id: string;
  key: string;
  created_at: string;
  expires_at: string | null;
  deleted_at: string | null;
  is_active: boolean | null;
  max_devices: number | null;
  max_ips?: number | null;
  max_verify?: number | null;
  verify_count?: number | null;
  note: string | null;
};

type PendingFakeLagTrash =
  | { action: "restore"; row: FakeLagTrashLicenseRow }
  | { action: "hard_delete"; row: FakeLagTrashLicenseRow }
  | null;

function FakeLagLicenseTrashPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<PendingFakeLagTrash>(null);

  const trashQuery = useQuery({
    queryKey: ["fake-lag-license-trash", search],
    queryFn: async () => {
      let query = (supabase.from("licenses") as any)
        .select("id,key,created_at,expires_at,deleted_at,is_active,max_devices,max_ips,max_verify,verify_count,note")
        .eq("app_code", "fake-lag")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(500);
      const needle = search.trim();
      if (needle) {
        const esc = needle.replace(/[\\%_]/g, "\\$&");
        query = query.or(`key.ilike.%${esc}%,note.ilike.%${esc}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as FakeLagTrashLicenseRow[];
    },
  });

  const rows = trashQuery.data ?? [];

  const restoreMutation = useMutation({
    mutationFn: async (row: FakeLagTrashLicenseRow) => {
      const { error } = await (supabase.from("licenses") as any)
        .update({ deleted_at: null, is_active: true })
        .eq("id", row.id);
      if (error) throw error;
      try { await supabase.rpc("log_audit", { p_action: "FAKE_LAG_RESTORE", p_license_key: row.key, p_detail: { app_code: "fake-lag", license_id: row.id } as any }); } catch {}
    },
    onSuccess: async () => {
      toast({ title: "Đã khôi phục key", description: "Key đã quay lại tab Licenses và được mở lại trạng thái Active." });
      setPending(null);
      await trashQuery.refetch();
    },
    onError: (e: any) => toast({ title: "Khôi phục thất bại", description: formatMutationError(e), variant: "destructive" }),
  });

  const hardDeleteMutation = useMutation({
    mutationFn: async (row: FakeLagTrashLicenseRow) => {
      const { error } = await (supabase.from("licenses") as any).delete().eq("id", row.id);
      if (error) throw error;
      try { await supabase.rpc("log_audit", { p_action: "FAKE_LAG_HARD_DELETE", p_license_key: row.key, p_detail: { app_code: "fake-lag", license_id: row.id } as any }); } catch {}
    },
    onSuccess: async () => {
      toast({ title: "Đã xóa vĩnh viễn key", description: "Key đã bị xóa hẳn khỏi database." });
      setPending(null);
      await trashQuery.refetch();
    },
    onError: (e: any) => toast({ title: "Xóa vĩnh viễn thất bại", description: formatMutationError(e), variant: "destructive" }),
  });

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader>
          <Badge variant="outline" className="w-fit">Fake Lag Trash</Badge>
          <CardTitle>Trash key Fake Lag</CardTitle>
          <CardDescription>
            Key bị xóa mềm từ tab Licenses sẽ nằm ở đây. Bạn có thể khôi phục hoặc xóa vĩnh viễn. Mọi thao tác đều có xác nhận.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Card><CardContent className="p-4"><div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Key trong Trash</div><div className="mt-1 text-2xl font-semibold">{rows.length}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Có thể khôi phục</div><div className="mt-1 text-2xl font-semibold">{rows.length}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Ghi chú</div><div className="mt-1 text-sm text-muted-foreground">Xóa vĩnh viễn chỉ dùng khi chắc chắn không cần tra cứu key nữa.</div></CardContent></Card>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Tìm key trong Trash</div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nhập key hoặc ghi chú..." />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách key trong Trash</CardTitle>
          <CardDescription>Khôi phục sẽ đưa key về lại Licenses và bật Active. Xóa vĩnh viễn sẽ không hoàn tác.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {trashQuery.isLoading ? <div className="text-sm text-muted-foreground">Đang tải Trash...</div> : null}
          {trashQuery.error ? <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{formatMutationError(trashQuery.error)}</div> : null}
          {!rows.length && !trashQuery.isLoading ? <div className="text-sm text-muted-foreground">Trash key Fake Lag đang trống.</div> : null}
          {rows.map((row) => (
            <div key={row.id} className="rounded-2xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">Deleted</Badge>
                    <span className="break-all font-mono text-sm font-semibold">{row.key}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">Tạo: {formatTime(row.created_at)} · Xóa: {formatTime(row.deleted_at)} · Hết hạn: {formatTime(row.expires_at)}</div>
                  <div className="text-xs text-muted-foreground">Device: {row.max_devices ?? 1} · IP: {row.max_ips ?? 1} · Lượt: {row.max_verify ?? 1} · Verify: {row.verify_count ?? 0}</div>
                  {row.note ? <div className="max-w-3xl break-words text-xs text-muted-foreground">Note: {row.note}</div> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="soft" size="sm" className="rounded-xl" onClick={() => setPending({ action: "restore", row })}>
                    <RotateCcw className="mr-2 h-4 w-4" />Khôi phục
                  </Button>
                  <Button variant="destructive" size="sm" className="rounded-xl" onClick={() => setPending({ action: "hard_delete", row })}>
                    <Trash2 className="mr-2 h-4 w-4" />Xóa vĩnh viễn
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(pending)} onOpenChange={(open) => { if (!open) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.action === "restore" ? "Khôi phục key?" : "Xóa vĩnh viễn key?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.action === "restore"
                ? "Key sẽ được đưa khỏi Trash và bật lại Active để app có thể xác thực."
                : "Key sẽ bị xóa hẳn khỏi database. Hành động này không thể hoàn tác."}
              {pending?.row?.key ? `\n\nKey đang chọn: ${pending.row.key}` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoreMutation.isPending || hardDeleteMutation.isPending}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className={pending?.action === "hard_delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              disabled={!pending || restoreMutation.isPending || hardDeleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!pending) return;
                if (pending.action === "restore") restoreMutation.mutate(pending.row);
                else hardDeleteMutation.mutate(pending.row);
              }}
            >
              {pending?.action === "restore" ? <><ShieldCheck className="mr-2 h-4 w-4" />Khôi phục</> : "Xóa vĩnh viễn"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export function AdminServerAppTrashPage() {
  const { appCode = "find-dumps" } = useParams();
  if (appCode === "fake-lag") return <FakeLagLicenseTrashPage />;
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);

  const trashQuery = useQuery({
    queryKey: ["server-app-trash", appCode],
    queryFn: async () => {
      const sb = supabase as any;
      const [sessionsRes, entitlementsRes] = await Promise.all([
        sb
          .from("server_app_sessions")
          .select("id,account_ref,device_id,status,started_at,last_seen_at,expires_at,revoked_at,revoke_reason,client_version")
          .eq("app_code", appCode)
          .neq("status", "active")
          .order("last_seen_at", { ascending: false })
          .limit(200),
        sb
          .from("server_app_entitlements")
          .select("id,account_ref,device_id,plan_code,status,starts_at,expires_at,revoked_at,revoke_reason,created_at")
          .eq("app_code", appCode)
          .neq("status", "active")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      const firstError = [sessionsRes, entitlementsRes].find((item: any) => item.error)?.error;
      if (firstError) throw firstError;

      return {
        sessions: (sessionsRes.data ?? []) as TrashSessionRow[],
        entitlements: (entitlementsRes.data ?? []) as TrashEntitlementRow[],
      };
    },
  });

  const { data, isLoading, error, refetch } = trashQuery;

  const filteredSessions = useMemo(
    () => (data?.sessions ?? []).filter((item) => matchesSearch(search, item.account_ref, item.device_id, item.status, item.client_version, item.revoke_reason)),
    [data?.sessions, search],
  );
  const filteredEntitlements = useMemo(
    () => (data?.entitlements ?? []).filter((item) => matchesSearch(search, item.account_ref, item.device_id, item.plan_code, item.status, item.revoke_reason)),
    [data?.entitlements, search],
  );

  const hardDeleteMutation = useMutation({
    mutationFn: async (payload: NonNullable<PendingDelete>) => {
      if (payload.kind === "session") {
        return await postTrashOp({
          action: "hard_delete_session",
          app_code: appCode,
          session_id: payload.id,
        });
      }
      return await postTrashOp({
        action: "hard_delete_entitlement",
        app_code: appCode,
        entitlement_id: payload.id,
      });
    },
    onSuccess: async (_, payload) => {
      toast({
        title: payload.kind === "session" ? "Đã xóa vĩnh viễn session" : "Đã xóa vĩnh viễn entitlement",
        description: "Trash đã được dọn. Tải lại dữ liệu để kiểm tra danh sách còn lại.",
      });
      setPendingDelete(null);
      await refetch();
    },
    onError: (e: any) => {
      toast({ title: "Xóa vĩnh viễn thất bại", description: formatMutationError(e), variant: "destructive" });
    },
  });

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Trash</CardTitle>
          <CardDescription>
            Đây là chỗ chốt hạ cuối cùng. Chỉ những session hoặc entitlement không còn active mới hiện ở đây. Khi bấm xóa vĩnh viễn sẽ có bước xác nhận.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Card><CardContent className="p-4"><div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Session chờ xóa</div><div className="mt-1 text-2xl font-semibold">{data?.sessions?.length ?? 0}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Entitlement chờ xóa</div><div className="mt-1 text-2xl font-semibold">{data?.entitlements?.length ?? 0}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Ghi chú</div><div className="mt-1 text-sm text-muted-foreground">Muốn tránh rác dữ liệu hoặc dọn hẳn account cũ thì xử lý ở đây, không làm trực tiếp ở tab Runtime.</div></CardContent></Card>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Tìm trong Trash</div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ví dụ: user_001, revoked, expired, device_001" />
            </div>
            <div className="text-xs text-muted-foreground">Lọc chung cho session và entitlement đang nằm trong thùng rác.</div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Session trong Trash</CardTitle>
            <CardDescription>Chỉ hiện session đã revoke, expired hoặc logged_out. Muốn mở lại thì quay về tab Runtime.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? <div className="text-sm text-muted-foreground">Đang tải session...</div> : null}
            {error ? <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{formatMutationError(error)}</div> : null}
            {filteredSessions.length === 0 && !isLoading ? <div className="text-sm text-muted-foreground">Trash session đang trống.</div> : null}
            {filteredSessions.map((item) => (
              <div key={item.id} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{item.status}</Badge>
                      <span className="font-medium break-all">{item.account_ref}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">Device: {item.device_id || "-"}</div>
                    <div className="text-xs text-muted-foreground">Client: {item.client_version || "-"}</div>
                    <div className="text-xs text-muted-foreground">Bắt đầu: {formatTime(item.started_at)} · Last seen: {formatTime(item.last_seen_at)}</div>
                    <div className="text-xs text-muted-foreground">Revoke: {formatTime(item.revoked_at)} · Hết hạn: {formatTime(item.expires_at)}</div>
                    {item.revoke_reason ? <div className="text-xs text-muted-foreground">Lý do: {item.revoke_reason}</div> : null}
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => setPendingDelete({ kind: "session", id: item.id, label: `${item.account_ref}${item.device_id ? ` / ${item.device_id}` : ""}` })}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />Xóa vĩnh viễn
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Entitlement trong Trash</CardTitle>
            <CardDescription>Chỉ hiện entitlement không còn active. Nếu cần khôi phục, quay về tab Runtime trước khi xóa.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? <div className="text-sm text-muted-foreground">Đang tải entitlement...</div> : null}
            {error ? <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{formatMutationError(error)}</div> : null}
            {filteredEntitlements.length === 0 && !isLoading ? <div className="text-sm text-muted-foreground">Trash entitlement đang trống.</div> : null}
            {filteredEntitlements.map((item) => (
              <div key={item.id} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{item.status}</Badge>
                      <span className="font-medium break-all">{item.account_ref}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">Plan: {item.plan_code}</div>
                    <div className="text-xs text-muted-foreground">Device: {item.device_id || "-"}</div>
                    <div className="text-xs text-muted-foreground">Bắt đầu: {formatTime(item.starts_at)} · Hết hạn: {formatTime(item.expires_at)}</div>
                    <div className="text-xs text-muted-foreground">Revoke: {formatTime(item.revoked_at)} · Tạo lúc: {formatTime(item.created_at)}</div>
                    {item.revoke_reason ? <div className="text-xs text-muted-foreground">Lý do: {item.revoke_reason}</div> : null}
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => setPendingDelete({ kind: "entitlement", id: item.id, label: `${item.account_ref} / ${item.plan_code}` })}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />Xóa vĩnh viễn
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa vĩnh viễn?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.kind === "session" ? "Session này sẽ bị xóa hẳn khỏi database." : "Entitlement này sẽ bị xóa hẳn khỏi database."} Hành động này không hoàn tác được.
              {pendingDelete?.label ? `\n\nMục đang chọn: ${pendingDelete.label}` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={hardDeleteMutation.isPending}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={hardDeleteMutation.isPending || !pendingDelete}
              onClick={(e) => {
                e.preventDefault();
                if (!pendingDelete) return;
                hardDeleteMutation.mutate(pendingDelete);
              }}
            >
              {hardDeleteMutation.isPending ? "Đang xóa..." : "Xóa vĩnh viễn"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
