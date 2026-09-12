import { supabase } from "@/integrations/supabase/client";

export type LicenseDeviceRow = {
  id: string;
  license_id: string;
  device_id: string;
  device_name?: string | null;
  session_generation?: number | null;
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
    .select("id,license_id,device_id,device_name,session_generation,first_seen,last_seen")
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
  const { error } = await supabase.rpc("panel_remove_license_device" as any, {
    p_device_row_id: deviceRowId,
  } as any);
  if (error) throw error;
}

export async function resetLicenseDevices(licenseId: string) {
  const { data, error } = await supabase.rpc("panel_reset_license_devices" as any, {
    p_license_id: licenseId,
  } as any);
  if (error) throw error;
  return data as any;
}

export async function resetLicenseDevicesPenalty(licenseId: string) {
  const { data, error } = await supabase.rpc("admin_reset_devices_penalty", {
    p_license_id: licenseId,
  });
  if (error) throw error;
  return data as any;
}

export async function repairLicenseDeviceSession(licenseId: string, deviceId: string) {
  const { data, error } = await supabase.rpc("admin_repair_license_session" as any, {
    p_license_id: licenseId,
    p_device_id: deviceId,
  } as any);
  if (error) throw error;
  return data as any;
}
