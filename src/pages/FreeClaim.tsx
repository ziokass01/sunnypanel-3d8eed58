import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { postFunction } from "@/lib/functions";
import {
  clearFreeFlowStorage,
  getOrCreateFingerprint,
  getOutToken,
  getSelectedKeyTypeCode,
} from "@/features/free/fingerprint";

type RevealOk = {
  ok: true;
  key: string;
  expires_at: string;
  key_type_label?: string | null;
  key_type_code?: string | null;
  created_at?: string | null;
  session_id?: string | null;
  ip_hash?: string | null;
};
type RevealErr = { ok: false; msg: string };

function isValidClaimToken(tok: string) {
  const t = String(tok || "").trim();
  if (t.length < 16 || t.length > 512) return false;
  // base64url-ish (we generate with btoa url-safe)
  return /^[A-Za-z0-9_-]+$/.test(t);
}

function friendlyRevealError(msg: string) {
  const m = String(msg || "").trim();
  if (!m) return "Xác thực không thành công. Vui lòng làm lại.";
  if (m === "Failed to fetch" || m.toLowerCase().includes("failed to fetch")) {
    return "Không gọi được backend (Failed to fetch). Gợi ý: (1) CORS allow origin cho domain hiện tại, (2) backend URL/project mismatch, (3) backend functions chưa deploy đúng môi trường.";
  }
  if (m === "UNAUTHORIZED") return "Xác thực không thành công. Vui lòng quay lại Get Key và vượt link lại.";
  if (m === "RATE_LIMIT") return "Bạn đã hết lượt nhận key trong 24 giờ. Vui lòng thử lại sau.";
  if (m === "SERVER_ERROR") return "Server bận. Vui lòng thử lại.";
  if (m === "CLAIM_EXPIRED") return "Phiên xác thực đã hết hạn. Vui lòng quay lại Get Key và làm lại.";
  if (m === "SESSION_BIND_MISMATCH") return "Phiên không khớp thiết bị/IP. Vui lòng bắt đầu lại từ trang Get Key.";
  if (m === "BLOCKED") return "Thiết bị hoặc IP của bạn đã bị chặn.";
  if (m === "ALREADY_REVEALED") return "Key đã được phát. Hãy copy key bên dưới.";
  return `Xác thực không thành công (${m}).`;
}

type RevealedState = { key: string; expiresAt: string; label: string };
const LAST_FREE_KEY_STORAGE = "lastFreeKey";

