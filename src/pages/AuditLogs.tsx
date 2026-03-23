import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchAuditLogs } from "@/features/audit/audit-api";

export function AuditLogsPage() {
  const [q, setQ] = useState("");
  const [action, setAction] = useState<string>("all");

  const queryKey = useMemo(() => ["audit_logs", { q, action }] as const, [q, action]);
  const { data = [], isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchAuditLogs({ q, action }),
  });

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Audit logs</h1>
        <p className="mt-2 text-sm text-muted-foreground">CREATE / UPDATE / DELETE / RESTORE / VERIFY</p>
      </header>

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

      {error ? <div className="text-sm text-destructive">{String(error)}</div> : null}

      <div className="rounded-lg border">
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
                  <TableCell className="text-sm">{row.action}</TableCell>
                  <TableCell className="font-mono text-xs md:text-sm">{row.license_key}</TableCell>
                  <TableCell className="text-right">
                    <pre className="max-w-[28rem] overflow-auto rounded-md bg-muted p-2 text-left text-[11px] leading-snug">
                      {JSON.stringify(row.detail ?? {}, null, 2)}
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
