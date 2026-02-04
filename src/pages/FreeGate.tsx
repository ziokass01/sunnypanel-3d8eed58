import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { postFunction } from "@/lib/functions";
import { fetchFreeConfig } from "@/features/free/free-config";
import { getOrCreateFingerprint, getOutToken } from "@/features/free/fingerprint";

type GateOk = { ok: true; claim_token: string };
type GateTooFast = { ok: false; msg: "TOO_FAST"; wait_seconds: number };
type GateErr = { ok: false; msg: string; wait_seconds?: number };

export function FreeGatePage() {
  const nav = useNavigate();
  const [cfgReturn, setCfgReturn] = useState<number>(10);
  const [outboundUrl, setOutboundUrl] = useState<string>("");
  const [status, setStatus] = useState<"working" | "too_fast" | "error">("working");
  const [message, setMessage] = useState<string>("Đang xác thực…");

  const outToken = useMemo(() => getOutToken(), []);

  useEffect(() => {
    let cancelled = false;
    fetchFreeConfig()
      .then((c) => {
        if (cancelled) return;
        const r = Math.max(10, Number(c.free_return_seconds ?? 10));
        setCfgReturn(r);
        setOutboundUrl(String(c.free_outbound_url ?? ""));
      })
      .catch(() => {
        // ignore; keep default
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function tryGate() {
    const tok = outToken;
    if (!tok) {
      setStatus("error");
      setMessage("Thiếu session. Hãy quay lại trang Get Key và làm lại.");
      window.setTimeout(() => nav("/free", { replace: true }), 1500);
      return;
    }

    setStatus("working");
    setMessage("Đang xác thực…");

    try {
      const fp = getOrCreateFingerprint();
      const referrer = document.referrer || "";
      const res = await postFunction<GateOk | GateTooFast | GateErr>("/free-gate", {
        out_token: tok,
        fingerprint: fp,
        referrer,
      });

      if ((res as GateOk).ok) {
        const claim = (res as GateOk).claim_token;
        // Fallback for edge-cases where query params are stripped by a redirect/shortener.
        try {
          localStorage.setItem("free_claim_token", String(claim));
        } catch {
          // ignore
        }
        nav(`/free/claim?c=${encodeURIComponent(claim)}`, { replace: true });
        return;
      }

      const msg = (res as GateErr).msg || "GATE_FAILED";

      if (msg === "TOO_FAST" || msg.startsWith("TOO_FAST")) {
        setStatus("too_fast");
        setMessage(
          "Xác thực không thành công. Bạn vượt link quá nhanh hoặc chưa vượt đúng. Vui lòng quay lại và vượt link lại.",
        );
        return;
      }

      setStatus("error");
      setMessage(msg);

      // fail-safe: never let user stuck here
      window.setTimeout(() => nav("/free", { replace: true }), Math.max(10, cfgReturn) * 1000);
    } catch (e: any) {
      setStatus("error");
      setMessage(e?.message ?? "GATE_FAILED");
      window.setTimeout(() => nav("/free", { replace: true }), Math.max(10, cfgReturn) * 1000);
    }
  }

  useEffect(() => {
    void tryGate();
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
              <div className="mt-1 text-muted-foreground">Vui lòng không tắt trang.</div>
            </div>

            {status === "error" || status === "too_fast" ? (
              <Button className="w-full" variant="secondary" onClick={() => nav("/free", { replace: true })}>
                Quay lại Get Key
              </Button>
            ) : null}

            {status === "too_fast" && outboundUrl ? (
              <Button
                className="w-full"
                onClick={() => {
                  window.location.href = outboundUrl;
                }}
              >
                Mở lại link vượt
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
