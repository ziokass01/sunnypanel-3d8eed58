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
              Your account is signed in, but it doesn’t have permission to access the admin panel.
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
