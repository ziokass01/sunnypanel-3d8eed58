import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, Filter, ShieldAlert, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchAuditLogs } from "@/features/audit/audit-api";

type QuickFilter = "all" | "verify_fail" | "verify_ok" | "mutations" | "destructive";

function auditVariant(action?: string, detail?: any) {
  const v = String(action ?? "").toUpperCase();
  if (v === "VERIFY") {
    return detail?.ok === false ? ("destructive" as const) : ("default" as const);
  }
  if (["CREATE", "RESTORE"].includes(v)) return "default" as const;
  if (["DELETE", "HARD_DELETE"].includes(v)) return "destructive" as const;
  if (["UPDATE"].includes(v)) return "secondary" as const;
  return "outline" as const;
}

function auditLabel(action?: string, detail?: any) {
  const v = String(action ?? "").toUpperCase();
  if (v === "VERIFY") return detail?.ok === false ? "VERIFY FAIL" : "VERIFY OK";
  return v || "UNKNOWN";
}

function compactJson(value: unknown) {
  const text = JSON.stringify(value ?? {}, null, 2);
  return text.length > 280 ? `${text.slice(0, 280)}…` : text;
}

function maskValue(v: string) {
  if (!v) return v;
  if (v.length <= 8) return `${v.slice(0, 2)}…`;
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

function maskDetail(value: any): any {
  if (Array.isArray(value)) return value.map(maskDetail);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string" && /(ip|device|fingerprint|token|session|secret|hash)/i.test(key)) {
      out[key] = maskValue(raw);
    } else if (raw && typeof raw === "object") {
      out[key] = maskDetail(raw);
    } else {
      out[key] = raw;
    }
  }
  return out;
}

export function AuditLogsPage() {
  const [q, setQ] = useState("");
  const [action, setAction] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [quick, setQuick] = useState<QuickFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const queryKey = useMemo(() => ["audit_logs", { q, action }] as const, [q, action]);
  const { data = [], isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchAuditLogs({ q, action }),
  });

  const filteredData = useMemo(() => {
    return data.filter((row) => {
      if (quick === "verify_fail") return String(row.action).toUpperCase() === "VERIFY" && row.detail?.ok === false;
      if (quick === "verify_ok") return String(row.action).toUpperCase() === "VERIFY" && row.detail?.ok !== false;
      if (quick === "mutations") return ["CREATE", "UPDATE", "RESTORE"].includes(String(row.action).toUpperCase());
      if (quick === "destructive") return ["DELETE", "HARD_DELETE"].includes(String(row.action).toUpperCase()) || row.detail?.ok === false;
      return true;
    });
  }, [data, quick]);

  const stats = useMemo(() => {
    const total = filteredData.length;
    const verifyOk = filteredData.filter((row) => String(row.action).toUpperCase() === "VERIFY" && row.detail?.ok !== false).length;
    const verifyFail = filteredData.filter((row) => String(row.action).toUpperCase() === "VERIFY" && row.detail?.ok === false).length;
    const destructive = filteredData.filter((row) => ["DELETE", "HARD_DELETE"].includes(String(row.action).toUpperCase())).length;
    return { total, verifyOk, verifyFail, destructive };
  }, [filteredData]);

  const quickButtons: Array<{ key: QuickFilter; label: string }> = [
    { key: "all", label: "Tất cả" },
    { key: "verify_fail", label: "Verify fail" },
    { key: "verify_ok", label: "Verify ok" },
    { key: "mutations", label: "Create / Update" },
    { key: "destructive", label: "Delete / lỗi" },
  ];

  return (
    <section className="space-y-4">
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Audit logs</h1>
            <p className="mt-2 text-sm text-muted-foreground">Theo dõi thao tác tạo, sửa, xoá và xác minh key theo cách gọn hơn, dễ đọc hơn.</p>
          </div>
          <Collapsible open={showFilters} onOpenChange={setShowFilters}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="h-4 w-4" />
                Bộ lọc
                <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
          </Collapsible>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Tổng log</div>
                <div className="mt-1 text-2xl font-semibold">{stats.total}</div>
              </div>
              <Badge variant="outline">Rows</Badge>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Verify OK</div>
                <div className="mt-1 text-2xl font-semibold">{stats.verifyOk}</div>
              </div>
              <CheckCircle2 className="h-5 w-5 text-primary" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Verify fail</div>
                <div className="mt-1 text-2xl font-semibold">{stats.verifyFail}</div>
              </div>
              <ShieldAlert className="h-5 w-5 text-destructive" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Delete / hard delete</div>
                <div className="mt-1 text-2xl font-semibold">{stats.destructive}</div>
              </div>
              <Trash2 className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-2">
          {quickButtons.map((item) => (
            <Button key={item.key} size="sm" variant={quick === item.key ? "default" : "outline"} onClick={() => setQuick(item.key)}>
              {item.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">Từ khoá: {q.trim() || "tất cả"}</Badge>
          <Badge variant="secondary">Action: {action === "all" ? "all" : action}</Badge>
          <Badge variant="outline">Hiển thị: {filteredData.length} dòng</Badge>
        </div>

        <Collapsible open={showFilters} onOpenChange={setShowFilters}>
          <CollapsibleContent className="rounded-xl border bg-muted/20 p-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="md:col-span-2">
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by license key…" />
              </div>
              <Select value={action} onValueChange={(v) => setAction(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="VERIFY">VERIFY</SelectItem>
                  <SelectItem value="CREATE">CREATE</SelectItem>
                  <SelectItem value="UPDATE">UPDATE</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                  <SelectItem value="RESTORE">RESTORE</SelectItem>
                  <SelectItem value="HARD_DELETE">HARD_DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </header>

      {error ? <div className="text-sm text-destructive">{(error as Error).message}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>Danh sách log</CardTitle>
          <CardDescription>Mặc định dữ liệu nhạy cảm được rút gọn. Bấm “Xem đầy đủ” nếu cần soi chi tiết.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}
          {!isLoading && !filteredData.length ? <div className="text-sm text-muted-foreground">Không có dữ liệu phù hợp.</div> : null}
          {filteredData.map((row) => {
            const open = expandedId === row.id;
            return (
              <div key={row.id} className="rounded-xl border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={auditVariant(row.action, row.detail)}>{auditLabel(row.action, row.detail)}</Badge>
                      <Badge variant="outline">{new Date(row.created_at).toLocaleString("vi-VN")}</Badge>
                    </div>
                    <div className="font-mono text-sm break-all">{row.license_key || "-"}</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setExpandedId(open ? null : row.id)}>
                    {open ? "Ẩn" : "Xem đầy đủ"}
                  </Button>
                </div>
                <div className="mt-3 rounded-lg bg-muted/30 p-3 text-xs">
                  <pre className="whitespace-pre-wrap break-words">{open ? JSON.stringify(row.detail ?? {}, null, 2) : compactJson(maskDetail(row.detail))}</pre>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}
