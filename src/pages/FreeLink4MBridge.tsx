import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Link4MWindow extends Window {
  link4m_url?: string;
  link4m_api_token?: string;
  link4m_advert?: number;
  link4m_domains?: string[];
  link4m_exclude_domains?: string[];
}

const LINK4M_HOST_RE = /(^|\.)link4m\.(co|com)$/i;

export function FreeLink4MBridgePage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const targetRef = useRef<HTMLAnchorElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("Đang kiểm tra phiên Link4M…");
  const [attempt, setAttempt] = useState(0);

  const bridge = useMemo(() => {
    const apiToken = String(params.get("api") ?? "").trim();
    const targetValue = String(params.get("url") ?? "").trim();
    if (!apiToken || !targetValue) return null;
    try {
      const target = new URL(targetValue);
      const token = String(target.searchParams.get("t") ?? "").trim();
      const pass = Number(target.searchParams.get("p") || 1) === 2 ? 2 : 1;
      if (target.origin !== window.location.origin) return null;
      if (target.pathname !== "/free/gate") return null;
      if (!token.startsWith("gt_") || token.length < 20) return null;
      target.searchParams.set("p", String(pass));
      return { apiToken, targetUrl: target.toString() };
    } catch {
      return null;
    }
  }, [params]);

  useEffect(() => {
    if (!bridge) {
      setStatus("error");
      setMessage("Thiếu phiên Link4M hợp lệ. Hãy quay lại Get Key và làm lại.");
      return;
    }

    let cancelled = false;
    let pollId = 0;
    let timeoutId = 0;
    const originalHref = bridge.targetUrl;
    const scriptId = "sunny-link4m-full-script";

    setStatus("loading");
    setMessage("Đang tạo link rút gọn Link4M…");
    document.getElementById(scriptId)?.remove();

    const w = window as Link4MWindow;
    w.link4m_url = "https://link4m.co/";
    w.link4m_api_token = bridge.apiToken;
    w.link4m_advert = 2;
    w.link4m_domains = [new URL(bridge.targetUrl).hostname];
    delete w.link4m_exclude_domains;

    const inspect = () => {
      if (cancelled || !targetRef.current) return;
      const candidate = String(targetRef.current.href || "").trim();
      if (!candidate || candidate === originalHref) return;
      try {
        const parsed = new URL(candidate);
        if (!LINK4M_HOST_RE.test(parsed.hostname)) return;
        setStatus("ready");
        setMessage("Link4M đã sẵn sàng. Bấm nút bên dưới để bắt đầu vượt link.");
        window.clearInterval(pollId);
        window.clearTimeout(timeoutId);
      } catch {
        // Wait for Link4M's official script to rewrite the visible anchor.
      }
    };

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://link4m.co/js/full-script.js";
    script.async = true;
    script.referrerPolicy = "no-referrer-when-downgrade";
    script.onload = inspect;
    script.onerror = () => {
      if (!cancelled) {
        setStatus("error");
        setMessage("Không tải được Full Page Script của Link4M.");
      }
    };
    document.body.appendChild(script);

    pollId = window.setInterval(inspect, 200);
    timeoutId = window.setTimeout(() => {
      window.clearInterval(pollId);
      if (!cancelled) {
        setStatus("error");
        setMessage("Link4M không tạo được link trong thời gian cho phép.");
      }
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      window.clearTimeout(timeoutId);
      script.remove();
    };
  }, [bridge, attempt]);

  return (
    <div className="min-h-svh bg-background p-4">
      <main className="mx-auto flex min-h-[80svh] max-w-lg items-center">
        <Card className="w-full overflow-hidden border shadow-sm">
          <CardHeader className="border-b bg-gradient-to-br from-primary/10 via-background to-background">
            <CardTitle>Tạo link Link4M</CardTitle>
            <CardDescription>Link được tạo bằng Full Page Script chính thức. Trang này không có nút đi thẳng tới gate hoặc nhận key.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className={`rounded-2xl border p-4 ${status === "error" ? "border-destructive/40 bg-destructive/5" : "bg-muted/30"}`}>
              <div className="flex items-start gap-3">
                {status === "loading" ? <Loader2 className="mt-0.5 h-5 w-5 animate-spin" /> : null}
                {status === "error" ? <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" /> : null}
                <div className="text-sm leading-6">{message}</div>
              </div>
            </div>

            <a
              ref={targetRef}
              href={bridge?.targetUrl || "#"}
              onClick={(event) => {
                if (status !== "ready") event.preventDefault();
              }}
              aria-disabled={status !== "ready"}
              className={`inline-flex h-12 w-full items-center justify-center rounded-2xl px-4 text-base font-semibold transition ${
                status === "ready"
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "cursor-not-allowed bg-muted text-muted-foreground"
              }`}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {status === "ready" ? "Qua Link4M" : "Đang tạo link…"}
            </a>

            {status === "error" ? (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>Thử lại</Button>
                <Button variant="destructive" onClick={() => nav("/free", { replace: true })}>Làm lại</Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
