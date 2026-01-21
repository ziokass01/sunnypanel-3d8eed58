import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const next = params.get("next") || "/dashboard";

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate(next, { replace: true });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        setMode("login");
      }
    } catch (err: any) {
      setError(err?.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-svh bg-background">
      <main className="mx-auto flex min-h-svh max-w-md items-center p-4">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>{mode === "login" ? "Sign in" : "Create account"}</CardTitle>
            <CardDescription>
              {mode === "login"
                ? "Sign in to access the admin panel."
                : "Create an account, then an admin can assign you a role."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                />
              </div>

              {error ? <div className="text-sm text-destructive">{error}</div> : null}

              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Sign up"}
              </Button>

              <div className="text-center text-sm text-muted-foreground">
                {mode === "login" ? "No account?" : "Already have an account?"}{" "}
                <button
                  type="button"
                  className="text-primary underline underline-offset-4"
                  onClick={() => {
                    setError(null);
                    setMode((m) => (m === "login" ? "signup" : "login"));
                  }}
                >
                  {mode === "login" ? "Sign up" : "Sign in"}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
