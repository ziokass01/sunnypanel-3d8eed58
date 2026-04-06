import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      setError(err?.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-svh bg-background">
      <main className="mx-auto flex min-h-svh max-w-6xl items-center justify-center px-4 py-12">
        <div className="panel-shell w-full max-w-3xl p-8 sm:p-10">
          <div className="mb-8 flex items-start gap-4">
            <img
              src="/android-chrome-512x512.png"
              alt="SUNNY"
              className="h-14 w-14 rounded-[1.2rem] object-cover shadow-[0_14px_26px_-18px_rgba(15,23,42,0.35)]"
            />
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950">Đăng nhập admin panel</h1>
              <p className="mt-3 max-w-xl text-lg leading-8 text-slate-500">
                Nhập email và mật khẩu để vào khu quản lý hệ thống, key và các cấu hình vận hành.
              </p>
            </div>
          </div>

          <form className="space-y-6" onSubmit={onSubmit}>
            <div className="space-y-3">
              <Label htmlFor="email" className="text-base font-semibold text-slate-800">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                placeholder="Nhập email"
              />
            </div>

            <div className="space-y-3">
              <Label htmlFor="password" className="text-base font-semibold text-slate-800">Mật khẩu</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                placeholder="Nhập mật khẩu"
              />
            </div>

            {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div> : null}

            <Button className="h-14 w-full text-lg" type="submit" disabled={loading}>
              {loading ? "Đang đăng nhập..." : "Đăng nhập"}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
