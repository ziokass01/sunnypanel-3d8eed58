import { supabase } from "@/integrations/supabase/client";

export type DashboardStats = {
  total_licenses: number;
  active_licenses: number;
  expired_licenses: number;
  blocked_licenses: number;
  deleted_licenses: number;
  total_devices: number;
};

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const nowIso = new Date().toISOString();

  const [totalLic, deletedLic, blockedLic, expiredLic, activeLic, devices] = await Promise.all([
    supabase.from("licenses").select("id", { count: "exact", head: true }),
    supabase.from("licenses").select("id", { count: "exact", head: true }).not("deleted_at", "is", null),
    supabase
      .from("licenses")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("is_active", false),
    supabase
      .from("licenses")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .not("expires_at", "is", null)
      .lt("expires_at", nowIso),
    supabase
      .from("licenses")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("is_active", true)
      .or(`expires_at.is.null,expires_at.gte.${nowIso}`),
    supabase.from("license_devices").select("id", { count: "exact", head: true }),
  ]);

  const errors = [totalLic.error, deletedLic.error, blockedLic.error, expiredLic.error, activeLic.error, devices.error].filter(Boolean);
  if (errors.length) throw errors[0];

  return {
    total_licenses: totalLic.count ?? 0,
    deleted_licenses: deletedLic.count ?? 0,
    blocked_licenses: blockedLic.count ?? 0,
    expired_licenses: expiredLic.count ?? 0,
    active_licenses: activeLic.count ?? 0,
    total_devices: devices.count ?? 0,
  };
}

export type VerifyCountPoint = { day: string; count: number };

export async function fetchVerifyCountsPerDay(days = 14): Promise<VerifyCountPoint[]> {
  const { data, error } = await supabase.rpc("verify_counts_per_day", { p_days: days });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ day: String(r.day), count: Number(r.count ?? 0) }));
}
