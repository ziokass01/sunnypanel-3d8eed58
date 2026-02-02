import { useEffect } from "react";
import { getFunctionsBaseUrl } from "@/lib/functions";

export function FreeGatePage() {
  useEffect(() => {
    // Server-side flow happens in backend function; we just bounce there.
    window.location.href = `${getFunctionsBaseUrl()}/free-gate`;
  }, []);

  return (
    <div className="min-h-svh bg-background">
      <main className="mx-auto flex min-h-svh max-w-md items-center p-4">
        <div className="w-full rounded-lg border p-6 text-center">
          <div className="text-lg font-semibold">Đang xác thực…</div>
          <div className="mt-2 text-sm text-muted-foreground">Vui lòng đợi trong giây lát.</div>
        </div>
      </main>
    </div>
  );
}
