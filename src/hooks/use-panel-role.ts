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

function readCachedRole(userId: string | null | undefined): PanelRole {
  if (!userId || typeof window === "undefined") return null;
  try {
    return normalizePanelRole(window.localStorage.getItem(`panel_role:${userId}`));
  } catch (_err) {
    return null;
  }
}

function writeCachedRole(userId: string | null | undefined, role: PanelRole) {
  if (!userId || !role || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`panel_role:${userId}`, role);
  } catch (_err) {
    // ignore cache write failures
  }
}

export function usePanelRole() {
  const { user } = useAuth();
  const metadataRole = useMemo(
    () => normalizePanelRole(user?.app_metadata?.panel_role ?? user?.app_metadata?.role),
    [user?.app_metadata],
  );
  const cachedRole = useMemo(() => readCachedRole(user?.id), [user?.id]);
  const [role, setRole] = useState<PanelRole>(metadataRole ?? cachedRole);
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

      const optimisticRole = metadataRole ?? cachedRole;
      if (optimisticRole && !cancelled) {
        setRole(optimisticRole);
      }
      setLoading(true);

      const { data, error } = await supabase.rpc("get_my_panel_role");
      if (cancelled) return;

      const dbRole = error ? null : normalizePanelRole(data);
      const finalRole = dbRole ?? metadataRole ?? cachedRole ?? null;
      setRole(finalRole);
      if (finalRole) writeCachedRole(user.id, finalRole);
      setLoading(false);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [cachedRole, metadataRole, user]);

  return {
    role,
    loading,
    isAdmin: role === "admin",
    isUserLike: role === "admin" || role === "moderator" || role === "user",
  };
}
