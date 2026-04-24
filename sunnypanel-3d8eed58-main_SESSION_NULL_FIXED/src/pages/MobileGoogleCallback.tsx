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

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function sessionFromHash() {
  const hash = window.location.hash?.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  if (!hash) return null;
  const hashParams = new URLSearchParams(hash);
  const accessToken = hashParams.get("access_token") || "";
  const refreshToken = hashParams.get("refresh_token") || "";
  if (!accessToken || !refreshToken) return null;

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
  return data.session ?? null;
}

async function sessionFromCode(params: URLSearchParams) {
  const code = params.get("code") || "";
  if (!code) return null;
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
  return data.session ?? null;
}

export function MobileGoogleCallbackPage() {
  const [message, setMessage] = useState("Đang hoàn tất đăng nhập Google...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get("return_to") || "sunnymod://auth/callback";

    async function redirectWhenReady(session: any) {
      if (cancelled) return true;
      if (session?.access_token) {
        window.location.href = buildDeepLink(session, returnTo);
        return true;
      }
      return false;
    }

    async function finishLogin() {
      setError(null);

      // Supabase OAuth có thể trả token ở hash (#access_token=...) hoặc code ở query (?code=...).
      // Bản cũ chỉ gọi getSession(), nên trên vài trình duyệt session chưa kịp hydrate và bị null.
      try {
        const hashSession = await sessionFromHash();
        if (await redirectWhenReady(hashSession)) return;
      } catch (err: any) {
        if (!cancelled) setMessage("Đang thử hoàn tất phiên Google bằng phương án dự phòng...");
      }

      try {
        const codeSession = await sessionFromCode(params);
        if (await redirectWhenReady(codeSession)) return;
      } catch (err: any) {
        if (!cancelled) setMessage("Đang chờ Supabase xác nhận phiên đăng nhập...");
      }

      let lastError = "";
      for (let tries = 0; !cancelled && tries < 20; tries += 1) {
        const { data, error } = await supabase.auth.getSession();
        if (error) lastError = error.message || "Lấy session thất bại";
        if (await redirectWhenReady(data.session)) return;
        await sleep(300);
      }

      if (!cancelled) {
        setError(lastError || "Không lấy được session Google từ Supabase callback");
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
