import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";

export type PanelRole = "admin" | "moderator" | "user" | null;

export function usePanelRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<PanelRole>(null);
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

      if (error) {
        setRole(null);
      } else {
        const value = String(data ?? "").trim().toLowerCase();
        if (value === "admin" || value === "moderator" || value === "user") {
          setRole(value);
        } else {
          setRole(null);
        }
      }

      setLoading(false);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return {
    role,
    loading,
    isAdmin: role === "admin",
    isUserLike: role === "admin" || role === "moderator" || role === "user",
  };
}
