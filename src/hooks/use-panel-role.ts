import { useQuery } from "@tanstack/react-query";
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
  const userId = user?.id ?? null;

  const roleQuery = useQuery({
    queryKey: ["panel-role", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_panel_role");
      if (error) throw error;
      return normalizePanelRole(data);
    },
    staleTime: 5 * 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  const role = userId ? roleQuery.data ?? null : null;
  // Keep an already-rendered shell mounted during a background role refresh;
  // only the first authorization lookup should show the skeleton.
  const loading = Boolean(userId) && roleQuery.isLoading && roleQuery.data === undefined;

  return {
    role,
    loading,
    isAdmin: role === "admin",
    isUserLike: role === "admin" || role === "moderator" || role === "user",
  };
}
