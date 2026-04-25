import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, ShieldOff, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/error-message";

const APP_CODE = "fake-lag";

function fmt(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isFinite(d.getTime())
    ? new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d)
    : "-";
}

function short(v?: string | null, n = 14) {
  const s = String(v || "");
  return s.length > n ? `${s.slice(0, n)}…` : s || "-";
}

function esc(v: string) {
  return v.replace(/[\\%_]/g, "\\$&");
}

function includesNeedle(row: Record<string, unknown>, needle: string) {
  if (!needle) return true;
  const haystack = Object.values(row).map((v) => String(v || "").toLowerCase()).join(" ");
  return haystack.includes(needle.toLowerCase());
}

async function logAudit(action: string, key: string, detail: any) {
  try {
    await supabase.rpc("log_audit", { p_action: action, p_license_key: key, p_detail: detail });
  } catch {
    // ignore audit write failure
  }
}

async function fetchLicensesByIds(ids: string[]) {
  const unique = Array.from(new Set(ids.map((id) => String(id || "").trim()).filter(Boolean)));
  if (!unique.length) return new Map<string, any>();

  const byId = new Map<string, any>();
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const { data, error } = await (supabase.from("licenses") as any)
      .select("id,key,is_active,deleted_at,expires_at,verify_count,max_verify,max_devices,note,created_at")
      .in("id", chunk);
    if (error) throw error;
    (data ?? []).forEach((row: any) => byId.set(String(row.id), row));
  }
  return byId;
}

