import { supabase } from "@/integrations/supabase/client";
import { postFunction } from "@/lib/functions";

function escapeILike(s: string): string {
  // Escape ILIKE wildcards and the escape character itself.
  // This prevents wildcard-broadening and PostgREST filter-string trickery when interpolating into `.or()`.
  return s.replace(/[\\%_]/g, "\\\\$&");
}

export type LicenseRow = {
  id: string;
  key: string;
  created_at: string;
  expires_at: string | null;
  // New v2 fields
  start_on_first_use?: boolean;
  duration_days?: number | null;
  first_used_at?: string | null;
  // Legacy fields (kept for backward compatibility)
  starts_on_first_use?: boolean;
  duration_seconds?: number | null;
  activated_at?: string | null;
  max_devices: number;
  is_active: boolean;
  public_reset_disabled?: boolean;
  note: string | null;
  deleted_at?: string | null;
};

export type LicenseDeviceRow = {
  id: string;
  license_id: string;
  device_id: string;
  first_seen: string;
  last_seen: string;
};

export { fetchLicenseDevices, deleteLicenseDevice, resetLicenseDevices, resetLicenseDevicesPenalty } from "./licenses-devices-api";

// Note: backend schema evolved (deleted_at). Types file may lag, so we intentionally loosen typing here.
const licensesTable = "licenses" as any;

async function logAudit(action: string, licenseKey: string, detail: unknown = {}) {
  // Admin-only RPC; will throw if user isn't admin.
  const { error } = await supabase.rpc("log_audit", {
    p_action: action,
    p_license_key: licenseKey,
    p_detail: detail as any,
  });
  if (error) throw error;
}

