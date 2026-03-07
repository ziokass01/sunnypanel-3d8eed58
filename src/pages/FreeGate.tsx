import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { postFunction } from "@/lib/functions";
import { fetchFreeConfig } from "@/features/free/free-config";
import { FreeFlowSteps, markFreeAttemptFail } from "@/features/free/flow-ux";
import { readBundle, writeBundle } from "@/lib/freeFlow";
import { getFreeStartMeta, getOrCreateFingerprint, getOutToken, setFreeStartMeta, setOutToken } from "@/features/free/fingerprint";

type GateNextPass2 = { ok: true; next: "PASS2"; out_token: string; outbound_url: string; min_delay_seconds: number };
type GateNextClaim = { ok: true; next: "CLAIM"; claim_token: string; claim_url?: string | null };
type GateOk = GateNextPass2 | GateNextClaim;
type GateErr = { ok: false; msg: string; code?: string; detail?: any };

function friendlyGateError(msg: string) {
  const m = String(msg || "").trim();
  if (!m) return "Xác thực không thành công. Vui lòng vượt link lại.";
  if (m === "Failed to fetch" || m.toLowerCase().includes("failed to fetch")) {
    return "Không gọi được backend (Failed to fetch). Gợi ý: (1) CORS allow origin cho domain hiện tại, (2) backend URL/project mismatch, (3) backend functions chưa deploy đúng môi trường.";
  }
  if (m === "REFERRER_REQUIRED") {
    return "REFERRER_REQUIRED: Bạn cần đi qua Link4M hoặc trình duyệt đang chặn referrer. Hãy thử mở lại Link4M bằng cùng 1 trình duyệt.";
  }
  if (m === "TOO_FAST" || m.startsWith("TOO_FAST") || m === "VERIFY_FAILED") {
    return "Xác thực không thành công. Vui lòng vượt link lại rồi thử lại.";
  }
  if (m === "BAD_REFERRER") return "ADMIN đã bật xác minh cao cấp nên có thể bạn vượt link đúng nhưng vẫn lỗi thì hay liên hệ với ADMIN để được hỗ trợ.";
  if (m === "SESSION_EXPIRED") return "Phiên đã hết hạn❌. Vui lòng quay lại Get Key và làm lại.";
  if (m === "INVALID_SESSION") return "Thiếu/không hợp lệ session❌. Vui lòng quay lại Get Key và làm lại.";
  if (m === "DEVICE_MISMATCH") return "Thiết bị không khớp phiên❌. Vui lòng quay lại Get Key và làm lại.";
  if (m === "ALREADY_REVEALED") return "Bạn đã nhận key rồi❌. Nếu muốn lấy key mới, hãy quay lại Get Key.";
  if (m === "PASS2_NOT_READY") return "Key VIP chưa sẵn sàng❌. Vui lòng quay lại Get Key và làm lại.";
  if (m === "GATE_TOO_EARLY") return "Xác minh đã bị gián đoạn❌.Lý do bạn không vượt link. Phiên đã bị hủy, vui lòng quay lại Get Key🔑 và làm lại.";
  return `Xác thực không thành công (${m}). Vui lòng quay lại và làm lại.`;
}

