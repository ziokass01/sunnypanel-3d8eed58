import { supabase } from "@/integrations/supabase/client";

export type ResetSettingsRow = {
  id: number;
  enabled: boolean;
  require_turnstile: boolean;
  free_first_penalty_pct: number;
  free_next_penalty_pct: number;
  paid_first_penalty_pct: number;
  paid_next_penalty_pct: number;
  public_check_limit: number;
  public_check_window_seconds: number;
  public_reset_limit: number;
  public_reset_window_seconds: number;
  user_max_duration_seconds: number;
  disabled_message: string;
  updated_at: string;
};

export type ResetActivityRow = {
  id: string;
  action: string;
  license_key: string;
  detail: any;
  created_at: string;
};

export async function fetchResetSettings(): Promise<ResetSettingsRow> {
  const { data, error } = await supabase
    .from("license_reset_settings")
    .select("*")
    .eq("id", 1)
    .single();
  if (error) throw error;
  return data as ResetSettingsRow;
}

export async function updateResetSettings(patch: Partial<ResetSettingsRow>) {
  const { data, error } = await supabase
    .from("license_reset_settings")
    .update(patch as any)
    .eq("id", 1)
    .select("*")
    .single();
  if (error) throw error;
  return data as ResetSettingsRow;
}

export async function fetchResetActivities(limit = 30): Promise<ResetActivityRow[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id,action,license_key,detail,created_at")
    .in("action", ["PUBLIC_RESET", "RESET_DEVICES", "RESET_DEVICES_PENALTY"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ResetActivityRow[];
}
