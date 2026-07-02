import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { clearLink4MClientBridge, readLink4MClientBridge, saveLink4MClientBridge } from "@/features/free/link4m-client-bridge";

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
  const payload = useMemo(() => {
    const stored = readLink4MClientBridge();
    if (stored) return stored;
    try {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const encoded = String(params.get("payload") ?? "").trim();
      if (!encoded) return null;
      const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
      const binary = atob(padded);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const parsed = JSON.parse(new TextDecoder().decode(bytes));
      if (!saveLink4MClientBridge(parsed)) return null;
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      return readLink4MClientBridge();
    } catch {
      return null;
    }
  }, []);
  const targetRef = useRef<HTMLAnchorElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(payload ? "loading" : "error");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!payload) return;

    let cancelled = false;
    let pollId = 0;
    let timeoutId = 0;
    const target = new URL(payload.target_url);
    const originalHref = target.toString();
    const scriptId = "sunny-link4m-full-script";

    setStatus("loading");
    document.getElementById(scriptId)?.remove();

    const w = window as Link4MWindow;
    w.link4m_url = payload.base_url || "https://link4m.co/";
    w.link4m_api_token = payload.api_token;
    w.link4m_advert = payload.advert || 2;
    w.link4m_domains = [target.hostname];
    delete w.link4m_exclude_domains;

    const inspect = () => {
      if (cancelled || !targetRef.current) return;
      const candidate = String(targetRef.current.href || "").trim();
      if (!candidate || candidate === originalHref) return;
      try {
        const parsed = new URL(candidate);
        if (!LINK4M_HOST_RE.test(parsed.hostname)) return;
        setStatus("ready");
        window.clearInterval(pollId);
        window.clearTimeout(timeoutId);
      } catch {
        // keep waiting for Link4M to rewrite the visible link
      }
    };

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = payload.script_url || "https://link4m.co/js/full-script.js";
    script.async = true;
    script.referrerPolicy = "no-referrer-when-downgrade";
    script.onload = inspect;
    script.onerror = () => {
      if (!cancelled) setStatus("error");
    };
    document.body.appendChild(script);

    pollId = window.setInterval(inspect, 200);
    timeoutId = window.setTimeout(() => {
      window.clearInterval(pollId);
      if (!cancelled) setStatus("error");
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      window.clearTimeout(timeoutId);
      script.remove();
    };
  }, [payload, attempt]);

  if (!payload) {
    return (
      <div className="min-h-svh bg-background p-4">
        <main className="mx-auto flex min-h-[80svh] max-w-lg items-center">
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Không có phiên Link4M hợp lệ</CardTitle>
              <CardDescription>Phiên rút gọn đã thiếu hoặc hết hạn. Hãy quay lại Get Key và tạo phiên mới.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => nav("/free", { replace: true })}>Quay lại Get Key</Button>
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
            <CardTitle>Tạo link Link4M</CardTitle>
            <CardDescription>Trang này dùng Full Page Script chính thức của Link4M để tạo link vượt. Không có đường dẫn đi thẳng tới bước nhận key.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            {status === "loading" && (
              <div className="flex items-center gap-3 rounded-2xl border bg-muted/30 p-4">
                <Loader2 className="h-5 w-5 animate-spin" />
                <div>
                  <div className="font-medium">Đang chuẩn bị Link4M…</div>
                  <div className="text-sm text-muted-foreground">Vui lòng chờ nút chuyển sang trạng thái sẵn sàng.</div>
                </div>
              </div>
            )}

            {status === "error" && (
              <div className="space-y-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
                <div className="flex items-start gap-2 text-destructive">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <div className="font-medium">Không tải được Full Page Script của Link4M</div>
                    <div className="text-sm">Hệ thống không mở thẳng gate. Hãy thử lại hoặc quay về tạo phiên mới.</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>Thử lại</Button>
                  <Button variant="destructive" onClick={() => {
                    clearLink4MClientBridge();
                    nav("/free", { replace: true });
                  }}>Làm lại</Button>
                </div>
              </div>
            )}

            <a
              ref={targetRef}
              id="sunny-link4m-target"
              href={payload.target_url}
              onClick={(event) => {
                if (status !== "ready") event.preventDefault();
                else clearLink4MClientBridge();
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
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
