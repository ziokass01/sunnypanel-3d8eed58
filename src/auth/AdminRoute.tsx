import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";

type Props = {
  children: React.ReactNode;
};

export function AdminRoute({ children }: Props) {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const [roleLoading, setRoleLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const redirectTo = useMemo(
    () => `/login?next=${encodeURIComponent(location.pathname + location.search)}`,
    [location.pathname, location.search],
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!user) {
        setIsAdmin(false);
        setRoleLoading(false);
        return;
      }

      setRoleLoading(true);
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });

      if (cancelled) return;

      if (error) {
        // Fail closed: no admin access if role check fails.
        setIsAdmin(false);
      } else {
        setIsAdmin(Boolean(data));
      }
      setRoleLoading(false);
    }

    if (!authLoading) run();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  if (authLoading || roleLoading) {
    return <div className="min-h-svh bg-background" />;
  }

  if (!user) return <Navigate to={redirectTo} replace />;
  if (!isAdmin) return <Navigate to={redirectTo} replace />;

  return <>{children}</>;
}
