import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
import { toast } from "@/hooks/use-toast";
import { deleteLicenseDevice, fetchLicense, fetchLicenseDevices, softDeleteLicense } from "@/features/licenses/licenses-api";

function computeStatus(lic: {
  is_active: boolean;
  deleted_at?: string | null;
  expires_at: string | null;
}) {
  if (lic.deleted_at) return { label: "DELETED", variant: "secondary" as const };
  if (!lic.is_active) return { label: "BLOCKED", variant: "destructive" as const };
  if (lic.expires_at && new Date(lic.expires_at).getTime() < Date.now()) return { label: "EXPIRED", variant: "outline" as const };
  return { label: "ACTIVE", variant: "default" as const };
}

export function LicenseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const licenseId = id ?? "";
  const [removeTarget, setRemoveTarget] = useState<{ id: string; device_id: string } | null>(null);

  const licQuery = useQuery({
    queryKey: ["license", licenseId],
    queryFn: () => fetchLicense(licenseId),
    enabled: Boolean(licenseId),
  });

  const devicesQuery = useQuery({
    queryKey: ["license_devices", licenseId],
    queryFn: () => fetchLicenseDevices(licenseId),
    enabled: Boolean(licenseId),
  });

  const currentDevicesCount = devicesQuery.data?.length ?? 0;

  const status = useMemo(() => {
    if (!licQuery.data) return null;
    return computeStatus(licQuery.data);
  }, [licQuery.data]);

  const removeDeviceMutation = useMutation({
    mutationFn: async (deviceRowId: string) => deleteLicenseDevice(deviceRowId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["license_devices", licenseId] });
      toast({ title: "Removed device successfully" });
      setRemoveTarget(null);
    },
    onError: (err) => {
      toast({ title: "Failed to remove device", description: String(err), variant: "destructive" });
    },
  });

  const softDeleteMutation = useMutation({
    mutationFn: async () => softDeleteLicense(licenseId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["licenses"] }),
        queryClient.invalidateQueries({ queryKey: ["license", licenseId] }),
      ]);
      toast({ title: "Moved to Trash" });
      navigate("/licenses", { replace: true });
    },
  });

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">License</h1>
            {status ? <Badge variant={status.variant}>{status.label}</Badge> : null}
          </div>
          <p className="mt-2 font-mono text-xs text-muted-foreground break-all">{licenseId}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="soft"
            onClick={async () => {
              const key = licQuery.data?.key;
              if (!key) return;
              await navigator.clipboard.writeText(key);
              toast({ title: "Copied" });
            }}
            disabled={!licQuery.data?.key}
          >
            Copy key
          </Button>
          <Button variant="soft" onClick={() => navigate(`/licenses/${licenseId}/edit`)} disabled={!licenseId}>
            Edit
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (!confirm("Soft delete this license?")) return;
              softDeleteMutation.mutate();
            }}
            disabled={softDeleteMutation.isPending}
          >
            Delete
          </Button>
        </div>
      </header>

      {licQuery.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
              <Separator />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Devices</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border">
                <div className="p-4 space-y-3">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
      {licQuery.error ? <div className="text-sm text-destructive">{String(licQuery.error)}</div> : null}
      {!licQuery.isLoading && !licQuery.error && !licQuery.data ? (
        <div className="text-sm text-muted-foreground">Not found.</div>
      ) : null}

      {licQuery.data ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Key</div>
                <div className="font-mono text-sm break-all">{licQuery.data.key}</div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Expires</div>
                  <div className="text-sm">
                    {licQuery.data.expires_at ? new Date(licQuery.data.expires_at).toLocaleString() : "—"}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Max devices</div>
                  <div className="text-sm">{licQuery.data.max_devices}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Active</div>
                  <div className="text-sm">{licQuery.data.is_active ? "Yes" : "No"}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Devices</div>
                  <div className="text-sm">{currentDevicesCount}</div>
                </div>
              </div>
              <Separator />
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Created</div>
                <div className="text-sm">{new Date(licQuery.data.created_at).toLocaleString()}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Deleted at</div>
                <div className="text-sm">
                  {licQuery.data.deleted_at ? new Date(licQuery.data.deleted_at).toLocaleString() : "—"}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Note</div>
                <div className="text-sm whitespace-pre-wrap break-words">{licQuery.data.note ?? "—"}</div>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Devices</CardTitle>
            </CardHeader>
            <CardContent>
              {devicesQuery.error ? <div className="text-sm text-destructive">{String(devicesQuery.error)}</div> : null}

              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead className="hidden md:table-cell">First seen</TableHead>
                      <TableHead className="hidden md:table-cell">Last seen</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {devicesQuery.isLoading ? (
                      Array.from({ length: 4 }).map((_, idx) => (
                        <TableRow key={`sk-${idx}`}>
                          <TableCell>
                            <Skeleton className="h-4 w-[min(520px,100%)]" />
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Skeleton className="h-4 w-40" />
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Skeleton className="h-4 w-40" />
                          </TableCell>
                          <TableCell className="text-right">
                            <Skeleton className="ml-auto h-8 w-24" />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (devicesQuery.data ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                          No devices yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (devicesQuery.data ?? []).map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-mono text-xs md:text-sm break-all">{d.device_id}</TableCell>
                          <TableCell className="hidden md:table-cell text-sm">{new Date(d.first_seen).toLocaleString()}</TableCell>
                          <TableCell className="hidden md:table-cell text-sm">{new Date(d.last_seen).toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="soft"
                              onClick={() => {
                                setRemoveTarget({ id: d.id, device_id: d.device_id });
                              }}
                              disabled={removeDeviceMutation.isPending}
                            >
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <AlertDialog open={Boolean(removeTarget)} onOpenChange={(open) => (!open ? setRemoveTarget(null) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove device?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the device from this license. Device: <span className="font-mono">{removeTarget?.device_id}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeDeviceMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!removeTarget) return;
                removeDeviceMutation.mutate(removeTarget.id);
              }}
              disabled={removeDeviceMutation.isPending}
            >
              {removeDeviceMutation.isPending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
