import { useMemo } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  children: React.ReactNode;
};

export function AuthGate({ children }: Props) {
  const { user, loading } = useAuth();
  const location = useLocation();

  const redirectTo = useMemo(
    () => `/login?next=${encodeURIComponent(location.pathname + location.search)}`,
    [location.pathname, location.search],
  );

  if (loading) {
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

  if (!user) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
