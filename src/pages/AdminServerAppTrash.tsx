import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search, Trash2 } from "lucide-react";

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
import { postFunction } from "@/lib/functions";

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

type PendingDelete =
  | { kind: "session"; id: string; label: string }
  | { kind: "entitlement"; id: string; label: string }
  | null;

async function getAdminAuthToken() {
  const sess = await supabase.auth.getSession();
  const token = sess.data.session?.access_token ?? null;
  if (!token) {
    const err = new Error("ADMIN_AUTH_REQUIRED") as Error & { code?: string };
    err.code = "ADMIN_AUTH_REQUIRED";
    throw err;
  }
  return token;
}

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

export function AdminServerAppTrashPage() {
  const { appCode = "find-dumps" } = useParams();
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
      const authToken = await getAdminAuthToken();
      if (payload.kind === "session") {
        return await postFunction("/server-app-runtime-ops", {
          action: "hard_delete_session",
          app_code: appCode,
          session_id: payload.id,
        }, { authToken });
      }
      return await postFunction("/server-app-runtime-ops", {
        action: "hard_delete_entitlement",
        app_code: appCode,
        entitlement_id: payload.id,
      }, { authToken });
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
