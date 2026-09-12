import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/auth/AuthProvider";
import { usePanelRole } from "@/hooks/use-panel-role";
import { NotAuthorizedPage } from "@/pages/NotAuthorized";

type Props = {
  children: React.ReactNode;
};

export function AdminRoute({ children }: Props) {
  const { user } = useAuth();
  const { loading, isAdmin } = usePanelRole();

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

  if (!user) return null;
  if (!isAdmin) return <NotAuthorizedPage />;

  return <>{children}</>;
}
