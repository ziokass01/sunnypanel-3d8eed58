import { supabase } from "@/integrations/supabase/client";

export type LicenseDeviceRow = {
  id: string;
  license_id: string;
  device_id: string;
  device_name?: string | null;
  first_seen: string;
  last_seen: string;
};

export type LicenseIpBindingRow = {
  id: string;
  license_id: string;
  app_code: string;
  ip_hash: string;
  first_seen_at: string;
  last_seen_at: string;
  verify_count: number;
};

export async function fetchLicenseDevices(licenseId: string) {
  const { data, error } = await supabase
    .from("license_devices")
    .select("id,license_id,device_id,device_name,first_seen,last_seen")
    .eq("license_id", licenseId)
    .order("last_seen", { ascending: false });
  if (error) throw error;
  return (data ?? []) as LicenseDeviceRow[];
}

export async function fetchLicenseIpBindings(licenseId: string) {
  const { data, error } = await supabase
    .from("license_ip_bindings" as any)
    .select("id,license_id,app_code,ip_hash,first_seen_at,last_seen_at,verify_count")
    .eq("license_id", licenseId)
    .order("last_seen_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as LicenseIpBindingRow[];
}

export async function deleteLicenseDevice(deviceRowId: string) {
  const { error } = await supabase.from("license_devices").delete().eq("id", deviceRowId);
  if (error) throw error;
}

export async function resetLicenseDevices(licenseId: string) {
  const { data: before, error: beforeErr } = await supabase
    .from("licenses")
    .select("key")
    .eq("id", licenseId)
    .single();
  if (beforeErr) throw beforeErr;

  const { count, error: countErr } = await supabase
    .from("license_devices")
    .select("id", { count: "exact", head: true })
    .eq("license_id", licenseId);
  if (countErr) throw countErr;

  const { error } = await supabase.from("license_devices").delete().eq("license_id", licenseId);
  if (error) throw error;

  const { error: auditErr } = await supabase.rpc("log_audit", {
    p_action: "RESET_DEVICES",
    p_license_key: before.key,
    p_detail: { license_id: licenseId, devices_removed: count ?? 0 },
  });
  if (auditErr) throw auditErr;
}

export async function resetLicenseDevicesPenalty(licenseId: string) {
  const { data, error } = await supabase.rpc("admin_reset_devices_penalty", {
    p_license_id: licenseId,
  });
  if (error) throw error;
  return data as any;
}
