import { supabase } from "@/integrations/supabase/client";

export type AuditLogRow = {
  id: string;
  action: string;
  license_key: string;
  created_at: string;
  detail: any;
};

export async function fetchAuditLogs(params: { q?: string; action?: string; limit?: number }) {
  const q = params.q?.trim();
  const limit = params.limit ?? 200;

  let query = supabase
    .from("audit_logs")
    .select("id,action,license_key,created_at,detail")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (params.action && params.action !== "all") {
    query = query.eq("action", params.action);
  }

  if (q) {
    query = query.ilike("license_key", `%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AuditLogRow[];
}
