import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useNow } from "@/hooks/use-now";
import {
  deleteLicenseDevice,
  fetchLicense,
  fetchLicenseDevices,
  reactivateOrRenewLicense,
  resetLicenseDevices,
  softDeleteLicense,
  updateLicense,
} from "@/features/licenses/licenses-api";
import { isoToLocal, localToIso } from "@/features/licenses/license-utils";

function computeStatus(lic: {
  is_active: boolean;
  deleted_at?: string | null;
  expires_at: string | null;
  start_on_first_use?: boolean;
  duration_days?: number | null;
  first_used_at?: string | null;
  starts_on_first_use?: boolean;
  activated_at?: string | null;
}) {
  if (lic.deleted_at) return { label: "DELETED", variant: "secondary" as const };
  if (!lic.is_active) return { label: "BLOCKED", variant: "destructive" as const };
  const startOnFirstUse = Boolean(lic.start_on_first_use ?? lic.starts_on_first_use);
  const firstUsedAt = lic.first_used_at ?? lic.activated_at ?? null;
  if (startOnFirstUse && !firstUsedAt) return { label: "Not started", variant: "outline" as const };
  if (lic.expires_at && new Date(lic.expires_at).getTime() < Date.now()) return { label: "EXPIRED", variant: "outline" as const };
  return { label: "ACTIVE", variant: "default" as const };
}

function formatDuration(seconds: number | null | undefined) {
  const s = typeof seconds === "number" && seconds > 0 ? seconds : null;
  if (!s) return "—";
  const days = Math.floor(s / 86400);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.floor(s / 3600);
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const minutes = Math.floor(s / 60);
  return `${Math.max(minutes, 1)} minute${minutes === 1 ? "" : "s"}`;
}

