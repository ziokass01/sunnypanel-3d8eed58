import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, BadgeDollarSign, Clock3, Search, ShieldCheck, Wallet } from "lucide-react";
import { useParams } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getServerAppMeta } from "@/lib/serverAppPolicies";
import { supabase } from "@/integrations/supabase/client";

function short(value?: string | null, size = 14) {
  const v = String(value || "").trim();
  if (!v) return "-";
  return v.length > size ? `${v.slice(0, size)}…` : v;
}

async function loadAuditData(appCode: string) {
  const [wallets, sessions, transactions, events] = await Promise.all([
    supabase.from("server_app_wallet_balances").select("id,account_ref,device_id,soft_balance,premium_balance,last_soft_reset_at,last_premium_reset_at,updated_at").eq("app_code", appCode).order("updated_at", { ascending: false }).limit(100),
    supabase.from("server_app_sessions").select("id,account_ref,device_id,status,started_at,last_seen_at,expires_at,revoked_at,revoke_reason,client_version").eq("app_code", appCode).order("last_seen_at", { ascending: false }).limit(100),
    supabase.from("server_app_wallet_transactions").select("id,account_ref,device_id,feature_code,transaction_type,wallet_kind,soft_delta,premium_delta,soft_balance_after,premium_balance_after,note,created_at").eq("app_code", appCode).order("created_at", { ascending: false }).limit(150),
    supabase.from("server_app_runtime_events").select("id,event_type,ok,code,message,account_ref,device_id,feature_code,wallet_kind,trace_id,client_version,meta,created_at").eq("app_code", appCode).order("created_at", { ascending: false }).limit(150),
  ]);
  if (wallets.error) throw wallets.error;
  if (sessions.error) throw sessions.error;
  if (transactions.error) throw transactions.error;
  if (events.error) throw events.error;
  return {
    wallets: wallets.data || [],
    sessions: sessions.data || [],
    transactions: transactions.data || [],
    events: events.data || [],
  };
}

async function loadTraceBundle(appCode: string, traceId: string) {
  const trace = String(traceId || "").trim();
  if (!trace) return { runtimeEvents: [], gateLogs: [], freeSessions: [], redeemKeys: [], securityLogs: [] };
  const [runtimeEvents, gateLogs, freeSessions, redeemKeys, securityLogs] = await Promise.all([
    supabase.from("server_app_runtime_events").select("id,event_type,ok,code,message,account_ref,device_id,feature_code,wallet_kind,trace_id,meta,created_at").eq("app_code", appCode).eq("trace_id", trace).order("created_at", { ascending: false }).limit(200),
    supabase.from("licenses_free_gate_logs").select("id,session_id,event_code,pass_no,trace_id,detail,created_at").eq("trace_id", trace).order("created_at", { ascending: false }).limit(200),
    supabase.from("licenses_free_sessions").select("session_id,status,key_type_code,app_code,package_code,credit_code,wallet_kind,trace_id,last_error,issued_server_redeem_key_id,created_at,started_at,revealed_at").eq("trace_id", trace).order("created_at", { ascending: false }).limit(20),
    supabase.from("server_app_redeem_keys").select("id,app_code,redeem_key,title,reward_mode,trace_id,source_free_session_id,expires_at,redeemed_count,created_at").eq("app_code", appCode).eq("trace_id", trace).order("created_at", { ascending: false }).limit(100),
    supabase.from("licenses_free_security_logs").select("id,event_type,route,trace_id,session_id,details,created_at").eq("trace_id", trace).order("created_at", { ascending: false }).limit(100),
  ]);
  return {
    runtimeEvents: runtimeEvents.data || [],
    gateLogs: gateLogs.data || [],
    freeSessions: freeSessions.data || [],
    redeemKeys: redeemKeys.data || [],
    securityLogs: securityLogs.data || [],
  };
}

