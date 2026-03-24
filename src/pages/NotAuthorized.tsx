import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/auth/AuthProvider";

export function NotAuthorizedPage() {
  const { signOut } = useAuth();

  return (
    <div className="min-h-svh bg-background">
      <main className="mx-auto flex min-h-svh max-w-md items-center p-4">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Not authorized</CardTitle>
            <CardDescription>
              Tài khoản đã đăng nhập nhưng chưa có quyền vào panel. Hãy kiểm tra role trong <code>public.user_roles</code>
              hoặc <code>app_metadata.panel_role</code> / <code>app_metadata.role</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                void signOut();
              }}
            >
              Sign out
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
