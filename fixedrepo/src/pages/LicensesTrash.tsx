import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { fetchDeletedLicenses, hardDeleteLicense, restoreLicense } from "@/features/licenses/licenses-api";
import { getErrorMessage } from "@/lib/error-message";

export function LicensesTrashPage() {
  const [q, setQ] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; key: string } | null>(null);
  const queryClient = useQueryClient();

  const queryKey = useMemo(() => ["licenses", "trash", { q }] as const, [q]);
  const { data = [], isLoading, error } = useQuery({
    queryKey,
    queryFn: () => fetchDeletedLicenses({ q }),
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => restoreLicense(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["licenses"] }),
        queryClient.invalidateQueries({ queryKey }),
      ]);
    },
  });

  const hardDeleteMutation = useMutation({
    mutationFn: async (id: string) => hardDeleteLicense(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["licenses"] }),
        queryClient.invalidateQueries({ queryKey }),
      ]);
    },
  });

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Trash</h1>
          <p className="mt-1 text-sm text-muted-foreground">Soft-deleted licenses (can be restored).</p>
        </div>

        <Button asChild variant="soft">
          <NavLink to="/licenses">Back to licenses</NavLink>
        </Button>
      </header>

      <div className="max-w-xl">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search key/note…" />
      </div>

      {error ? <div className="text-sm text-destructive">{getErrorMessage(error)}</div> : null}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead className="hidden md:table-cell">Deleted at</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                  Trash is empty.
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs md:text-sm">{row.key}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {row.deleted_at ? new Date(row.deleted_at).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="soft"
                        onClick={() => {
                          if (!confirm("Restore this license?")) return;
                          restoreMutation.mutate(row.id);
                        }}
                        disabled={restoreMutation.isPending}
                      >
                        Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeleteTarget({ id: row.id, key: row.key })}
                      >
                        Xóa vĩnh viễn
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => (!open ? setDeleteTarget(null) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa vĩnh viễn?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này sẽ xóa license khỏi hệ thống và không thể khôi phục lại.
              {deleteTarget?.key ? (
                <span className="mt-2 block font-mono text-xs text-muted-foreground break-all">{deleteTarget.key}</span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={hardDeleteMutation.isPending}
              onClick={() => {
                setDeleteTarget(null);
              }}
            >
              Hủy
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) return;
                hardDeleteMutation.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
              disabled={hardDeleteMutation.isPending}
            >
              Xóa vĩnh viễn
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
