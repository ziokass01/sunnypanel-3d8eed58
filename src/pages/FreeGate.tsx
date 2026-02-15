import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { postFunction } from "@/lib/functions";
import { fetchFreeConfig } from "@/features/free/free-config";
import { getFreeStartMeta, getOrCreateFingerprint, getOutToken, setOutToken } from "@/features/free/fingerprint";

type GateOk = { ok: true; claim_token: string };
type GateErr = { ok: false; msg: string };

function friendlyGateError(msg: string) {
  const m = String(msg || "").trim();
  if (!m) return "Xác thực không thành công. Vui lòng vượt link lại.";
  if (m === "Failed to fetch" || m.toLowerCase().includes("failed to fetch")) {
    return "Không gọi được backend (Failed to fetch). Gợi ý: (1) CORS allow origin cho domain hiện tại, (2) backend URL/project mismatch, (3) backend functions chưa deploy đúng môi trường.";
  }
  if (m === "REFERRER_REQUIRED") {
    return "REFERRER_REQUIRED: Bạn phải đi qua Link4M để referrer hợp lệ. Một số trình duyệt/shortlink có thể chặn referrer.";
  }
  if (m === "TOO_FAST" || m.startsWith("TOO_FAST") || m === "VERIFY_FAILED") {
    return "Xác thực không thành công. Vui lòng vượt link lại rồi thử lại.";
  }
  if (m === "BAD_REFERRER") return "Xác thực không thành công. Bạn chưa vượt link (Link4M).";
  if (m === "SESSION_EXPIRED") return "Phiên đã hết hạn. Vui lòng quay lại Get Key và làm lại.";
  if (m === "INVALID_SESSION") return "Thiếu/không hợp lệ session. Vui lòng quay lại Get Key và làm lại.";
  if (m === "DEVICE_MISMATCH") return "Thiết bị không khớp phiên. Vui lòng quay lại Get Key và làm lại.";
  if (m === "ALREADY_REVEALED") return "Bạn đã nhận key rồi. Nếu muốn lấy key mới, hãy quay lại Get Key.";
  return `Xác thực không thành công (${m}). Vui lòng quay lại và làm lại.`;
}

export function FreeGatePage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [cfgReturn, setCfgReturn] = useState<number>(10);
  const [status, setStatus] = useState<"working" | "error">("working");
  const [message, setMessage] = useState<string>("Đang xác thực…");

  const outToken = useMemo(() => {
    const t = (sp.get("t") || "").trim();
    if (t) return t;

    const fromPrimary = (getOutToken() || "").trim();
    if (fromPrimary) return fromPrimary;

    // Fallbacks for older keys / cross-browser flows
    try {
      const fb1 = (localStorage.getItem("free_out_token_v1") || "").trim();
      if (fb1) return fb1;
      const fb2 = (localStorage.getItem("free_out_token") || "").trim();
      if (fb2) return fb2;
      const fb3 = (localStorage.getItem("free_out_token") || "").trim();
      if (fb3) return fb3;
    } catch {
      // ignore
    }

    return "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.toString()]);

  useEffect(() => {
    let cancelled = false;
    fetchFreeConfig()
      .then((c) => {
        if (cancelled) return;
        const r = Math.max(10, Number(c.free_return_seconds ?? 10));
        setCfgReturn(r);
      })
      .catch(() => {
        // ignore; keep default
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function gateOnce() {
    const tok = outToken;
    if (!tok) {
      setStatus("error");
      setMessage("Thiếu session. Hãy quay lại trang Get Key và làm lại.");
      window.setTimeout(() => nav("/free", { replace: true }), 1200);
      return;
    }

    // Persist token for claim/reload flows
    setOutToken(tok);
    try {
      localStorage.setItem("free_out_token_v1", tok);
    } catch {
      // ignore
    }

    setStatus("working");
    setMessage("Đang xác thực…");

    try {
      const fp = getOrCreateFingerprint();
      const referrer = document.referrer || "";
      const current_url = window.location.href;
      const res = await postFunction<GateOk | GateErr>("/free-gate", {
        out_token: tok,
        fingerprint: fp,
        referrer,
        current_url,
      });

      if ((res as GateOk).ok) {
        const claim = (res as GateOk).claim_token;
        // Fallback for edge-cases where query params are stripped by a redirect/shortener.
        try {
          localStorage.setItem("free_claim_token", String(claim));
        } catch {
          // ignore
        }
        // IMPORTANT: use claim= (not c=) to avoid conflict with other params (e.g. c=E5).
        nav(`/free/claim?claim=${encodeURIComponent(claim)}`, { replace: true });
        return;
      }

      const msg = (res as GateErr).msg || "VERIFY_FAILED";
      setStatus("error");
      setMessage(friendlyGateError(msg));

      // fail-safe: never let user stuck here
      window.setTimeout(() => nav("/free", { replace: true }), Math.max(10, cfgReturn) * 1000);
    } catch (e: any) {
      setStatus("error");
      setMessage(friendlyGateError(e?.message ?? "VERIFY_FAILED"));
      window.setTimeout(() => nav("/free", { replace: true }), Math.max(10, cfgReturn) * 1000);
    }
  }

  useEffect(() => {
    const meta = getFreeStartMeta();
    if (!outToken || !meta?.startedAtMs) {
      setStatus("error");
      setMessage("Vượt link không thành công. Hãy quay lại trang Get Key và làm lại.");
      return;
    }

    // Gọi backend NGAY LẬP TỨC. Backend sẽ tự kiểm tra delay và đóng session nếu TOO_FAST.
    void gateOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  return (
    <div className="min-h-svh bg-background">
      <main className="mx-auto flex min-h-svh max-w-lg items-center p-4">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Đang kiểm tra…</CardTitle>
            <CardDescription>Hệ thống đang xác thực bước vượt link.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium">{message}</div>
              <div className="mt-1 text-muted-foreground">
                {status === "working" ? "Vui lòng không tắt trang." : "Bạn sẽ được đưa về trang Get Key."}
              </div>
            </div>

            {status === "error" ? (
              <Button className="w-full" variant="secondary" onClick={() => nav("/free", { replace: true })}>
                Quay lại Get Key
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
