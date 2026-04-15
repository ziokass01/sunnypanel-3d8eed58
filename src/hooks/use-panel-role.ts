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

const PANEL_ROLE_CACHE_KEY = "sunny:panel-role-cache:v1";

function readCachedPanelRole(userId?: string | null): PanelRole {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = window.localStorage.getItem(PANEL_ROLE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: string; role?: unknown };
    if (!parsed || parsed.userId !== userId) return null;
    return normalizePanelRole(parsed.role);
  } catch {
    return null;
  }
}

function writeCachedPanelRole(userId?: string | null, role?: PanelRole) {
  if (typeof window === "undefined" || !userId || !role) return;
  try {
    window.localStorage.setItem(PANEL_ROLE_CACHE_KEY, JSON.stringify({ userId, role }));
  } catch {
    // ignore cache write errors
  }
}

export function usePanelRole() {
  const { user } = useAuth();
  const metadataRole = useMemo(
    () => normalizePanelRole(user?.app_metadata?.panel_role ?? user?.app_metadata?.role),
    [user?.app_metadata],
  );
  const cachedRole = useMemo(() => readCachedPanelRole(user?.id), [user?.id]);
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

      const optimisticRole = metadataRole ?? cachedRole ?? null;
      if (optimisticRole) {
        setRole(optimisticRole);
      }
      setLoading(true);
      const { data, error } = await supabase.rpc("get_my_panel_role");

      if (cancelled) return;

      const dbRole = error ? null : normalizePanelRole(data);
      const resolved = dbRole ?? metadataRole ?? cachedRole ?? null;
      if (resolved) writeCachedPanelRole(user.id, resolved);
      setRole(resolved);
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
