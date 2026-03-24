import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";

export type PanelRole = "admin" | "moderator" | "user" | null;

function normalizePanelRole(value: unknown): PanelRole {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "admin" || normalized === "moderator" || normalized === "user") {
    return normalized;
  }
  return null;
}

export function usePanelRole() {
  const { user } = useAuth();
  const metadataRole = useMemo(
    () => normalizePanelRole(user?.app_metadata?.panel_role ?? user?.app_metadata?.role),
    [user?.app_metadata],
  );
  const [role, setRole] = useState<PanelRole>(metadataRole);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!user) {
        if (!cancelled) {
          setRole(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const { data, error } = await supabase.rpc("get_my_panel_role");

      if (cancelled) return;

      const dbRole = error ? null : normalizePanelRole(data);
      setRole(dbRole ?? metadataRole ?? null);
      setLoading(false);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [metadataRole, user]);

  return {
    role,
    loading,
    isAdmin: role === "admin",
    isUserLike: role === "admin" || role === "moderator" || role === "user",
  };
}