export async function fetchLicenses(params: {
  q?: string;
  status?: "all" | "active" | "expired" | "blocked";
  free_note?: "all" | "exclude" | "only";
}) {
  const q = params.q?.trim();
  const status = params.status ?? "all";
  const freeNote = params.free_note ?? "all";

  let query = (supabase.from(licensesTable) as any)
    .select(
      "id,key,created_at,expires_at," +
        "start_on_first_use,duration_days,first_used_at," +
        "starts_on_first_use,duration_seconds,activated_at," +
        "max_devices,is_active,public_reset_disabled,note,deleted_at",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (freeNote === "exclude") {
    // Keep NULL notes, exclude FREE% notes
    query = query.or("note.is.null,note.not.ilike.FREE%");
  } else if (freeNote === "only") {
    query = query.ilike("note", "FREE%");
  }

  if (q) {
    const escaped = escapeILike(q);
    query = query.or(`key.ilike.%${escaped}%,note.ilike.%${escaped}%`);
  }

  const nowIso = new Date().toISOString();
  if (status === "active") {
    query = query.eq("is_active", true).or(`expires_at.is.null,expires_at.gte.${nowIso}`);
  } else if (status === "expired") {
    query = query.not("expires_at", "is", null).lt("expires_at", nowIso);
  } else if (status === "blocked") {
    query = query.eq("is_active", false);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as LicenseRow[];
}

export async function fetchLicense(id: string) {
  const { data, error } = await (supabase.from(licensesTable) as any)
    .select(
      "id,key,created_at,expires_at," +
        "start_on_first_use,duration_days,first_used_at," +
        "starts_on_first_use,duration_seconds,activated_at," +
        "max_devices,is_active,public_reset_disabled,note,deleted_at",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as LicenseRow | null;
}

export async function createLicense(input: {
  key: string;
  expires_at: string | null;
  // New v2 fields
  start_on_first_use?: boolean;
  duration_days?: number | null;
  first_used_at?: string | null;
  // Legacy fields (optional)
  starts_on_first_use?: boolean;
  duration_seconds?: number | null;
  activated_at?: string | null;
  max_devices: number;
  is_active: boolean;
  public_reset_disabled?: boolean;
  note: string | null;
}) {
  const { data, error } = await (supabase.from(licensesTable) as any)
    .insert({
      key: input.key,
      expires_at: input.expires_at,
      // New
      start_on_first_use: input.start_on_first_use ?? false,
      duration_days: input.duration_days ?? null,
      first_used_at: input.first_used_at ?? null,
      // Legacy mirror
      starts_on_first_use: input.starts_on_first_use ?? input.start_on_first_use ?? false,
      duration_seconds: input.duration_seconds ?? (typeof input.duration_days === "number" ? input.duration_days * 86400 : null),
      activated_at: input.activated_at ?? input.first_used_at ?? null,
      max_devices: input.max_devices,
      is_active: input.is_active,
      public_reset_disabled: input.public_reset_disabled ?? false,
      note: input.note,
    })
    .select("id")
    .single();
  if (error) throw error;
  await logAudit("CREATE", input.key, {
    expires_at: input.expires_at,
    start_on_first_use: input.start_on_first_use ?? false,
    duration_days: input.duration_days ?? null,
    first_used_at: input.first_used_at ?? null,
    starts_on_first_use: input.starts_on_first_use ?? input.start_on_first_use ?? false,
    duration_seconds: input.duration_seconds ?? (typeof input.duration_days === "number" ? input.duration_days * 86400 : null),
    activated_at: input.activated_at ?? input.first_used_at ?? null,
    max_devices: input.max_devices,
    is_active: input.is_active,
    public_reset_disabled: input.public_reset_disabled ?? false,
    note: input.note,
  });
  return data as { id: string };
}

export async function updateLicense(id: string, patch: Partial<Omit<LicenseRow, "id" | "created_at" | "key">>) {
  const { data: before, error: fetchErr } = await (supabase.from(licensesTable) as any)
    .select("key")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!before?.key) throw new Error("LICENSE_NOT_FOUND");

  const { error } = await (supabase.from(licensesTable) as any).update(patch).eq("id", id);
  if (error) throw error;

  await logAudit("UPDATE", before.key, { patch });
}

export async function softDeleteLicense(id: string) {
  const { data: before, error: fetchErr } = await (supabase.from(licensesTable) as any)
    .select("key")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!before?.key) throw new Error("LICENSE_NOT_FOUND");

  const ts = new Date().toISOString();

  const { error } = await (supabase.from(licensesTable) as any)
    .update({ deleted_at: ts, is_active: false })
    .eq("id", id);
  if (error) throw error;

  // Optional metadata for traceability
  const { data: userData } = await supabase.auth.getUser();
  const user_id = userData.user?.id ?? null;

  await logAudit("SOFT_DELETE", before.key, {
    license_id: id,
    key: before.key,
    deleted_at: true,
    ts,
    user_id,
  });
}

export async function fetchDeletedLicenses(params: { q?: string } = {}) {
  const q = params.q?.trim();

  let query = (supabase.from(licensesTable) as any)
    .select("id,key,created_at,expires_at,max_devices,is_active,note,deleted_at")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (q) {
    const escaped = escapeILike(q);
    query = query.or(`key.ilike.%${escaped}%,note.ilike.%${escaped}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as LicenseRow[];
}

export async function restoreLicense(id: string) {
  const { data: before, error: fetchErr } = await (supabase.from(licensesTable) as any)
    .select("key")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!before?.key) throw new Error("LICENSE_NOT_FOUND");

  const { error } = await (supabase.from(licensesTable) as any).update({ deleted_at: null }).eq("id", id);
  if (error) throw error;

  await logAudit("RESTORE", before.key, { restored: true });
}

export async function hardDeleteLicense(id: string) {
  const { data: before, error: fetchErr } = await (supabase.from(licensesTable) as any)
    .select("key")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!before?.key) throw new Error("LICENSE_NOT_FOUND");

  // Ensure we don't violate FK constraints (license_devices -> licenses)
  const { error: devicesErr } = await supabase.from("license_devices").delete().eq("license_id", id);
  if (devicesErr) throw devicesErr;

  // Log before the physical delete while ownership checks can still see the license row.
  await logAudit("HARD_DELETE", before.key, { license_id: id, hard_deleted: true });

  const { error } = await (supabase.from(licensesTable) as any).delete().eq("id", id);
  if (error) throw error;
}

export async function reactivateOrRenewLicense(id: string, params: { expires_at: string | null }) {
  const { data: before, error: fetchErr } = await (supabase.from(licensesTable) as any)
    .select("key")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!before?.key) throw new Error("LICENSE_NOT_FOUND");

  const patch = {
    deleted_at: null,
    is_active: true,
    expires_at: params.expires_at,
  };

  const { error } = await (supabase.from(licensesTable) as any).update(patch).eq("id", id);
  if (error) throw error;

  await logAudit("REACTIVATE_RENEW", before.key, { license_id: id, ...patch });
}

export async function generateLicenseKey() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? null;
  const res = await postFunction<{ ok: boolean; key?: string; msg?: string }>(
    "/generate-license-key",
    {},
    { authToken: token },
  );
  if (!res.ok || !res.key) throw new Error(res.msg ?? "GEN_FAILED");
  return res.key;
}
