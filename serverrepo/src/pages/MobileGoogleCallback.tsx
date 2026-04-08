import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

function buildDeepLink(session: any, returnTo: string) {
  const email = session?.user?.email || "";
  const userId = session?.user?.id || "";
  const accessToken = session?.access_token || "";
  const refreshToken = session?.refresh_token || "";
  const url = new URL(returnTo);
  url.searchParams.set("provider", "google");
  if (email) url.searchParams.set("email", email);
  if (userId) url.searchParams.set("user_id", userId);
  if (accessToken) url.searchParams.set("access_token", accessToken);
  if (refreshToken) url.searchParams.set("refresh_token", refreshToken);
  return url.toString();
}

export function MobileGoogleCallbackPage() {
  const [message, setMessage] = useState("Đang hoàn tất đăng nhập Google...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get("return_to") || "sunnymod://auth/callback";

    async function finishLogin() {
      let tries = 0;
      while (!cancelled && tries < 12) {
        tries += 1;
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          setError(error.message || "Lấy session thất bại");
          return;
        }
        const session = data.session;
        if (session?.access_token) {
          window.location.href = buildDeepLink(session, returnTo);
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
      if (!cancelled) {
        setError("Không lấy được session Google từ Supabase callback");
        setMessage("Bạn có thể quay lại app và thử đăng nhập Google lần nữa.");
      }
    }

    finishLogin();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-svh bg-background">
      <main className="mx-auto flex min-h-svh max-w-3xl items-center justify-center px-4 py-10">
        <div className="panel-shell w-full max-w-xl p-8 text-center">
          <h1 className="text-3xl font-semibold text-slate-950">Hoàn tất đăng nhập</h1>
          <p className="mt-4 text-base text-slate-500">{message}</p>
          {error ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div> : null}
        </div>
      </main>
    </div>
  );
}
