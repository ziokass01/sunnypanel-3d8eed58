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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchLicense, updateLicense } from "@/features/licenses/licenses-api";
import { isoToLocal, localToIso } from "@/features/licenses/license-utils";
import { getErrorMessage } from "@/lib/error-message";

const schema = z.object({
  expires_at: z.string().optional(),
  duration_value: z.coerce.number().int().min(1).max(999999).optional(),
  duration_unit: z.enum(["minutes", "hours", "days"]).default("days"),
  max_devices: z.coerce.number().int().min(1),
  is_active: z.boolean(),
  note: z.string().trim().max(2000).optional(),
});

type FormValues = z.infer<typeof schema>;

function secondsToFields(seconds: number | null | undefined): { duration_value: number; duration_unit: "minutes" | "hours" | "days" } {
  const s = typeof seconds === "number" && seconds > 0 ? seconds : 3600;
  if (s % 86400 === 0) return { duration_value: Math.max(1, Math.round(s / 86400)), duration_unit: "days" };
  if (s % 3600 === 0) return { duration_value: Math.max(1, Math.round(s / 3600)), duration_unit: "hours" };
  return { duration_value: Math.max(1, Math.round(s / 60)), duration_unit: "minutes" };
}

function fieldsToSeconds(v: { duration_value?: number; duration_unit?: "minutes" | "hours" | "days" }) {
  const value = typeof v.duration_value === "number" && Number.isFinite(v.duration_value) ? v.duration_value : null;
  if (!value || value <= 0) return null;
  const unit = v.duration_unit ?? "days";
  const mult = unit === "minutes" ? 60 : unit === "hours" ? 3600 : 86400;
  return value * mult;
}

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
      duration_value: 2,
      duration_unit: "hours",
      max_devices: 1,
      is_active: true,
      note: "",
    },
    values: data
      ? {
          expires_at: isoToLocal(data.expires_at),
          ...(Boolean((data as any)?.start_on_first_use ?? (data as any)?.starts_on_first_use)
            ? secondsToFields((data as any).duration_seconds ?? ((data as any).duration_days ? (data as any).duration_days * 86400 : null))
            : { duration_value: 2, duration_unit: "hours" as const }),
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
        // Allow editing duration ONLY before first use.
        if (!firstUsedAt) {
          patch.duration_seconds = fieldsToSeconds(values);
          // keep v2 days field unused
          patch.duration_days = null;
          patch.expires_at = null;
        }
      } else {
        // Standard fixed-expiry licenses keep the legacy flow.
        patch.expires_at = values.expires_at ? localToIso(values.expires_at) : null;
        // Ensure constraints stay satisfied.
        patch.duration_seconds = null;
        patch.duration_days = null;
        patch.first_used_at = null;
        patch.activated_at = null;
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
      {error ? <div className="mt-4 text-sm text-destructive">{getErrorMessage(error)}</div> : null}

      {data ? (
        <form className="mt-6 max-w-xl space-y-4" onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))}>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Key</div>
            <div className="font-mono text-sm">{data.key}</div>
          </div>

          {Boolean((data as any).start_on_first_use ?? (data as any).starts_on_first_use) ? (
            <div className="space-y-2">
              <Label>Duration</Label>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  id="duration_value"
                  type="number"
                  min={1}
                  max={999999}
                  disabled={Boolean((data as any).first_used_at ?? (data as any).activated_at)}
                  {...form.register("duration_value")}
                />
                <Select
                  value={form.watch("duration_unit")}
                  onValueChange={(v) => form.setValue("duration_unit", v as any, { shouldDirty: true, shouldValidate: true })}
                  disabled={Boolean((data as any).first_used_at ?? (data as any).activated_at)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">Minutes</SelectItem>
                    <SelectItem value="hours">Hours</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
            <Input id="max_devices" type="number" min={1} {...form.register("max_devices")} />
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
            <div className="text-sm text-destructive">{getErrorMessage(saveMutation.error)}</div>
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
