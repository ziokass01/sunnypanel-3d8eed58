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
  const { data, error } = await supabase.rpc("dashboard_stats_scoped");
  if (error) throw error;

  return {
    total_licenses: Number((data as any)?.total_licenses ?? 0),
    active_licenses: Number((data as any)?.active_licenses ?? 0),
    expired_licenses: Number((data as any)?.expired_licenses ?? 0),
    blocked_licenses: Number((data as any)?.blocked_licenses ?? 0),
    deleted_licenses: Number((data as any)?.deleted_licenses ?? 0),
    total_devices: Number((data as any)?.total_devices ?? 0),
  };
}

export type VerifyCountPoint = { day: string; count: number };

export async function fetchVerifyCountsPerDay(days = 14): Promise<VerifyCountPoint[]> {
  const { data, error } = await supabase.rpc("verify_counts_per_day_scoped", { p_days: days });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ day: String(r.day), count: Number(r.count ?? 0) }));
}