function formatRemainingTime(expiresAt: string | null) {
  if (!expiresAt) return "—";
  const ms = new Date(expiresAt).getTime() - Date.now();
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(m, 0)}m`;
}

function formatDurationDays(days: number | null | undefined) {
  const d = typeof days === "number" && days > 0 ? days : null;
  if (!d) return "—";
  return `${d} day${d === 1 ? "" : "s"}`;
}

export function LicenseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const licenseId = id ?? "";
  const [removeTarget, setRemoveTarget] = useState<{ id: string; device_id: string } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [resetActivationOpen, setResetActivationOpen] = useState(false);
  const [reactivateResetDevices, setReactivateResetDevices] = useState(false);
  const [reactivateExpiresLocal, setReactivateExpiresLocal] = useState<string>("");

  // Re-render countdown every 60s
  useNow(60_000);

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

  const resetDevicesMutation = useMutation({
    mutationFn: async () => resetLicenseDevices(licenseId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["license_devices", licenseId] });
      toast({ title: "Devices reset" });
      setResetOpen(false);
    },
    onError: (err) => {
      toast({ title: "Failed to reset devices", description: String(err), variant: "destructive" });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async () => {
      const expires_at = reactivateExpiresLocal ? localToIso(reactivateExpiresLocal) : null;
      await reactivateOrRenewLicense(licenseId, { expires_at });
      if (reactivateResetDevices) {
        await resetLicenseDevices(licenseId);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["licenses"] }),
        queryClient.invalidateQueries({ queryKey: ["license", licenseId] }),
        queryClient.invalidateQueries({ queryKey: ["license_devices", licenseId] }),
      ]);
      toast({ title: "License reactivated/renewed" });
      setReactivateOpen(false);
    },
    onError: (err) => {
      toast({ title: "Failed to reactivate/renew", description: String(err), variant: "destructive" });
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

  const resetActivationMutation = useMutation({
    mutationFn: async () => {
      await updateLicense(licenseId, {
        first_used_at: null,
        expires_at: null,
        // Keep legacy mirror in sync for older UIs
        activated_at: null,
      } as any);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["license", licenseId] });
      toast({ title: "Activation reset" });
      setResetActivationOpen(false);
    },
    onError: (err) => {
      toast({ title: "Failed to reset activation", description: String(err), variant: "destructive" });
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
            variant="soft"
            onClick={() => {
              const current = licQuery.data;
              if (!current) return;
              setReactivateExpiresLocal(isoToLocal(current.expires_at));
              setReactivateResetDevices(false);
              setReactivateOpen(true);
            }}
            disabled={!licQuery.data}
          >
            Reactivate/Renew
          </Button>
          <Button
            variant="soft"
            onClick={() => setResetOpen(true)}
            disabled={!licenseId || resetDevicesMutation.isPending}
          >
            Reset devices
          </Button>
          {Boolean((licQuery.data as any)?.start_on_first_use ?? (licQuery.data as any)?.starts_on_first_use) ? (
            <Button variant="soft" onClick={() => setResetActivationOpen(true)} disabled={!licQuery.data}>
              Reset activation
            </Button>
          ) : null}
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
                      {Boolean((licQuery.data as any).start_on_first_use ?? (licQuery.data as any).starts_on_first_use) &&
                      !((licQuery.data as any).first_used_at ?? (licQuery.data as any).activated_at)
                        ? "Not started"
                        : licQuery.data.expires_at
                          ? new Date(licQuery.data.expires_at).toLocaleString()
                          : "—"}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Type</div>
                  <div className="text-sm">
                    {Boolean((licQuery.data as any).start_on_first_use ?? (licQuery.data as any).starts_on_first_use)
                      ? "Start on first use"
                      : "Fixed"}
                  </div>
                </div>
                {Boolean((licQuery.data as any).start_on_first_use ?? (licQuery.data as any).starts_on_first_use) ? (
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Duration</div>
                    <div className="text-sm">
                      {(licQuery.data as any).duration_days != null
                        ? formatDurationDays((licQuery.data as any).duration_days)
                        : formatDuration((licQuery.data as any).duration_seconds)}
                    </div>
                  </div>
                ) : null}
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Remaining time</div>
                  <div className="text-sm">
                    {Boolean((licQuery.data as any).start_on_first_use ?? (licQuery.data as any).starts_on_first_use) &&
                    !((licQuery.data as any).first_used_at ?? (licQuery.data as any).activated_at)
                      ? "Not started"
                      : formatRemainingTime(licQuery.data.expires_at)}
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
                {Boolean((licQuery.data as any).start_on_first_use ?? (licQuery.data as any).starts_on_first_use) ? (
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">First used at</div>
                    <div className="text-sm">
                      {((licQuery.data as any).first_used_at ?? (licQuery.data as any).activated_at)
                        ? new Date(((licQuery.data as any).first_used_at ?? (licQuery.data as any).activated_at) as string).toLocaleString()
                        : "—"}
                    </div>
                  </div>
                ) : null}
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

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all devices?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all device bindings for this license. The next verify will re-register devices from scratch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetDevicesMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetDevicesMutation.mutate()}
              disabled={resetDevicesMutation.isPending}
            >
              {resetDevicesMutation.isPending ? "Resetting…" : "Reset devices"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={reactivateOpen} onOpenChange={setReactivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reactivate / Renew license</AlertDialogTitle>
            <AlertDialogDescription>
              This will set <span className="font-mono">deleted_at = null</span> and <span className="font-mono">is_active = true</span>, and update expiry.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reactivate-expires">Expires at (optional)</Label>
              <Input
                id="reactivate-expires"
                type="datetime-local"
                value={reactivateExpiresLocal}
                onChange={(e) => setReactivateExpiresLocal(e.target.value)}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={reactivateResetDevices}
                onCheckedChange={(v) => setReactivateResetDevices(Boolean(v))}
              />
              Also reset devices (delete all device bindings)
            </label>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={reactivateMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => reactivateMutation.mutate()}
              disabled={reactivateMutation.isPending}
            >
              {reactivateMutation.isPending ? "Applying…" : "Reactivate/Renew"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetActivationOpen} onOpenChange={setResetActivationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset activation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will set <span className="font-mono">first_used_at = null</span> and <span className="font-mono">expires_at = null</span>.
              The next successful verify will start the countdown again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetActivationMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => resetActivationMutation.mutate()} disabled={resetActivationMutation.isPending}>
              {resetActivationMutation.isPending ? "Resetting…" : "Reset activation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

