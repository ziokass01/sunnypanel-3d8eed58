import { useParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { fetchLicense, updateLicense } from "@/features/licenses/licenses-api";
import { isoToLocal, localToIso } from "@/features/licenses/license-utils";

const schema = z.object({
  expires_at: z.string().optional(),
  duration_days: z.coerce.number().int().min(1).max(3650).optional(),
  max_devices: z.coerce.number().int().min(1).max(999),
  is_active: z.boolean(),
  note: z.string().trim().max(2000).optional(),
});

type FormValues = z.infer<typeof schema>;

export function LicenseEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const licenseId = id ?? "";

  const { data, isLoading, error } = useQuery({
    queryKey: ["license", licenseId],
    queryFn: () => fetchLicense(licenseId),
    enabled: Boolean(licenseId),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      expires_at: "",
      duration_days: 30,
      max_devices: 1,
      is_active: true,
      note: "",
    },
    values: data
      ? {
          expires_at: isoToLocal(data.expires_at),
          duration_days: (data as any).duration_days ?? undefined,
          max_devices: data.max_devices,
          is_active: data.is_active,
          note: data.note ?? "",
        }
      : undefined,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const startOnFirstUse = Boolean((data as any)?.start_on_first_use ?? (data as any)?.starts_on_first_use);
      const firstUsedAt = (data as any)?.first_used_at ?? (data as any)?.activated_at ?? null;

      const patch: Record<string, unknown> = {
        max_devices: values.max_devices,
        is_active: values.is_active,
        note: values.note?.trim() ? values.note.trim() : null,
      };

      if (startOnFirstUse) {
        // For start-on-first-use licenses, expires_at is managed by verify-key.
        // Allow editing duration_days ONLY before first use.
        if (!firstUsedAt) {
          patch.duration_days = typeof values.duration_days === "number" ? values.duration_days : null;
          patch.expires_at = null;
        }
      } else {
        // Standard fixed-expiry licenses keep the legacy flow.
        patch.expires_at = values.expires_at ? localToIso(values.expires_at) : null;
      }

      await updateLicense(licenseId, patch as any);
    },
    onSuccess: () => navigate(`/licenses/${licenseId}`),
  });

  return (
    <section>
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Edit license</h1>
        <p className="text-sm text-muted-foreground font-mono break-all">{licenseId}</p>
      </header>

      {isLoading ? <div className="mt-4 text-sm text-muted-foreground">Loading…</div> : null}
      {error ? <div className="mt-4 text-sm text-destructive">{String(error)}</div> : null}

      {data ? (
        <form className="mt-6 max-w-xl space-y-4" onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))}>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Key</div>
            <div className="font-mono text-sm">{data.key}</div>
          </div>

          {Boolean((data as any).start_on_first_use ?? (data as any).starts_on_first_use) ? (
            <div className="space-y-2">
              <Label htmlFor="duration_days">Duration days</Label>
              <Input
                id="duration_days"
                type="number"
                min={1}
                max={3650}
                disabled={Boolean((data as any).first_used_at ?? (data as any).activated_at)}
                {...form.register("duration_days")}
              />
              <div className="text-xs text-muted-foreground">
                {Boolean((data as any).first_used_at ?? (data as any).activated_at)
                  ? "Already started. Use Reset activation on the detail page to change duration."
                  : "Countdown will start on first successful verify."}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="expires_at">Expires at (optional)</Label>
              <Input id="expires_at" type="datetime-local" {...form.register("expires_at")} />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="max_devices">Max devices</Label>
            <Input id="max_devices" type="number" min={1} max={999} {...form.register("max_devices")} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">Active</div>
              <div className="text-xs text-muted-foreground">If off, verify-key returns KEY_BLOCKED.</div>
            </div>
            <Switch checked={form.watch("is_active")} onCheckedChange={(v) => form.setValue("is_active", v)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Textarea id="note" rows={4} {...form.register("note")} />
          </div>

          {saveMutation.error ? (
            <div className="text-sm text-destructive">{String(saveMutation.error)}</div>
          ) : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="soft" onClick={() => navigate(`/licenses/${licenseId}`)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
