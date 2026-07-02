import { useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function FreeLink4MBridgePage() {
  const nav = useNavigate();
  const [params] = useSearchParams();

  const bridge = useMemo(() => {
    const apiToken = String(params.get("api") ?? "").trim();
    const targetValue = String(params.get("url") ?? "").trim();
    if (!apiToken || !targetValue) return null;

    try {
      const target = new URL(targetValue);
      const gateToken = String(target.searchParams.get("t") ?? "").trim();
      const pass = Number(target.searchParams.get("p") || 1) === 2 ? 2 : 1;

      if (target.origin !== window.location.origin) return null;
      if (target.pathname !== "/free/gate") return null;
      if (!gateToken.startsWith("gt_") || gateToken.length < 20) return null;

      target.searchParams.set("p", String(pass));

      // Link4M browser quicklink mode. This endpoint receives the unique gate URL
      // in the user's browser instead of asking Supabase Edge to call api-shorten/v2.
      // The gate token remains single-use and is still verified by free-gate after
      // the user finishes the Link4M flow.
      const outbound = new URL("https://link4m.co/st");
      outbound.searchParams.set("api", apiToken);
      outbound.searchParams.set("url", target.toString());

      return {
        targetUrl: target.toString(),
        outboundUrl: outbound.toString(),
        pass,
      };
    } catch {
      return null;
    }
  }, [params]);

  useEffect(() => {
    if (!bridge) return;
    const id = window.setTimeout(() => {
      window.location.replace(bridge.outboundUrl);
    }, 450);
    return () => window.clearTimeout(id);
  }, [bridge]);

  if (!bridge) {
    return (
      <div className="min-h-svh bg-background p-4">
        <main className="mx-auto flex min-h-[80svh] max-w-lg items-center">
          <Card className="w-full overflow-hidden border shadow-sm">
            <CardHeader className="border-b bg-gradient-to-br from-primary/10 via-background to-background">
              <CardTitle>Phiên Link4M không hợp lệ</CardTitle>
              <CardDescription>Thiếu API token hoặc gate token hợp lệ. Không mở thẳng gate.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  <div className="text-sm leading-6">Hãy quay lại trang Get Key để tạo một phiên mới.</div>
                </div>
              </div>
              <Button className="w-full" variant="destructive" onClick={() => nav("/free", { replace: true })}>
                Quay lại Get Key
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-background p-4">
      <main className="mx-auto flex min-h-[80svh] max-w-lg items-center">
        <Card className="w-full overflow-hidden border shadow-sm">
          <CardHeader className="border-b bg-gradient-to-br from-primary/10 via-background to-background">
            <CardTitle>Đang mở Link4M</CardTitle>
            <CardDescription>
              Gate token của phiên này được đưa vào Link4M. Mỗi token chỉ dùng để phát một key và vẫn phải qua bước xác thực.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="rounded-2xl border bg-muted/30 p-4">
              <div className="flex items-start gap-3">
                <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />
                <div className="text-sm leading-6">
                  Đang chuyển sang Link4M bằng quicklink chính thức. Nếu trình duyệt không tự chuyển, bấm nút bên dưới.
                </div>
              </div>
            </div>

            <a
              href={bridge.outboundUrl}
              className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-primary px-4 text-base font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Qua Link4M
            </a>

            <Button className="w-full" variant="outline" onClick={() => nav("/free", { replace: true })}>
              Hủy và làm lại
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
