import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createLicense, generateLicenseKey } from "@/features/licenses/licenses-api";
import { localToIso } from "@/features/licenses/license-utils";

const schema = z
  .object({
    start_on_first_use: z.boolean().default(false),
  key: z
    .string()
    .trim()
    .min(1, "Key is required")
    .max(64)
    .regex(/^SUNNY-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i, "Format: SUNNY-XXXX-XXXX-XXXX"),
  expires_at: z.string().optional(),
    duration_days: z.coerce.number().int().min(1).max(3650).optional(),
  max_devices: z.coerce.number().int().min(1).max(999),
  is_active: z.boolean(),
  note: z.string().trim().max(2000).optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.start_on_first_use) {
      if (!v.expires_at || !String(v.expires_at).trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["expires_at"], message: "Expires at is required" });
      }
    } else {
      if (!v.duration_days || v.duration_days <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["duration_days"], message: "Duration days is required" });
      }
    }
  });

type FormValues = z.infer<typeof schema>;

export function LicenseCreatePage() {
  const navigate = useNavigate();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
       start_on_first_use: false,
      key: "",
      expires_at: "",
       duration_days: 30,
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
      const startOnFirstUse = Boolean(values.start_on_first_use);
      const expiresIso = !startOnFirstUse ? localToIso(values.expires_at || "") : null;

      const durationDays = startOnFirstUse ? Number(values.duration_days ?? 0) : null;
      const safeDays = Number.isFinite(durationDays as any) && (durationDays as any) > 0 ? (durationDays as number) : null;
      const durationSeconds = safeDays ? safeDays * 86400 : null;
      return await createLicense({
        key: values.key.toUpperCase(),
        expires_at: expiresIso,
        // New
        start_on_first_use: startOnFirstUse,
        duration_days: safeDays,
        first_used_at: null,
        // Legacy mirror
        starts_on_first_use: startOnFirstUse,
        duration_seconds: durationSeconds,
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

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <div className="text-sm font-medium">Start on first use</div>
            <div className="text-xs text-muted-foreground">If on, countdown starts on first successful verify.</div>
          </div>
          <Switch
            checked={form.watch("start_on_first_use")}
            onCheckedChange={(v) => form.setValue("start_on_first_use", v, { shouldDirty: true, shouldValidate: true })}
          />
        </div>

        {form.watch("start_on_first_use") ? (
          <div className="space-y-2">
            <Label htmlFor="duration_days">Duration days</Label>
            <Input id="duration_days" type="number" min={1} max={3650} {...form.register("duration_days")} />
            {form.formState.errors.duration_days ? (
              <div className="text-sm text-destructive">{String((form.formState.errors as any).duration_days?.message)}</div>
            ) : null}
            <div className="text-xs text-muted-foreground">Expires will be set automatically on the first successful verify.</div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="expires_at">Expires at</Label>
              <Input id="expires_at" type="datetime-local" {...form.register("expires_at")} />
              {form.formState.errors.expires_at ? (
                <div className="text-sm text-destructive">{String(form.formState.errors.expires_at.message)}</div>
              ) : null}
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

        {form.watch("start_on_first_use") ? (
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
