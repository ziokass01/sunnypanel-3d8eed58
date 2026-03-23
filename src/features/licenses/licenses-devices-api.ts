import { supabase } from "@/integrations/supabase/client";

export type LicenseDeviceRow = {
  id: string;
  license_id: string;
  device_id: string;
  first_seen: string;
  last_seen: string;
};

export async function fetchLicenseDevices(licenseId: string) {
  const { data, error } = await supabase
    .from("license_devices")
    .select("id,license_id,device_id,first_seen,last_seen")
    .eq("license_id", licenseId)
    .order("last_seen", { ascending: false });
  if (error) throw error;
  return (data ?? []) as LicenseDeviceRow[];
}

export async function deleteLicenseDevice(deviceRowId: string) {
  const { error } = await supabase.from("license_devices").delete().eq("id", deviceRowId);
  if (error) throw error;
}

export async function resetLicenseDevices(licenseId: string) {
  const { error } = await supabase.from("license_devices").delete().eq("license_id", licenseId);
  if (error) throw error;
}

export async function resetLicenseDevicesPenalty(licenseId: string) {
  const { data, error } = await supabase.rpc("admin_reset_devices_penalty", {
    p_license_id: licenseId,
  });
  if (error) throw error;
  return data as any;
}
