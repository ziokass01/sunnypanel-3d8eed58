import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

function getReturnTo() {
  const params = new URLSearchParams(window.location.search);
  return params.get("return_to") || "sunnymod://auth/callback";
}

export function MobileGoogleStartPage() {
  const [error, setError] = useState<string | null>(null);
  const returnTo = useMemo(() => getReturnTo(), []);

  useEffect(() => {
    let mounted = true;
    async function start() {
      try {
        const redirectTo = `${window.location.origin}/mobile-auth/callback?return_to=${encodeURIComponent(returnTo)}`;
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo },
        });
        if (error) throw error;
        if (data?.url) window.location.href = data.url;
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message ?? "Không khởi động được Google login");
      }
    }
    start();
    return () => { mounted = false; };
  }, [returnTo]);

  return (
    <div className="min-h-svh bg-background">
      <main className="mx-auto flex min-h-svh max-w-3xl items-center justify-center px-4 py-10">
        <div className="panel-shell w-full max-w-xl p-8 text-center">
          <h1 className="text-3xl font-semibold text-slate-950">Đang mở Google login</h1>
          <p className="mt-4 text-base text-slate-500">Trình duyệt sẽ chuyển sang Google. Xong sẽ quay lại app SunnyMod.</p>
          {error ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div> : null}
        </div>
      </main>
    </div>
  );
}
