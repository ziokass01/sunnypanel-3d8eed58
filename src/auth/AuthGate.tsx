import { useMemo } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { getAdminLoginUrl } from "@/lib/appWorkspace";

type Props = {
  children: React.ReactNode;
};

/**
 * Ensures we only redirect to /login AFTER the initial session check resolves.
 */
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
    const host = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
    const isAppHost = host.startsWith("app.") || host === "app.mityangho.id.vn";

    if (isAppHost && typeof window !== "undefined") {
      const adminLoginUrl = getAdminLoginUrl(window.location.href);
      return (
        <div className="min-h-svh bg-background">
          <main className="mx-auto flex min-h-svh max-w-3xl items-center justify-center px-4 py-12">
            <div className="w-full rounded-3xl border bg-card p-6 shadow-sm">
              <div className="text-xl font-semibold">App domain chưa có phiên đăng nhập</div>
              <p className="mt-3 text-sm text-muted-foreground">
                Để tránh vòng lặp đăng nhập giữa app và admin, trang này sẽ không tự nhảy nữa.
                Bấm nút dưới để mở đăng nhập admin khi bạn muốn đồng bộ phiên.
              </p>
              <div className="mt-4 flex gap-3">
                <Button onClick={() => window.location.replace(adminLoginUrl)}>
                  Mở đăng nhập admin
                </Button>
              </div>
            </div>
          </main>
        </div>
      );
    }

    return <Navigate to={redirectTo} replace />;
  }
  return <>{children}</>;
}
