import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { NavLink } from "@/components/NavLink";
import { toast } from "@/hooks/use-toast";
import { useNow } from "@/hooks/use-now";
import { fetchLicenses, softDeleteLicense } from "@/features/licenses/licenses-api";
import { formatDurationDHMS, formatRemainingFromExpires } from "@/features/licenses/time-format";

type FilterMode = "all" | "start_on_first_use";

function formatDurationForRow(row: any) {
  const dSecs = typeof row?.duration_seconds === "number" && row.duration_seconds > 0 ? row.duration_seconds : null;
  const dDays = typeof row?.duration_days === "number" && row.duration_days > 0 ? row.duration_days * 86400 : null;
  return formatDurationDHMS(dSecs ?? dDays);
}

function getLicenseType(row: any) {
  const startOnFirstUse = Boolean(row?.start_on_first_use ?? row?.starts_on_first_use);
  return startOnFirstUse ? "Start on first use" : "Fixed";
}

function computeRemainingLabel(row: any, nowMs: number) {
  const startOnFirstUse = Boolean(row?.start_on_first_use ?? row?.starts_on_first_use);
  const firstUsedAt = row?.first_used_at ?? row?.activated_at ?? null;
  const notStarted = startOnFirstUse && !firstUsedAt;
  const badState = startOnFirstUse && Boolean(firstUsedAt) && !row?.expires_at;

  if (notStarted) return `Not started • ${formatDurationForRow(row)}`;

  if (badState) return "BAD STATE (expires cleared)";

  if (!row?.expires_at) {
    // Fixed key with expires_at=NULL => never expires
    // For start-on-first-use, expires_at should be set once started; if missing, keep it neutral.
    return startOnFirstUse ? "—" : "Never expires";
  }

  return formatRemainingFromExpires(row.expires_at, nowMs) ?? "—";
}

function computeExpiresLabel(row: any) {
  const startOnFirstUse = Boolean(row?.start_on_first_use ?? row?.starts_on_first_use);
  const firstUsedAt = row?.first_used_at ?? row?.activated_at ?? null;
  const notStarted = startOnFirstUse && !firstUsedAt;
  const badState = startOnFirstUse && Boolean(firstUsedAt) && !row?.expires_at;
  if (notStarted) return "Not started";
  if (badState) return "BAD STATE (expires cleared)";
  if (!row?.expires_at) return startOnFirstUse ? "—" : "Never expires";
  return new Date(row.expires_at).toLocaleString();
}

export function FreeLicensesPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "expired" | "blocked">("all");
  const [type, setType] = useState<"all" | "fixed" | "first_use">("all");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; key: string } | null>(null);
  const queryClient = useQueryClient();

  const nowMs = useNow(10_000);

  const queryKey = useMemo(() => ["licenses", "free", { q, status }] as const, [q, status]);
  const { data = [], isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchLicenses({ q, status, free_note: "only" }),
  });

  const filteredData = useMemo(() => {
    if (type === "all") return data;
    const wantFirstUse = type === "first_use";
    return data.filter((row: any) => Boolean(row?.start_on_first_use ?? row?.starts_on_first_use) === wantFirstUse);
  }, [data, type]);

  const softDeleteMutation = useMutation({
    mutationFn: async (id: string) => softDeleteLicense(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["licenses"] });
      toast({ title: "Moved to Trash" });
    },
  });

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Free Licenses</h1>
        <div className="flex gap-2">
          <Button variant="soft" asChild>
            <NavLink to="/licenses/trash">View Trash</NavLink>
          </Button>
          <Button asChild>
            <NavLink to="/licenses/new">Create license</NavLink>
          </Button>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search key/note…" />
        </div>

        <Select value={type} onValueChange={(v) => setType(v as any)}>
          <SelectTrigger>
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="fixed">Fixed</SelectItem>
            <SelectItem value="first_use">Start on first use</SelectItem>
          </SelectContent>
        </Select>

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
              <TableHead className="hidden md:table-cell">Type</TableHead>
              <TableHead className="hidden md:table-cell">Expires</TableHead>
              <TableHead className="hidden md:table-cell">Remaining</TableHead>
              <TableHead className="hidden md:table-cell">Max devices</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : filteredData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  No licenses found.
                </TableCell>
              </TableRow>
            ) : (
              filteredData.map((row: any) => {
                const expired = row.expires_at ? new Date(row.expires_at).getTime() < nowMs : false;
                const statusLabel = !row.is_active ? "Blocked" : expired ? "Expired" : "Active";
                const remaining = computeRemainingLabel(row, nowMs);

                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-mono text-xs md:text-sm break-all">{row.key}</div>
                      <div className="mt-1 text-xs text-muted-foreground md:hidden">Remaining: {remaining}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{getLicenseType(row)}</TableCell>
                    <TableCell className="hidden md:table-cell">{computeExpiresLabel(row)}</TableCell>
                    <TableCell className="hidden md:table-cell">{remaining}</TableCell>
                    <TableCell className="hidden md:table-cell">{row.max_devices}</TableCell>
                    <TableCell>{statusLabel}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="soft" size="sm">
                            Actions
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <NavLink to={`/licenses/${row.id}`}>View</NavLink>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <NavLink to={`/licenses/${row.id}/edit`}>Edit</NavLink>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setDeleteTarget({ id: row.id, key: row.key });
                            }}
                          >
                            Soft delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => (!open ? setDeleteTarget(null) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move to Trash?</AlertDialogTitle>
            <AlertDialogDescription>
              This will soft delete the license and hide it from the list. You can restore it later from Trash.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteTarget) return;
                softDeleteMutation.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Soft delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