export function FreeClaimPage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();

  // IMPORTANT: do NOT memo claimToken from a URLSearchParams object reference
  // (some browsers / router transitions may keep object identity, causing stale empty token).
  const queryClaimRaw = (sp.get("claim") || sp.get("c") || sp.get("token") || "").trim();
  const claimToken = (() => {
    if (isValidClaimToken(queryClaimRaw)) return queryClaimRaw;
    try {
      const fb = (localStorage.getItem("free_claim_token") ?? "").trim();
      return isValidClaimToken(fb) ? fb : "";
    } catch {
      return "";
    }
  })();

  const outToken = (getOutToken() || "").trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<RevealedState | null>(null);

  // Persist query claim token as a fallback (some redirect/shortener flows can strip params).
  useEffect(() => {
    if (!isValidClaimToken(queryClaimRaw)) return;
    try {
      localStorage.setItem("free_claim_token", queryClaimRaw);
    } catch {
      // ignore
    }
  }, [queryClaimRaw]);




  useEffect(() => {
    // noindex for claim page
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  const returnSeconds = 10;

  const selectedLabel = useMemo(() => {
    const code = (getSelectedKeyTypeCode() || "").trim();
    return code ? `Key free (${code})` : "Key free";
  }, []);

  const canVerify = useMemo(() => {
    if (revealed) return false;
    if (!claimToken) return false;
    if (!outToken) return false;
    return !loading;
  }, [claimToken, outToken, revealed, loading]);

  async function revealOnce() {
    if (!claimToken || !outToken) return;
    if (loading || revealed) return;

    setLoading(true);
    setError(null);
    try {
      const fp = getOrCreateFingerprint();
      const res = await postFunction<RevealOk | RevealErr>("/free-reveal", {
        claim_token: claimToken,
        out_token: outToken,
        fingerprint: fp,
        turnstile_token: null,
      });

      if (!res.ok) {
        setError(friendlyRevealError((res as RevealErr).msg || "UNAUTHORIZED"));
        return;
      }

      const st: RevealedState = {
        key: (res as RevealOk).key,
        expiresAt: (res as RevealOk).expires_at,
        label: (res as RevealOk).key_type_label || selectedLabel,
      };

      setRevealed(st);

      try {
        const okRes = res as RevealOk;
        const payload = {
          key: okRes.key,
          key_type: okRes.key_type_label || okRes.key_type_code || selectedLabel,
          created_at: okRes.created_at || new Date().toISOString(),
          expires_at: okRes.expires_at,
          ip_hash: okRes.ip_hash || null,
          session_id: okRes.session_id || null,
        };
        localStorage.setItem(LAST_FREE_KEY_STORAGE, JSON.stringify(payload));
      } catch {
        // ignore
      }
    } catch (e: any) {
      setError(friendlyRevealError(e?.message ?? "UNAUTHORIZED"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!claimToken || !outToken) return;
    if (revealed) return;
    void revealOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimToken, outToken]);

  async function closeAndReturn() {
    try {
      if (outToken) {
        await postFunction("/free-close", { out_token: outToken });
      }
    } catch {
      // ignore
    } finally {
      clearFreeFlowStorage();
      try {
        localStorage.removeItem("free_claim_token");
      } catch {
        /* ignore */
      }
      nav("/free", { replace: true });
    }
  }

  // Auto return ONLY AFTER key is revealed.
  useEffect(() => {
    if (!revealed) return;
    const t = window.setTimeout(() => {
      void closeAndReturn();
    }, returnSeconds * 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, returnSeconds]);

  return (
    <div className="min-h-svh bg-background">
      <main className="mx-auto flex min-h-svh max-w-lg items-center p-4">
        <Card className="w-full">
          <CardHeader>
            <div className="flex items-center gap-3">
              <img src="/brand.png" alt="SUNNY" className="h-10 w-10 rounded-xl" />
              <div>
                <CardTitle>Nhận key</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!claimToken ? (
              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium"> Xác thực không thành công hoặc lỗi </div>
                <div className="text-muted-foreground">Hãy quay lại trang Getkey và làm lại.</div>
                <div className="mt-3">
                  <Button variant="secondary" className="w-full" onClick={() => nav("/free", { replace: true })}>
                    Quay lại Get Key
                  </Button>
                </div>
              </div>
            ) : null}

            {claimToken && !outToken ? (
              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium">Thiếu session</div>
                <div className="text-muted-foreground">Hãy quay lại trang Getkey và làm lại.</div>
                <div className="mt-3">
                  <Button variant="secondary" className="w-full" onClick={() => nav("/free", { replace: true })}>
                    Quay lại Get Key
                  </Button>
                </div>
              </div>
            ) : null}

            {error ? <div className="text-sm text-destructive">{error}</div> : null}

            {!revealed ? (
              <div className="space-y-3">

                <Button
                  className="w-full"
                  disabled={!canVerify || loading}
                  onClick={revealOnce}
                >
                  {loading ? "Đang xác minh…" : "Xác minh"}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-md border p-3">
                  <div className="text-sm text-muted-foreground">{revealed.label}</div>
                  <div className="mt-1 break-all text-lg font-semibold">{revealed.key}</div>
                  <div className="mt-2 text-xs text-muted-foreground">Expires: {revealed.expiresAt}</div>
                </div>

                <Button
                  className="w-full"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(revealed.key);
                    } catch {
                      // ignore
                    }
                    await closeAndReturn();
                  }}
                >
                  Copy
                </Button>

                <div className="text-center text-xs text-muted-foreground">
                  Tự động quay lại sau {returnSeconds}s nếu không bấm Copy.
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
