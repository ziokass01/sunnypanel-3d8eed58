import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Filter } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchAuditLogs } from "@/features/audit/audit-api";

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
  return text.length > 240 ? `${text.slice(0, 240)}…` : text;
}

export function AuditLogsPage() {
  const [q, setQ] = useState("");
  const [action, setAction] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  const queryKey = useMemo(() => ["audit_logs", { q, action }] as const, [q, action]);
  const { data = [], isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchAuditLogs({ q, action }),
  });

  return (
    <section className="space-y-4">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Audit logs</h1>
            <p className="mt-2 text-sm text-muted-foreground">CREATE / UPDATE / DELETE / RESTORE / VERIFY</p>
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

        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">Từ khóa: {q.trim() || "tất cả"}</Badge>
          <Badge variant="secondary">Action: {action === "all" ? "all" : action}</Badge>
          <Badge variant="outline">Kết quả: {data.length} dòng</Badge>
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
                </SelectContent>
              </Select>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </header>

      {error ? <div className="text-sm text-destructive">{String(error)}</div> : null}

      <div className="grid gap-3 md:hidden">
        {isLoading ? (
          <div className="rounded-xl border p-6 text-center text-sm text-muted-foreground">Loading…</div>
        ) : data.length === 0 ? (
          <div className="rounded-xl border p-6 text-center text-sm text-muted-foreground">No logs.</div>
        ) : (
          data.map((row) => (
            <div key={row.id} className="rounded-xl border bg-muted/20 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</div>
                <Badge variant={auditVariant(row.action, row.detail)}>{auditLabel(row.action, row.detail)}</Badge>
              </div>
              <div className="font-mono text-xs break-all">{row.license_key}</div>
              <pre className="rounded-lg bg-background/70 p-2 text-[11px] whitespace-pre-wrap break-words">{compactJson(row.detail)}</pre>
            </div>
          ))
        )}
      </div>

      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>License key</TableHead>
              <TableHead className="text-right">Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  No logs.
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {new Date(row.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm"><Badge variant={auditVariant(row.action, row.detail)}>{auditLabel(row.action, row.detail)}</Badge></TableCell>
                  <TableCell className="font-mono text-xs md:text-sm">{row.license_key}</TableCell>
                  <TableCell className="text-right">
                    <pre className="max-w-[28rem] overflow-auto rounded-md bg-muted p-2 text-left text-[11px] leading-snug">
                      {compactJson(row.detail)}
                    </pre>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
