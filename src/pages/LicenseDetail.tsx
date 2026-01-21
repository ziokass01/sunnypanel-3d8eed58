import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
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

      {licQuery.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}
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
              {devicesQuery.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}
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
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                          Loading…
                        </TableCell>
                      </TableRow>
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
                                if (!confirm("Remove this device?")) return;
                                removeDeviceMutation.mutate(d.id);
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
    </section>
  );
}