export function AdminServerAppAuditPage() {
  const { appCode = "find-dumps" } = useParams();
  const meta = useMemo(() => getServerAppMeta(appCode), [appCode]);
  const [traceInput, setTraceInput] = useState("");
  const [activeTrace, setActiveTrace] = useState("");

  const auditQuery = useQuery({
    queryKey: ["server-app-audit-sections", appCode],
    queryFn: () => loadAuditData(appCode),
    retry: false,
  });

  const traceQuery = useQuery({
    queryKey: ["server-app-audit-trace", appCode, activeTrace],
    queryFn: () => loadTraceBundle(appCode, activeTrace),
    enabled: Boolean(activeTrace),
  });

  if (appCode === "free-fire") {
    return (
      <section className="space-y-4">
        <Badge variant="secondary">Legacy audit</Badge>
        <h1 className="text-2xl font-semibold">Free Fire giữ log theo vùng admin cũ</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Audit Log ở app-host tập trung cho Find Dumps và các app mới. Free Fire tiếp tục dùng hệ log legacy hiện tại để tránh làm gãy cấu trúc đang chạy ổn.</p>
      </section>
    );
  }

  const data = auditQuery.data;
  const trace = traceQuery.data;

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <Badge variant="outline">Audit Log</Badge>
        <h1 className="text-2xl font-semibold">Audit Log cho {meta.label}</h1>
        <p className="max-w-4xl text-sm text-muted-foreground">Quyền / Ví / Session / Giao dịch / Sự kiện không còn nằm trong Runtime nữa. Tất cả được gom vào Audit Log để dễ xem, dễ tìm và dễ quản lý.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-5">
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Ví</div><div className="mt-2 text-2xl font-semibold">{data?.wallets.length ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Session</div><div className="mt-2 text-2xl font-semibold">{data?.sessions.length ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Giao dịch</div><div className="mt-2 text-2xl font-semibold">{data?.transactions.length ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Sự kiện</div><div className="mt-2 text-2xl font-semibold">{data?.events.length ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Trace viewer</div><div className="mt-2 text-2xl font-semibold">{activeTrace ? "Đang soi" : "Sẵn sàng"}</div></CardContent></Card>
      </div>

      <Tabs defaultValue="wallet" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="wallet">Ví</TabsTrigger>
          <TabsTrigger value="session">Session</TabsTrigger>
          <TabsTrigger value="transactions">Giao dịch</TabsTrigger>
          <TabsTrigger value="events">Sự kiện</TabsTrigger>
          <TabsTrigger value="trace">Trace</TabsTrigger>
        </TabsList>

        <TabsContent value="wallet">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" /> Ví</CardTitle><CardDescription>Danh sách ví hiện có của Find Dumps, kèm lần reset gần nhất và số dư sau cùng.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {(data?.wallets || []).map((row: any) => <div key={row.id} className="rounded-xl border p-3 text-sm"><div className="font-medium">{row.account_ref || row.device_id || row.id}</div><div className="text-xs text-muted-foreground">Soft {row.soft_balance ?? 0} · VIP {row.premium_balance ?? 0}</div><div className="text-xs text-muted-foreground">Reset soft {row.last_soft_reset_at || "-"} · Reset VIP {row.last_premium_reset_at || "-"}</div></div>)}
              {!data?.wallets?.length ? <div className="text-sm text-muted-foreground">Chưa có dữ liệu ví.</div> : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="session">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" /> Session</CardTitle><CardDescription>Theo dõi các phiên runtime đang sống, vừa dùng hoặc bị revoke.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {(data?.sessions || []).map((row: any) => <div key={row.id} className="rounded-xl border p-3 text-sm"><div className="font-medium">{row.account_ref || row.device_id || row.id}</div><div className="text-xs text-muted-foreground">Status {row.status || "-"} · Client {row.client_version || "-"}</div><div className="text-xs text-muted-foreground">Start {row.started_at || "-"} · Seen {row.last_seen_at || "-"} · Expires {row.expires_at || "-"}</div></div>)}
              {!data?.sessions?.length ? <div className="text-sm text-muted-foreground">Chưa có dữ liệu session.</div> : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><BadgeDollarSign className="h-4 w-4 text-primary" /> Giao dịch</CardTitle><CardDescription>Mọi lần cộng/trừ credit, redeem hoặc thay đổi số dư đều nên soi ở đây thay vì nhét sang Runtime.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {(data?.transactions || []).map((row: any) => <div key={row.id} className="rounded-xl border p-3 text-sm"><div className="font-medium">{row.transaction_type || "transaction"}</div><div className="text-xs text-muted-foreground">Feature {row.feature_code || "-"} · Wallet {row.wallet_kind || "-"}</div><div className="text-xs text-muted-foreground">Soft Δ {row.soft_delta ?? 0} · VIP Δ {row.premium_delta ?? 0}</div><div className="text-xs text-muted-foreground">Balance after: {row.soft_balance_after ?? 0} / {row.premium_balance_after ?? 0}</div></div>)}
              {!data?.transactions?.length ? <div className="text-sm text-muted-foreground">Chưa có giao dịch nào.</div> : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Sự kiện</CardTitle><CardDescription>Event runtime, consume, redeem, block, lỗi và heartbeat được tách riêng để dễ tra cứu.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {(data?.events || []).map((row: any) => <div key={row.id} className="rounded-xl border p-3 text-sm"><div className="flex items-center justify-between gap-3"><div className="font-medium">{row.event_type}</div><Badge variant={row.ok ? "outline" : "destructive"}>{row.ok ? "OK" : (row.code || "ERR")}</Badge></div><div className="text-xs text-muted-foreground">Account {row.account_ref || "-"} · Device {short(row.device_id)} · Trace {short(row.trace_id)}</div><div className="text-xs text-muted-foreground">Feature {row.feature_code || "-"} · Wallet {row.wallet_kind || "-"} · Client {row.client_version || "-"}</div></div>)}
              {!data?.events?.length ? <div className="text-sm text-muted-foreground">Chưa có sự kiện runtime.</div> : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trace">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Trace end-to-end</CardTitle><CardDescription>Dán trace id để lần theo cả chuỗi free-start → free-gate → free-reveal → redeem → runtime.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <Input value={traceInput} onChange={(e) => setTraceInput(e.target.value)} placeholder="Dán trace id cần soi..." />
                <div className="flex gap-2">
                  <Button onClick={() => setActiveTrace(traceInput.trim())} disabled={!traceInput.trim() || traceQuery.isFetching}><Search className="mr-2 h-4 w-4" /> Tra cứu</Button>
                  <Button variant="outline" onClick={() => { setTraceInput(""); setActiveTrace(""); }}>Xóa</Button>
                </div>
              </div>
              {activeTrace ? <div className="rounded-2xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">Đang soi trace <span className="font-medium text-foreground">{activeTrace}</span>{traceQuery.isFetching ? " · đang tải" : ""}</div> : null}
              {trace ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  <Card><CardHeader><CardTitle className="text-base">Free sessions</CardTitle></CardHeader><CardContent className="space-y-3">{trace.freeSessions.length ? trace.freeSessions.map((row: any) => <div key={row.session_id} className="rounded-xl border p-3 text-sm"><div className="font-medium">{row.status}</div><div className="text-xs text-muted-foreground">Package {row.package_code || "-"} · Credit {row.credit_code || "-"} · Wallet {row.wallet_kind || "-"}</div></div>) : <div className="text-sm text-muted-foreground">Chưa thấy session khớp trace này.</div>}</CardContent></Card>
                  <Card><CardHeader><CardTitle className="text-base">Gate / reveal logs</CardTitle></CardHeader><CardContent className="space-y-3">{trace.gateLogs.length ? trace.gateLogs.map((row: any) => <div key={row.id} className="rounded-xl border p-3 text-sm"><div className="font-medium">{row.event_code}</div><div className="text-xs text-muted-foreground">Session {short(row.session_id)}</div></div>) : <div className="text-sm text-muted-foreground">Chưa có gate log cho trace này.</div>}</CardContent></Card>
                  <Card><CardHeader><CardTitle className="text-base">Issued redeem keys</CardTitle></CardHeader><CardContent className="space-y-3">{trace.redeemKeys.length ? trace.redeemKeys.map((row: any) => <div key={row.id} className="rounded-xl border p-3 text-sm"><div className="font-medium">{row.title || row.redeem_key}</div><div className="text-xs text-muted-foreground">Reward {row.reward_mode} · Redeemed {row.redeemed_count}</div></div>) : <div className="text-sm text-muted-foreground">Chưa có redeem key cho trace này.</div>}</CardContent></Card>
                  <Card><CardHeader><CardTitle className="text-base">Security breadcrumbs</CardTitle></CardHeader><CardContent className="space-y-3">{trace.securityLogs.length ? trace.securityLogs.map((row: any) => <div key={row.id} className="rounded-xl border p-3 text-sm"><div className="font-medium">{row.event_type}</div><div className="text-xs text-muted-foreground">Route {row.route || "-"} · Session {short(row.session_id)}</div></div>) : <div className="text-sm text-muted-foreground">Chưa có security breadcrumb cho trace này.</div>}</CardContent></Card>
                </div>
              ) : <div className="text-sm text-muted-foreground">Chưa có trace id nào được nhập.</div>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  );
}
