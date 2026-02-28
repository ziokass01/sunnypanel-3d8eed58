import { useEffect, useMemo } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

type Props = {
  children: React.ReactNode;
};

/**
 * Ensures we only redirect to /login AFTER the initial session check resolves.
 * Also shows a single "session expired" toast (no spam) when a protected page redirects.
 */
export function AuthGate({ children }: Props) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { toast } = useToast();

  const redirectTo = useMemo(
    () => `/login?next=${encodeURIComponent(location.pathname + location.search)}`,
    [location.pathname, location.search],
  );

  useEffect(() => {
    if (loading) return;
    if (user) return;

    // Avoid toast spam when multiple components/routes trigger redirects.
    if (typeof window === "undefined") return;
    const key = "sp_auth_redirect_toast_ts";
    const now = Date.now();
    const last = Number(window.sessionStorage.getItem(key) ?? "0");
    if (!Number.isFinite(last) || now - last > 8000) {
      window.sessionStorage.setItem(key, String(now));
      toast({
        title: "Phiên đăng nhập hết hạn",
        description: "Vui lòng đăng nhập lại.",
        variant: "destructive",
      });
    }
  }, [loading, user, toast]);

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

  if (!user) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}
