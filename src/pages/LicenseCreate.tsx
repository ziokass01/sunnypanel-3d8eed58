import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createLicense, generateLicenseKey } from "@/features/licenses/licenses-api";
import { localToIso } from "@/features/licenses/license-utils";

const schema = z
  .object({
    license_type: z.enum(["fixed", "first_use"]).default("fixed"),
    key: z
      .string()
      .trim()
      .min(1, "Key is required")
      .max(64)
      .regex(/^SUNNY-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i, "Format: SUNNY-XXXX-XXXX-XXXX"),
    expires_at: z.string().optional(),
    duration_value: z.coerce.number().int().min(1).max(3650).optional(),
    duration_unit: z.enum(["minutes", "hours", "days"]).default("hours"),
    max_devices: z.coerce.number().int().min(1).max(999),
    is_active: z.boolean(),
    note: z.string().trim().max(2000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.license_type === "first_use") {
      const value = typeof v.duration_value === "number" && Number.isFinite(v.duration_value) ? v.duration_value : null;
      if (!value || value <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["duration_value"], message: "Duration is required" });
      }
    }
  });

type FormValues = z.infer<typeof schema>;

function fieldsToSeconds(v: { duration_value?: number; duration_unit?: "minutes" | "hours" | "days" }) {
  const value = typeof v.duration_value === "number" && Number.isFinite(v.duration_value) ? v.duration_value : null;
  if (!value || value <= 0) return null;
  const unit = v.duration_unit ?? "hours";
  const mult = unit === "minutes" ? 60 : unit === "hours" ? 3600 : 86400;
  return value * mult;
}

export function LicenseCreatePage() {
  const navigate = useNavigate();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      license_type: "fixed",
      key: "",
      expires_at: "",
      duration_value: 2,
      duration_unit: "hours",
      max_devices: 1,
      is_active: true,
      note: "",
    },
  });

  const genMutation = useMutation({
    mutationFn: generateLicenseKey,
    onSuccess: (key) => form.setValue("key", key, { shouldDirty: true, shouldValidate: true }),
  });

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const startOnFirstUse = values.license_type === "first_use";
      const expiresIso = !startOnFirstUse ? localToIso(values.expires_at || "") : null;

      const durationSeconds = startOnFirstUse ? fieldsToSeconds(values) : null;

      return await createLicense({
        key: values.key.toUpperCase(),
        expires_at: startOnFirstUse ? null : expiresIso,
        // New
        start_on_first_use: startOnFirstUse,
        duration_days: null,
        duration_seconds: durationSeconds,
        first_used_at: null,
        // Legacy mirror
        starts_on_first_use: startOnFirstUse,
        activated_at: null,
        max_devices: values.max_devices,
        is_active: values.is_active,
        note: values.note?.trim() ? values.note.trim() : null,
      });
    },
    onSuccess: ({ id }) => navigate(`/licenses/${id}`),
  });

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Create license</h1>
        <p className="mt-2 text-sm text-muted-foreground">Generate server-side or paste a key, then save.</p>
      </header>

      <form className="max-w-xl space-y-4" onSubmit={form.handleSubmit((v) => createMutation.mutate(v))}>
        <div className="space-y-2">
          <div className="flex items-end justify-between gap-3">
            <Label htmlFor="key">Key</Label>
            <Button type="button" variant="soft" size="sm" onClick={() => genMutation.mutate()} disabled={genMutation.isPending}>
              {genMutation.isPending ? "Generating…" : "Generate"}
            </Button>
          </div>
          <Input id="key" {...form.register("key")} placeholder="SUNNY-XXXX-XXXX-XXXX" className="font-mono" />
          {form.formState.errors.key ? (
            <div className="text-sm text-destructive">{form.formState.errors.key.message}</div>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label>License type</Label>
          <Select
            value={form.watch("license_type")}
            onValueChange={(v) => form.setValue("license_type", v as any, { shouldDirty: true, shouldValidate: true })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">Fixed expiry</SelectItem>
              <SelectItem value="first_use">Countdown</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground">
            {form.watch("license_type") === "first_use"
              ? "Countdown starts on the first successful verify. Expires will be set automatically."
              : "Leave Expires at empty = Never expires."}
          </div>
        </div>

        {form.watch("license_type") === "first_use" ? (
          <div className="space-y-2">
            <Label>Duration</Label>
            <div className="grid gap-3 md:grid-cols-2">
              <Input id="duration_value" type="number" min={1} max={3650} {...form.register("duration_value")} />
              <Select
                value={form.watch("duration_unit")}
                onValueChange={(v) => form.setValue("duration_unit", v as any, { shouldDirty: true, shouldValidate: true })}
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

            {form.formState.errors.duration_value ? (
              <div className="text-sm text-destructive">{String((form.formState.errors as any).duration_value?.message)}</div>
            ) : null}
            <div className="text-xs text-muted-foreground">Countdown starts on the first successful verify.</div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="expires_at">Expires at</Label>
              <Input id="expires_at" type="datetime-local" {...form.register("expires_at")} />
              <div className="text-xs text-muted-foreground">Leave empty = Never expires.</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_devices">Max devices</Label>
              <Input id="max_devices" type="number" min={1} max={999} {...form.register("max_devices")} />
              {form.formState.errors.max_devices ? (
                <div className="text-sm text-destructive">{form.formState.errors.max_devices.message}</div>
              ) : null}
            </div>
          </div>
        )}

        {form.watch("license_type") === "first_use" ? (
          <div className="space-y-2">
            <Label htmlFor="max_devices_first_use">Max devices</Label>
            <Input id="max_devices_first_use" type="number" min={1} max={999} {...form.register("max_devices")} />
            {form.formState.errors.max_devices ? (
              <div className="text-sm text-destructive">{form.formState.errors.max_devices.message}</div>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <div className="text-sm font-medium">Active</div>
            <div className="text-xs text-muted-foreground">If off, verify-key returns KEY_BLOCKED.</div>
          </div>
          <Switch checked={form.watch("is_active")} onCheckedChange={(v) => form.setValue("is_active", v)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="note">Note (optional)</Label>
          <Textarea id="note" rows={4} {...form.register("note")} />
        </div>

        {createMutation.error ? (
          <div className="text-sm text-destructive">{String(createMutation.error)}</div>
        ) : null}

        <div className="flex gap-2">
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="soft" onClick={() => navigate("/licenses")}>
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}