function pad2(n: number) {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

export function FreeGatePage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [cfgReturn, setCfgReturn] = useState<number>(10);
  const [gateAntiBypassEnabled, setGateAntiBypassEnabled] = useState<boolean>(false);
  const [configReady, setConfigReady] = useState<boolean>(false);
  const [status, setStatus] = useState<"countdown" | "working" | "error">("working");
  const [message, setMessage] = useState<string>("Đang xác thực…");
  const [remaining, setRemaining] = useState<number>(0);

  const query = useMemo(() => sp.toString(), [sp]);
  const pass = useMemo(() => {
    const v = Number(sp.get("p") || 1);
    return v === 2 ? 2 : 1;
  }, [query]);

  const sidFromQuery = useMemo(() => (sp.get("sid") || "").trim(), [query]);
  const tFromQuery = useMemo(() => (sp.get("t") || "").trim(), [query]);

  const outToken = useMemo(() => {
    if (tFromQuery) return tFromQuery;
    try {
      if (pass === 2) {
        const pass2a = (localStorage.getItem("free_out_token_pass2") || "").trim();
        if (pass2a) return pass2a;
      }
    } catch {
      // ignore
    }
    const fromPrimary = (getOutToken() || "").trim();
    if (fromPrimary) return fromPrimary;
    try {
      const fb1 = (localStorage.getItem("free_out_token_v1") || "").trim();
      if (fb1) return fb1;
      const fb2 = (localStorage.getItem("free_out_token") || "").trim();
      if (fb2) return fb2;
      if (pass === 2) {
        const pass2b = (localStorage.getItem("free_out_token_pass2") || "").trim();
        if (pass2b) return pass2b;
      }
    } catch {
      // ignore
    }
    return "";
  }, [tFromQuery, query, pass]);

  const sessionId = useMemo(() => {
    if (sidFromQuery) return sidFromQuery;
    const b = readBundle();
    if (b?.session_id) return b.session_id;
    try {
      const s1 = (localStorage.getItem("free_session_id_v1") || "").trim();
      if (s1) return s1;
      const s2 = (localStorage.getItem("free_session_id") || "").trim();
      if (s2) return s2;
    } catch {
      // ignore
    }
    return "";
  }, [sidFromQuery, query]);

  useEffect(() => {
    let cancelled = false;
    fetchFreeConfig()
      .then((c) => {
        if (cancelled) return;
        const r = Math.max(10, Number(c.free_return_seconds ?? 10));
        setCfgReturn(r);
        setGateAntiBypassEnabled(Boolean((c as any).free_gate_antibypass_enabled ?? false));
        setConfigReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setConfigReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function gateOnce() {
    const tok = outToken;
    const sid = sessionId;

    if (!tok || !sid) {
      setStatus("error");
      setMessage("Thiếu phiên. Hãy quay lại trang Get Key🔑 và làm lại.");
      window.setTimeout(() => nav("/free", { replace: true }), 1200);
      return;
    }

    // Persist token/sid for reload flows
    try {
      setOutToken(tok);
      localStorage.setItem("free_out_token_v1", tok);
      localStorage.setItem("free_out_token", tok);
      localStorage.setItem("free_session_id_v1", sid);
      localStorage.setItem("free_session_id", sid);
    } catch {
      // ignore
    }

    setStatus("working");
    setMessage(pass === 2 ? "Đang xác thực key 🔑 VIP💰…" : "Đang xác thực ⏳…");

    try {
      const fp = getOrCreateFingerprint();
      const referrer = document.referrer || "";
      const current_url = window.location.href;

      const res = await postFunction<GateOk | GateErr>("/free-gate", {
        pass,
        session_id: sid,
        out_token: tok,
        fingerprint: fp,
        referrer,
        current_url,
      });

      if ((res as any).ok) {
        const ok = res as GateOk;

        if (ok.next === "PASS2") {
          // Transition to Pass2. Prefer the pre-issued pass2 token/outbound captured at /free-start
          // so Link4M pass2 can stay fixed and we do not depend on generating a new token here.
          let nextTok = String(ok.out_token || "").trim();
          try {
            if (!nextTok) nextTok = String(localStorage.getItem("free_out_token_pass2") || "").trim();
          } catch {
            // ignore
          }
          if (nextTok) {
            setOutToken(nextTok);
            writeBundle({ session_id: sid, out_token: nextTok });
            try {
              localStorage.setItem("free_out_token_v1", nextTok);
              localStorage.setItem("free_out_token", nextTok);
              localStorage.setItem("free_session_id_v1", sid);
              localStorage.setItem("free_session_id", sid);
            } catch {
              // ignore
            }
          }
          setFreeStartMeta({ startedAtMs: Date.now(), minDelaySeconds: Math.max(0, Number(ok.min_delay_seconds ?? 0)), pass: 2, passesRequired: 2 });
          let outbound = "";
          try {
            outbound = String(localStorage.getItem("free_outbound_url_pass2") || "").trim();
          } catch {
            // ignore
          }
          if (!outbound) {
            outbound = String(ok.outbound_url || "").trim();
          }
          if (!outbound) {
            setStatus("error");
            setMessage("OUTBOUND_URL_MISSING: Chưa cấu hình Link4M Key 🔑 VIP.");
            window.setTimeout(() => nav("/free", { replace: true }), 1500);
            return;
          }
          window.location.assign(outbound);
          return;
        }

        // CLAIM
        const claim = String(ok.claim_token || "").trim();
        try {
          localStorage.setItem("free_claim_token", claim);
        } catch {
          // ignore
        }
        writeBundle({ session_id: sid, out_token: tok, claim_token: claim });

        const base = String(ok.claim_url || `${window.location.origin}/free/claim`);
        const url = new URL(base, window.location.origin);
        url.search = "";
        url.searchParams.set("claim", claim);
        url.searchParams.set("sid", sid);
        url.searchParams.set("t", tok);
        if ((sp.get("debug") || "").trim() === "1") url.searchParams.set("debug", "1");

        nav(`${url.pathname}${url.search}${url.hash}`, { replace: true });
        return;
      }

      const err = res as GateErr;
      const msg = err.code || err.msg || "VERIFY_FAILED";
      markFreeAttemptFail(msg);
      setStatus("error");
      setMessage(friendlyGateError(msg));
      window.setTimeout(() => nav("/free", { replace: true }), Math.max(10, cfgReturn) * 1000);
    } catch (e: any) {
      markFreeAttemptFail(e?.code ?? e?.message ?? "VERIFY_FAILED");
      setStatus("error");
      setMessage(friendlyGateError(e?.code ?? e?.message ?? "VERIFY_FAILED"));
      window.setTimeout(() => nav("/free", { replace: true }), Math.max(10, cfgReturn) * 1000);
    }
  }

  useEffect(() => {
    const sid = sessionId;
    const tok = outToken;

    if (!sid || !tok) {
      setStatus("error");
      setMessage("Vượt link không thành công. Hãy quay lại trang Get Key🔑 và làm lại.");
      return;
    }

    if (!configReady) return;

    // Global anti-bypass mode: do NOT wait locally on /free/gate.
    // Entering gate too early must fail on backend immediately for all passes.
    if (pass === 2 || gateAntiBypassEnabled) {
      setStatus("working");
      setMessage(pass === 2 ? "Đang xác thực key 🔑 VIP💰…" : "Đang xác thực key ⏳…");
      void gateOnce();
      return;
    }

    // Legacy UX when anti-bypass gate timing is disabled: pass1 may still wait locally.
    const meta = getFreeStartMeta();
    const startedAtMs = Number(meta?.startedAtMs ?? 0);
    const minDelay = Math.max(0, Number(meta?.minDelaySeconds ?? 0));

    const waitUntil = startedAtMs > 0 ? startedAtMs + minDelay * 1000 : 0;
    const tick = () => {
      const r = waitUntil > 0 ? Math.max(0, Math.ceil((waitUntil - Date.now()) / 1000)) : 0;
      setRemaining(r);
      if (r <= 0) {
        setStatus("working");
        void gateOnce();
        return false;
      }
      setStatus("countdown");
      setMessage("Đang đợi key 🔑…");
      return true;
    };

    if (!tick()) return;
    const id = window.setInterval(() => {
      if (!tick()) window.clearInterval(id);
    }, 250);

    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configReady, gateAntiBypassEnabled, pass, sessionId, outToken]);

  return (
    <div className="min-h-svh bg-background">
      <main className="mx-auto flex min-h-svh max-w-xl items-center p-4">
        <Card className="w-full overflow-hidden border shadow-sm">
          <CardHeader className="space-y-4 border-b bg-gradient-to-br from-primary/10 via-background to-background pb-5">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-xl">{pass === 2 ? "Đang xác thực key 🔑 VIP💰" : "Đang xác thực key 🔑"}</CardTitle>
                <CardDescription>Hệ thống đang kiểm tra bước vượt link trước khi chuyển sang bước nhận key.</CardDescription>
              </div>
              <Badge variant="outline" className="rounded-full">Bước 3 / 4</Badge>
            </div>
            <FreeFlowSteps current={3} />
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="rounded-2xl border bg-gradient-to-br from-background to-muted/30 p-4 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border bg-primary/10 text-lg font-semibold text-primary">
                  {status === "error" ? "!" : status === "countdown" ? pad2(remaining) : "✓"}
                </div>
                <div className="space-y-1">
                  <div className="text-base font-semibold text-foreground">{message}</div>
                  <div className="text-sm leading-6 text-muted-foreground">
                    {status === "working"
                      ? "Vui lòng giữ nguyên trình duyệt hiện tại. Hệ thống sẽ tự kiểm tra phiên, thiết bị và trạng thái gate."
                      : status === "countdown"
                        ? "Hệ thống đang đợi đúng mốc thời gian trước khi hoàn tất xác thực. Đừng đổi tab hoặc đổi trình duyệt trong lúc này."
                        : "Phiên hiện tại không còn hợp lệ hoặc đã bị hủy. Bạn nên quay lại bước đầu để tạo phiên mới sạch hơn."}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border bg-background/70 p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Trạng thái</div>
                <div className="mt-1 text-sm font-semibold text-foreground">{status === "error" ? "Thất bại" : status === "countdown" ? "Đang chờ" : "Đang xử lý"}</div>
              </div>
              <div className="rounded-2xl border bg-background/70 p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Loại phiên</div>
                <div className="mt-1 text-sm font-semibold text-foreground">{pass === 2 ? "VIP / Pass 2" : "Normal / Pass 1"}</div>
              </div>
              <div className="rounded-2xl border bg-background/70 p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Tiếp theo</div>
                <div className="mt-1 text-sm font-semibold text-foreground">{status === "error" ? "Quay lại Get Key" : "Tự chuyển bước"}</div>
              </div>
            </div>

            {status === "error" ? (
              <Button className="h-12 w-full rounded-2xl text-base font-semibold" variant="secondary" onClick={() => nav("/free", { replace: true })}>
                Quay lại Get Key
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
