import { supabase } from "@/integrations/supabase/client";

function escapeILike(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}

export type AuditLogRow = {
  id: string;
  action: string;
  license_key: string;
  created_at: string;
  detail: any;
};

type QuickFilter = "all" | "verify_fail" | "verify_ok" | "mutations" | "destructive" | "blocked" | "today" | "last_10m";

export async function fetchAuditLogs(params: { q?: string; action?: string; limit?: number; quick?: QuickFilter }) {
  const q = params.q?.trim();
  const limit = params.limit ?? 200;
  const quick = params.quick ?? "today";

  const now = new Date();
  const todayStart = `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
  const last10m = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from("audit_logs")
    .select("id,action,license_key,created_at,detail")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (params.action && params.action !== "all") {
    query = query.eq("action", params.action);
  }

  if (q) {
    const escaped = escapeILike(q);
    query = query.ilike("license_key", `%${escaped}%`);
  }

  if (quick === "today") {
    query = query.gte("created_at", todayStart);
  } else if (quick === "last_10m") {
    query = query.gte("created_at", last10m);
  } else {
    query = query.gte("created_at", last7d);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AuditLogRow[];
}
