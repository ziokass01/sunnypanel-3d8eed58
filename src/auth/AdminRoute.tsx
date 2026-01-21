import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { NotAuthorizedPage } from "@/pages/NotAuthorized";

type Props = {
  children: React.ReactNode;
};

export function AdminRoute({ children }: Props) {
  const { user } = useAuth();
  const [roleLoading, setRoleLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

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

    run();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (roleLoading) {
    return (
      <div className="min-h-svh bg-background">
        <main className="mx-auto w-full max-w-5xl p-4 md:p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
          <div className="mt-6">
            <Skeleton className="h-80" />
          </div>
        </main>
      </div>
    );
  }

  // AuthGate handles redirecting unauthenticated users to /login.
  if (!user) return null;

  // IMPORTANT: don't bounce authenticated non-admins back to /login (causes loops).
  if (!isAdmin) return <NotAuthorizedPage />;

  return <>{children}</>;
}
