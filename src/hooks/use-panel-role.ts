import { useEffect, useMemo, useRef, useState } from "react";
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

const PANEL_ROLE_CACHE_KEY = "sunny:panel-role-cache:v2";
const PANEL_ROLE_CACHE_TTL_MS = 5 * 60 * 1000;

function readCachedPanelRole(userId?: string | null): PanelRole {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = window.localStorage.getItem(PANEL_ROLE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: string; role?: unknown; expiresAt?: number };
    if (!parsed || parsed.userId !== userId) return null;
    if (typeof parsed.expiresAt === "number" && parsed.expiresAt > 0 && parsed.expiresAt < Date.now()) return null;
    return normalizePanelRole(parsed.role);
  } catch {
    return null;
  }
}

function writeCachedPanelRole(userId?: string | null, role?: PanelRole) {
  if (typeof window === "undefined" || !userId || !role) return;
  try {
    window.localStorage.setItem(PANEL_ROLE_CACHE_KEY, JSON.stringify({ userId, role, expiresAt: Date.now() + PANEL_ROLE_CACHE_TTL_MS }));
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
  const stickyRoleRef = useRef<PanelRole>(metadataRole ?? cachedRole);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!user) {
        if (!cancelled) {
          stickyRoleRef.current = null;
          setRole(null);
          setLoading(false);
        }
        return;
      }

      const optimisticRole = metadataRole ?? cachedRole ?? stickyRoleRef.current ?? null;
      if (optimisticRole) {
        stickyRoleRef.current = optimisticRole;
        setRole(optimisticRole);
      }
      setLoading(true);
      const { data, error } = await supabase.rpc("get_my_panel_role");

      if (cancelled) return;

      const dbRole = error ? null : normalizePanelRole(data);
      const resolved = dbRole ?? metadataRole ?? cachedRole ?? stickyRoleRef.current ?? null;
      if (resolved) {
        stickyRoleRef.current = resolved;
        writeCachedPanelRole(user.id, resolved);
      }
      if (error && (metadataRole || cachedRole || stickyRoleRef.current)) {
        setRole(metadataRole ?? cachedRole ?? stickyRoleRef.current ?? null);
        setLoading(false);
        return;
      }
      setRole(resolved ?? stickyRoleRef.current ?? null);
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
