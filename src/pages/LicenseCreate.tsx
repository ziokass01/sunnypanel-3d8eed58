import { useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createLicense, generateLicenseKey } from "@/features/licenses/licenses-api";
import { localToIso } from "@/features/licenses/license-utils";
import { getErrorMessage } from "@/lib/error-message";
import { usePanelRole } from "@/hooks/use-panel-role";

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
    duration_value: z.coerce.number().int().min(1).max(999999).optional(),
    duration_unit: z.enum(["minutes", "hours", "days"]).default("hours"),
    max_devices: z.coerce.number().int().min(1),
    is_active: z.boolean(),
    public_reset_disabled: z.boolean().default(false),
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

const USER_MAX_SECONDS = 30 * 24 * 60 * 60;

function userMaxValueForUnit(unit: "minutes" | "hours" | "days") {
  if (unit === "minutes") return USER_MAX_SECONDS / 60;
  if (unit === "hours") return USER_MAX_SECONDS / 3600;
  return USER_MAX_SECONDS / 86400;
}

function localMaxDateTimeFromNow(seconds: number) {
  const d = new Date(Date.now() + seconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function secondsToText(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const parts = [];
  if (d) parts.push(`${d} ngày`);
  if (h) parts.push(`${h} giờ`);
  return parts.join(" ") || `${seconds} giây`;
}

function fieldsToSeconds(v: { duration_value?: number; duration_unit?: "minutes" | "hours" | "days" }) {
  const value = typeof v.duration_value === "number" && Number.isFinite(v.duration_value) ? v.duration_value : null;
  if (!value || value <= 0) return null;
  const unit = v.duration_unit ?? "hours";
  const mult = unit === "minutes" ? 60 : unit === "hours" ? 3600 : 86400;
  return value * mult;
}

export function LicenseCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAdmin } = usePanelRole();

  // Allow /licenses2/new to default to countdown keys without adding new wrapper components.
  const initialLicenseType: FormValues["license_type"] =
    typeof window !== "undefined" && window.location?.pathname === "/licenses2/new" ? "first_use" : "fixed";

  const cancelTo = initialLicenseType === "first_use" ? "/licenses2" : "/licenses";

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      license_type: initialLicenseType,
      key: "",
      expires_at: "",
      duration_value: 2,
      duration_unit: "hours",
      max_devices: 1,
      is_active: true,
      public_reset_disabled: false,
      note: "",
    },
  });

  const currentUnit = form.watch("duration_unit");
  const currentType = form.watch("license_type");
  const userMaxDateTime = useMemo(() => localMaxDateTimeFromNow(USER_MAX_SECONDS), []);

  useEffect(() => {
    const keyParam = searchParams.get("key");
    if (!keyParam) return;
    const trimmed = keyParam.trim();
    if (!trimmed) return;
    form.setValue("key", trimmed.toUpperCase(), { shouldDirty: true, shouldValidate: true });
  }, [form, searchParams]);

  const genMutation = useMutation({
    mutationFn: generateLicenseKey,
    onSuccess: (key) => form.setValue("key", key, { shouldDirty: true, shouldValidate: true }),
  });

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const startOnFirstUse = values.license_type === "first_use";
      const expiresIso = !startOnFirstUse ? localToIso(values.expires_at || "") : null;

      const durationSeconds = startOnFirstUse ? fieldsToSeconds(values) : null;

      if (!isAdmin) {
        if (startOnFirstUse) {
          if (!durationSeconds || durationSeconds > USER_MAX_SECONDS) {
            throw new Error("USER_MAX_30_DAYS");
          }
        } else {
          if (!expiresIso) {
            throw new Error("FIXED_EXPIRY_REQUIRED");
          }
          const expMs = new Date(expiresIso).getTime();
          if (!Number.isFinite(expMs) || expMs <= Date.now()) {
            throw new Error("EXPIRY_MUST_BE_FUTURE");
          }
          if (expMs > Date.now() + USER_MAX_SECONDS * 1000) {
            throw new Error("USER_MAX_30_DAYS");
          }
        }
      }

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
        public_reset_disabled: values.public_reset_disabled,
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



      {!isAdmin ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">User sale</Badge>
            <span className="font-medium">Tài khoản này chỉ tạo được key tối đa {secondsToText(USER_MAX_SECONDS)}.</span>
          </div>
          <div className="mt-2 text-muted-foreground">
            Fixed expiry bắt buộc phải có ngày hết hạn và không được vượt quá 30 ngày. Countdown cũng không được vượt quá 30 ngày.
          </div>
        </div>
      ) : null}

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

        {currentType === "first_use" ? (
          <div className="space-y-2">
            <Label>Duration</Label>
            <div className="grid gap-3 md:grid-cols-2">
              <Input id="duration_value" type="number" min={1} max={isAdmin ? 999999 : userMaxValueForUnit(currentUnit)} {...form.register("duration_value")} />
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
              <div className="text-sm text-destructive">{getErrorMessage((form.formState.errors as any).duration_value?.message)}</div>
            ) : null}
            <div className="text-xs text-muted-foreground">{isAdmin ? "Countdown starts on the first successful verify." : `Countdown tối đa ${secondsToText(USER_MAX_SECONDS)}.`}</div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="expires_at">Expires at</Label>
              <Input id="expires_at" type="datetime-local" max={isAdmin ? undefined : userMaxDateTime} {...form.register("expires_at")} />
              <div className="text-xs text-muted-foreground">{isAdmin ? "Leave empty = Never expires." : `Bắt buộc nhập ngày hết hạn, tối đa ${secondsToText(USER_MAX_SECONDS)} từ hiện tại.`}</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_devices">Max devices</Label>
              <Input id="max_devices" type="number" min={1} {...form.register("max_devices")} />
              {form.formState.errors.max_devices ? (
                <div className="text-sm text-destructive">{form.formState.errors.max_devices.message}</div>
              ) : null}
            </div>
          </div>
        )}

        {currentType === "first_use" ? (
          <div className="space-y-2">
            <Label htmlFor="max_devices_first_use">Max devices</Label>
            <Input id="max_devices_first_use" type="number" min={1} {...form.register("max_devices")} />
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

        {isAdmin ? (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">Cấm reset key public</div>
              <div className="text-xs text-muted-foreground">Bật lên để key này không thể bị reset từ trang Reset Key public.</div>
            </div>
            <Switch checked={form.watch("public_reset_disabled")} onCheckedChange={(v) => form.setValue("public_reset_disabled", v)} />
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="note">Note (optional)</Label>
          <Textarea id="note" rows={4} {...form.register("note")} />
        </div>

        {createMutation.error ? (
          <div className="text-sm text-destructive">{(() => {
            const msg = getErrorMessage(createMutation.error);
            if (msg.includes("USER_MAX_30_DAYS")) return "Tài khoản user chỉ tạo được key tối đa 30 ngày.";
            if (msg.includes("FIXED_EXPIRY_REQUIRED")) return "Key Fixed expiry bắt buộc phải có ngày hết hạn.";
            if (msg.includes("EXPIRY_MUST_BE_FUTURE")) return "Ngày hết hạn phải lớn hơn thời điểm hiện tại.";
            return msg;
          })()}</div>
        ) : null}

        <div className="flex gap-2">
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="soft" onClick={() => navigate(cancelTo)}>
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}
