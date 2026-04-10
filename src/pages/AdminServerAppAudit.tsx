import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Search, ShieldCheck, Wallet, Logs, Clock3, Ticket } from "lucide-react";
import { useParams } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getServerAppMeta } from "@/lib/serverAppPolicies";
import { supabase } from "@/integrations/supabase/client";

function short(value?: string | null, size = 12) {
  const v = String(value || "").trim();
  if (!v) return "-";
  return v.length > size ? `${v.slice(0, size)}…` : v;
}

async function loadTraceBundle(appCode: string, traceId: string) {
  const trace = String(traceId || "").trim();
  if (!trace) return { runtimeEvents: [], gateLogs: [], freeSessions: [], freeIssues: [], redeemKeys: [], securityLogs: [] };
  const [runtimeEvents, gateLogs, freeSessions, freeIssues, redeemKeys, securityLogs] = await Promise.all([
    supabase.from("server_app_runtime_events").select("id,event_type,ok,code,message,account_ref,device_id,feature_code,wallet_kind,trace_id,meta,created_at").eq("app_code", appCode).eq("trace_id", trace).order("created_at", { ascending: false }).limit(200),
    supabase.from("licenses_free_gate_logs").select("id,session_id,event_code,pass_no,trace_id,detail,created_at").eq("trace_id", trace).order("created_at", { ascending: false }).limit(200),
    supabase.from("licenses_free_sessions").select("session_id,status,key_type_code,app_code,package_code,credit_code,wallet_kind,trace_id,last_error,issued_server_redeem_key_id,created_at,started_at,revealed_at").eq("trace_id", trace).order("created_at", { ascending: false }).limit(20),
    supabase.from("licenses_free_issues").select("issue_id,session_id,app_code,key_signature,key_mask,expires_at,server_redeem_key_id,created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("server_app_redeem_keys").select("id,app_code,redeem_key,title,reward_mode,trace_id,source_free_session_id,expires_at,redeemed_count,created_at").eq("app_code", appCode).eq("trace_id", trace).order("created_at", { ascending: false }).limit(100),
    supabase.from("licenses_free_security_logs").select("id,event_type,route,trace_id,session_id,details,created_at").eq("trace_id", trace).order("created_at", { ascending: false }).limit(100),
  ]);
  const issueRows = (freeIssues.data || []).filter((row: any) => {
    return (freeSessions.data || []).some((sess: any) => sess.session_id === row.session_id) || (redeemKeys.data || []).some((rk: any) => rk.id === row.server_redeem_key_id);
  });
  return {
    runtimeEvents: runtimeEvents.data || [],
    gateLogs: gateLogs.data || [],
    freeSessions: freeSessions.data || [],
    freeIssues: issueRows,
    redeemKeys: redeemKeys.data || [],
    securityLogs: securityLogs.data || [],
  };
}

function TimelineCard({ title, icon: Icon, count, children }: { title: string; icon: any; count: number; children: any }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Icon className="h-4 w-4 text-primary" /> {title}</CardTitle>
        <CardDescription>{count} bản ghi</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

export function AdminServerAppAuditPage() {
  const { appCode = "find-dumps" } = useParams();
  const meta = useMemo(() => getServerAppMeta(appCode), [appCode]);
  const [traceInput, setTraceInput] = useState("");
  const [activeTrace, setActiveTrace] = useState("");

  const traceQuery = useQuery({
    queryKey: ["server-app-audit-trace", appCode, activeTrace],
    queryFn: () => loadTraceBundle(appCode, activeTrace),
    enabled: Boolean(activeTrace),
  });

  if (appCode === "free-fire") {
    return (
      <section className="space-y-4">
        <Badge variant="secondary">Legacy monitoring</Badge>
        <h1 className="text-2xl font-semibold">Free Fire giữ log theo vùng admin cũ</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Free Fire vẫn theo nhánh legacy. Trace viewer này ưu tiên cho Find Dumps và các app-host mới để soi free-flow tới runtime.</p>
      </section>
    );
  }

  const bundle = traceQuery.data;
  const counts = {
    runtime: bundle?.runtimeEvents.length ?? 0,
    gate: bundle?.gateLogs.length ?? 0,
    session: bundle?.freeSessions.length ?? 0,
    issue: bundle?.freeIssues.length ?? 0,
    redeem: bundle?.redeemKeys.length ?? 0,
    security: bundle?.securityLogs.length ?? 0,
  };

  return (
    <section className="space-y-5">
      <header className="space-y-2">
        <Badge variant="outline">End-to-end trace viewer</Badge>
        <h1 className="text-2xl font-semibold">Audit Log cho {meta.label}</h1>
        <p className="max-w-4xl text-sm text-muted-foreground">Nhập trace id để lần theo toàn bộ đường đi từ free-start / free-gate / free-reveal tới redeem runtime. Các bản ghi được gom theo cùng một dấu vết để dễ soi và đối chiếu.</p>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center">
          <div className="flex-1">
            <div className="text-sm font-medium">Trace ID</div>
            <Input value={traceInput} onChange={(e) => setTraceInput(e.target.value)} placeholder="Ví dụ: 2f3c9b2a9d3d4f6a8c1e5b7d" className="mt-2" />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setActiveTrace(traceInput.trim())} disabled={!traceInput.trim() || traceQuery.isFetching}><Search className="mr-2 h-4 w-4" /> Tra cứu</Button>
            <Button variant="outline" onClick={() => { setTraceInput(""); setActiveTrace(""); }}>Xóa</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-6">
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Runtime</div><div className="mt-2 text-2xl font-semibold">{counts.runtime}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Gate</div><div className="mt-2 text-2xl font-semibold">{counts.gate}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Session</div><div className="mt-2 text-2xl font-semibold">{counts.session}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Issue</div><div className="mt-2 text-2xl font-semibold">{counts.issue}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Redeem</div><div className="mt-2 text-2xl font-semibold">{counts.redeem}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground">Security</div><div className="mt-2 text-2xl font-semibold">{counts.security}</div></CardContent></Card>
      </div>

      {activeTrace ? (
        <div className="rounded-2xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">Đang soi trace <span className="font-medium text-foreground">{activeTrace}</span>{traceQuery.isFetching ? " · đang tải" : ""}</div>
      ) : (
        <div className="rounded-2xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">Chưa có trace id nào được nhập. Khi user chạy flow free hoặc runtime, bạn có thể lấy trace từ màn free/reveal hoặc từ event runtime rồi dán vào đây.</div>
      )}

      {bundle ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <TimelineCard title="Free sessions" icon={Clock3} count={counts.session}>
            {bundle.freeSessions.length ? bundle.freeSessions.map((row: any) => (
              <div key={row.session_id} className="rounded-xl border p-3 text-sm">
                <div className="font-medium">{row.app_code} · {row.status}</div>
                <div className="text-xs text-muted-foreground">Session {short(row.session_id)} · Key {row.key_type_code || "-"}</div>
                <div className="text-xs text-muted-foreground">Package {row.package_code || "-"} · Credit {row.credit_code || "-"} · Wallet {row.wallet_kind || "-"}</div>
                <div className="text-xs text-muted-foreground">Started {row.started_at || row.created_at || "-"} · Revealed {row.revealed_at || "-"}</div>
              </div>
            )) : <div className="text-sm text-muted-foreground">Chưa thấy session khớp trace này.</div>}
          </TimelineCard>

          <TimelineCard title="Gate / reveal logs" icon={ShieldCheck} count={counts.gate}>
            {bundle.gateLogs.length ? bundle.gateLogs.map((row: any) => (
              <div key={row.id} className="rounded-xl border p-3 text-sm">
                <div className="font-medium">{row.event_code}</div>
                <div className="text-xs text-muted-foreground">Pass {row.pass_no || "-"} · Session {short(row.session_id)}</div>
                <pre className="mt-2 overflow-auto rounded-lg bg-muted p-2 text-[11px] leading-5 text-muted-foreground">{JSON.stringify(row.detail || {}, null, 2)}</pre>
              </div>
            )) : <div className="text-sm text-muted-foreground">Chưa có gate log cho trace này.</div>}
          </TimelineCard>

          <TimelineCard title="Issued keys / redeem bridge" icon={Ticket} count={counts.redeem + counts.issue}>
            {bundle.redeemKeys.length ? bundle.redeemKeys.map((row: any) => (
              <div key={row.id} className="rounded-xl border p-3 text-sm">
                <div className="font-medium">{row.title || row.redeem_key}</div>
                <div className="text-xs text-muted-foreground">Reward {row.reward_mode} · Redeemed {row.redeemed_count}</div>
                <div className="text-xs text-muted-foreground">Key {short(row.redeem_key, 16)} · Free session {short(row.source_free_session_id)}</div>
                <div className="text-xs text-muted-foreground">Expires {row.expires_at || "-"}</div>
              </div>
            )) : null}
            {bundle.freeIssues.length ? bundle.freeIssues.map((row: any) => (
              <div key={row.issue_id} className="rounded-xl border p-3 text-sm">
                <div className="font-medium">Issue {row.app_code}</div>
                <div className="text-xs text-muted-foreground">Mask {row.key_mask || "-"} · Signature {row.key_signature || "-"}</div>
                <div className="text-xs text-muted-foreground">Session {short(row.session_id)} · Redeem {short(row.server_redeem_key_id)}</div>
              </div>
            )) : null}
            {!bundle.redeemKeys.length && !bundle.freeIssues.length ? <div className="text-sm text-muted-foreground">Chưa có key/redeem record cho trace này.</div> : null}
          </TimelineCard>

          <TimelineCard title="Runtime events" icon={Activity} count={counts.runtime}>
            {bundle.runtimeEvents.length ? bundle.runtimeEvents.map((row: any) => (
              <div key={row.id} className="rounded-xl border p-3 text-sm">
                <div className="flex items-center justify-between gap-3"><div className="font-medium">{row.event_type}</div><Badge variant={row.ok ? "outline" : "destructive"}>{row.ok ? "OK" : (row.code || "ERR")}</Badge></div>
                <div className="text-xs text-muted-foreground">Account {row.account_ref || "-"} · Device {row.device_id || "-"}</div>
                <div className="text-xs text-muted-foreground">Feature {row.feature_code || "-"} · Wallet {row.wallet_kind || "-"}</div>
                {row.meta ? <pre className="mt-2 overflow-auto rounded-lg bg-muted p-2 text-[11px] leading-5 text-muted-foreground">{JSON.stringify(row.meta, null, 2)}</pre> : null}
              </div>
            )) : <div className="text-sm text-muted-foreground">Chưa có runtime event cho trace này.</div>}
          </TimelineCard>

          <TimelineCard title="Security breadcrumbs" icon={Logs} count={counts.security}>
            {bundle.securityLogs.length ? bundle.securityLogs.map((row: any) => (
              <div key={row.id} className="rounded-xl border p-3 text-sm">
                <div className="font-medium">{row.event_type}</div>
                <div className="text-xs text-muted-foreground">Route {row.route || "-"} · Session {short(row.session_id)}</div>
                <pre className="mt-2 overflow-auto rounded-lg bg-muted p-2 text-[11px] leading-5 text-muted-foreground">{JSON.stringify(row.details || {}, null, 2)}</pre>
              </div>
            )) : <div className="text-sm text-muted-foreground">Chưa có security breadcrumb cho trace này.</div>}
          </TimelineCard>

          <TimelineCard title="Diễn giải nhanh" icon={Wallet} count={Number(Boolean(bundle))}>
            <div className="rounded-xl border p-3 text-sm text-muted-foreground">
              Dùng trace này để soi chuỗi: <span className="font-medium text-foreground">free-start → free-gate → free-reveal → issued redeem key → runtime redeem/consume</span>. Nếu bị đứt ở đâu, card tương ứng sẽ rỗng hoặc dừng ở bản ghi lỗi của bước đó.
            </div>
          </TimelineCard>
        </div>
      ) : null}
    </section>
  );
}
