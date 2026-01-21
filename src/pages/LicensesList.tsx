import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NavLink } from "@/components/NavLink";
import { fetchLicenses } from "@/features/licenses/licenses-api";

export function LicensesListPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "expired" | "blocked">("all");

  const queryKey = useMemo(() => ["licenses", { q, status }] as const, [q, status]);
  const { data = [], isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchLicenses({ q, status }),
  });

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Licenses</h1>
        <Button asChild>
          <NavLink to="/licenses/new">Create license</NavLink>
        </Button>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search key/note…" />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger>
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error ? <div className="text-sm text-destructive">{String(error)}</div> : null}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead className="hidden md:table-cell">Expires</TableHead>
              <TableHead className="hidden md:table-cell">Max devices</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  No licenses found.
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => {
                const expired = row.expires_at ? new Date(row.expires_at).getTime() < Date.now() : false;
                const statusLabel = !row.is_active ? "Blocked" : expired ? "Expired" : "Active";

                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs md:text-sm">{row.key}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {row.expires_at ? new Date(row.expires_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{row.max_devices}</TableCell>
                    <TableCell>{statusLabel}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="soft" size="sm" asChild>
                        <NavLink to={`/licenses/${row.id}`}>Open</NavLink>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