export function AdminFakeLagAuditPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const dataQuery = useQuery({
    queryKey: ["fake-lag-free-audit", q],
    queryFn: async () => {
      const needle = q.trim().toLowerCase();

      const issuesQ = (supabase.from("licenses_free_issues") as any)
        .select("issue_id,created_at,expires_at,license_id,key_mask,session_id,ip_hash,fingerprint_hash,ua_hash,app_code,key_signature,server_redeem_key_id")
        .eq("app_code", APP_CODE)
        .order("created_at", { ascending: false })
        .limit(500);

      const sessionsQ = (supabase.from("licenses_free_sessions") as any)
        .select("session_id,created_at,status,reveal_count,last_error,key_type_code,duration_seconds,ip_hash,fingerprint_hash,ua_hash,started_at,gate_ok_at,revealed_at,app_code,trace_id,revealed_license_id")
        .eq("app_code", APP_CODE)
        .order("created_at", { ascending: false })
        .limit(500);

      let logsQ = (supabase.from("audit_logs") as any)
        .select("id,created_at,action,license_key,detail")
        .ilike("license_key", "FAKELAG-%")
        .order("created_at", { ascending: false })
        .limit(500);
      if (needle) {
        const e = esc(q.trim());
        logsQ = logsQ.or(`license_key.ilike.%${e}%,action.ilike.%${e}%`);
      }

      const [issuesRes, sessionsRes, logsRes] = await Promise.all([issuesQ, sessionsQ, logsQ]);
      if (issuesRes.error) throw issuesRes.error;
      if (sessionsRes.error) throw sessionsRes.error;
      if (logsRes.error) throw logsRes.error;

      const issueRows = issuesRes.data ?? [];
      const licenseIds = issueRows
        .map((row: any) => String(row.license_id || "").trim())
        .filter(Boolean);
      const licenseById = await fetchLicensesByIds(licenseIds);

      const issues = issueRows
        .map((row: any) => {
          const license = row.license_id ? licenseById.get(String(row.license_id)) : null;
          const displayKey = String(row.key_mask || license?.key || "").trim();
          return {
            ...row,
            license,
            display_key: displayKey,
            license_status: license?.deleted_at ? "deleted" : license?.is_active === false ? "blocked" : "active",
            license_note: license?.note ?? null,
            license_verify: license?.verify_count ?? null,
            license_max_verify: license?.max_verify ?? null,
          };
        })
        .filter((row: any) => includesNeedle({
          key: row.display_key,
          key_mask: row.key_mask,
          session_id: row.session_id,
          license_id: row.license_id,
          ip_hash: row.ip_hash,
          fingerprint_hash: row.fingerprint_hash,
          ua_hash: row.ua_hash,
          note: row.license_note,
        }, needle));

      const sessions = (sessionsRes.data ?? []).filter((row: any) => includesNeedle({
        session_id: row.session_id,
        trace_id: row.trace_id,
        revealed_license_id: row.revealed_license_id,
        ip_hash: row.ip_hash,
        fingerprint_hash: row.fingerprint_hash,
        ua_hash: row.ua_hash,
        status: row.status,
        last_error: row.last_error,
      }, needle));

      return {
        issues,
        sessions,
        logs: logsRes.data ?? [],
      };
    },
  });

  const blockMutation = useMutation({
    mutationFn: async (row: any) => {
      const licenseId = String(row.license_id || "").trim();
      const key = String(row.display_key || row.key_mask || "FAKELAG").trim();
      if (!licenseId) throw new Error("Không có license_id để block key này.");
      const { error } = await (supabase.from("licenses") as any).update({ is_active: false }).eq("id", licenseId);
      if (error) throw error;
      await logAudit("FAKE_LAG_FREE_BLOCK", key, { app_code: APP_CODE, issue_id: row.issue_id, license_id: licenseId });
    },
    onSuccess: async () => {
      toast({ title: "Đã block key" });
      await qc.invalidateQueries({ queryKey: ["fake-lag-free-audit"] });
    },
    onError: (e: any) => toast({ title: "Block thất bại", description: getErrorMessage(e), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (row: any) => {
      const licenseId = String(row.license_id || "").trim();
      const key = String(row.display_key || row.key_mask || "FAKELAG").trim();
      if (!licenseId) throw new Error("Không có license_id để xóa key này.");
      const { error } = await (supabase.from("licenses") as any)
        .update({ is_active: false, deleted_at: new Date().toISOString() })
        .eq("id", licenseId);
      if (error) throw error;
      await logAudit("FAKE_LAG_FREE_DELETE", key, { app_code: APP_CODE, issue_id: row.issue_id, license_id: licenseId });
    },
    onSuccess: async () => {
      toast({ title: "Đã xóa mềm key" });
      await qc.invalidateQueries({ queryKey: ["fake-lag-free-audit"] });
    },
    onError: (e: any) => toast({ title: "Xóa thất bại", description: getErrorMessage(e), variant: "destructive" }),
  });

  const data = dataQuery.data;
  const stats = useMemo(() => ({
    issues: data?.issues?.length ?? 0,
    sessions: data?.sessions?.length ?? 0,
    logs: data?.logs?.length ?? 0,
    revealed: (data?.sessions ?? []).filter((x: any) => x.status === "revealed").length,
  }), [data]);

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <Badge variant="outline">Fake Lag Audit</Badge>
        <h1 className="text-2xl font-semibold">Audit Log cho Fake Lag</h1>
        <p className="max-w-4xl text-sm text-muted-foreground">
          Key user nhận từ khu Free chỉ hiện ở đây, không lẫn sang khu Licenses admin. Có thể tìm theo full key, session, trace, IP hash hoặc fingerprint hash.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Key free đã phát" value={stats.issues} />
        <Stat label="Session" value={stats.sessions} />
        <Stat label="Audit logs" value={stats.logs} />
        <Stat label="Reveal OK" value={stats.revealed} />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm full key/session/trace/ip/fingerprint..."
            />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="issues" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="issues">Key free</TabsTrigger>
          <TabsTrigger value="sessions">Session</TabsTrigger>
          <TabsTrigger value="logs">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="issues">
          <Card>
            <CardHeader>
              <CardTitle>Key user nhận từ /free</CardTitle>
              <CardDescription>Danh sách này là nơi tra cứu key free Fake Lag. Khu Licenses chỉ giữ key admin tạo tay.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-2xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Key</TableHead>
                      <TableHead>Session</TableHead>
                      <TableHead>IP/FP</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Hết hạn</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.issues ?? []).map((row: any) => (
                      <TableRow key={row.issue_id}>
                        <TableCell>
                          <div className="font-mono text-xs break-all">{row.display_key || row.key_mask || "-"}</div>
                          <div className="text-xs text-muted-foreground">{fmt(row.created_at)}</div>
                          {row.license_note ? <div className="mt-1 max-w-xs truncate text-xs text-muted-foreground">{row.license_note}</div> : null}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{short(row.session_id, 18)}</TableCell>
                        <TableCell>
                          <div className="font-mono text-xs">IP {short(row.ip_hash)}</div>
                          <div className="font-mono text-xs text-muted-foreground">FP {short(row.fingerprint_hash)}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={row.license_status === "active" ? "secondary" : "destructive" as any}>{row.license_status}</Badge>
                          <div className="mt-1 text-xs text-muted-foreground">Verify {row.license_verify ?? 0}/{row.license_max_verify ?? 1}</div>
                        </TableCell>
                        <TableCell>{fmt(row.expires_at || row.license?.expires_at)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="soft" onClick={() => blockMutation.mutate(row)} disabled={!row.license_id}>
                              <ShieldOff className="mr-1 h-3.5 w-3.5" />Block
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(row)} disabled={!row.license_id}>
                              <Trash2 className="mr-1 h-3.5 w-3.5" />Xóa
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!data?.issues?.length ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">Không thấy key free Fake Lag khớp tìm kiếm.</TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions">
          <Card>
            <CardHeader><CardTitle>Free sessions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(data?.sessions ?? []).map((row: any) => (
                <div key={row.session_id} className="rounded-2xl border p-3 text-sm">
                  <div className="font-mono text-xs">{row.session_id}</div>
                  <div className="mt-1 text-muted-foreground">Status {row.status} · Key type {row.key_type_code || "-"} · Error {row.last_error || "-"}</div>
                  <div className="text-xs text-muted-foreground">Trace {short(row.trace_id, 18)} · License {short(row.revealed_license_id, 18)}</div>
                  <div className="text-xs text-muted-foreground">Tạo {fmt(row.created_at)} · Reveal {fmt(row.revealed_at)}</div>
                </div>
              ))}
              {!data?.sessions?.length ? <div className="text-sm text-muted-foreground">Không thấy session khớp tìm kiếm.</div> : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader><CardTitle>Admin / Verify audit</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(data?.logs ?? []).map((row: any) => (
                <div key={row.id} className="rounded-2xl border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{row.action}</Badge><span className="font-mono text-xs">{row.license_key}</span></div>
                  <div className="mt-1 text-xs text-muted-foreground">{fmt(row.created_at)}</div>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/30 p-2 text-xs">{JSON.stringify(row.detail ?? {}, null, 2)}</pre>
                </div>
              ))}
              {!data?.logs?.length ? <div className="text-sm text-muted-foreground">Chưa có audit log.</div> : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div></CardContent></Card>;
}
