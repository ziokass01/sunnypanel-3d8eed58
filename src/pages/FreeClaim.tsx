import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { postFunction } from "@/lib/functions";
import { fetchFreeConfig, type FreeConfig } from "@/features/free/free-config";
import { PublicInfo } from "@/features/free/PublicInfo";
import { TurnstileWidget } from "@/features/free/TurnstileWidget";
import { clearFreeFlowStorage, getOrCreateFingerprint, getOutToken, getSelectedKeyTypeCode } from "@/features/free/fingerprint";

type RevealOk = { ok: true; key: string; expires_at: string; key_type_label?: string | null };
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
  if (m === "UNAUTHORIZED") return "Xác thực không thành công. Vui lòng quay lại Get Key và vượt link lại.";
  if (m === "RATE_LIMIT") return "Bạn đã hết lượt nhận key trong 24 giờ. Vui lòng thử lại sau.";
  if (m === "SERVER_ERROR") return "Server bận. Vui lòng thử lại.";
  if (m === "CLAIM_EXPIRED") return "Phiên xác thực đã hết hạn. Vui lòng quay lại Get Key và làm lại.";
  if (m === "ALREADY_REVEALED") return "Key đã được phát. Hãy copy key bên dưới.";
  return `Xác thực không thành công (${m}).`;
}

type RevealedState = { key: string; expiresAt: string; label: string };

export function FreeClaimPage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();

  // IMPORTANT: do NOT memo claimToken from a URLSearchParams object reference
  // (some browsers / router transitions may keep object identity, causing stale empty token).
  const queryClaimRaw = (sp.get("claim") || sp.get("c") || "").trim();
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

  const [cfg, setCfg] = useState<FreeConfig | null>(null);
  const [turnToken, setTurnToken] = useState<string>("");

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

  const revealedStoreKey = useMemo(() => {
    if (!outToken) return "";
    return `free_revealed_v1:${outToken}`;
  }, [outToken]);

  useEffect(() => {
    if (!revealedStoreKey) return;
    try {
      const raw = sessionStorage.getItem(revealedStoreKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as RevealedState;
      if (parsed?.key && parsed?.expiresAt) setRevealed(parsed);
    } catch {
      // ignore
    }
  }, [revealedStoreKey]);

  useEffect(() => {
    let cancelled = false;
    fetchFreeConfig()
      .then((c) => {
        if (cancelled) return;
        setCfg(c);
      })
      .catch(() => {
        if (cancelled) return;
        setCfg(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const returnSeconds = useMemo(() => {
    const v = Number(cfg?.free_return_seconds ?? 10);
    return Math.max(10, isFinite(v) ? v : 10);
  }, [cfg?.free_return_seconds]);

  const selectedLabel = useMemo(() => {
    const code = getSelectedKeyTypeCode();
    const map = new Map((cfg?.key_types ?? []).map((k) => [k.code, k.label]));
    return map.get(code) ?? "Key free";
  }, [cfg]);

  const canVerify = useMemo(() => {
    if (revealed) return false;
    if (!claimToken) return false;
    if (!outToken) return false;
    if (!cfg?.turnstile_enabled) return true;
    return Boolean(turnToken);
  }, [claimToken, outToken, cfg?.turnstile_enabled, turnToken, revealed]);

  async function closeAndReturn() {
    try {
      if (outToken) {
        await postFunction("/free-close", { out_token: outToken });
      }
    } catch {
      // ignore
    } finally {
      // Clear local flow storage so reload cannot mint again
      clearFreeFlowStorage();
      try { localStorage.removeItem("free_claim_token"); } catch { /* ignore */ }
      if (revealedStoreKey) {
        try {
          sessionStorage.removeItem(revealedStoreKey);
        } catch {
          // ignore
        }
      }
      nav("/free", { replace: true });
    }
  }

  // Start countdown ONLY AFTER key is revealed (per requirement).
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
                <CardDescription>Nhấn Verify để hiện key. Sau khi có key, reload sẽ KHÔNG tạo key mới.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!claimToken ? (
              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium">Thiếu claim token</div>
                <div className="text-muted-foreground">Hãy quay lại /free và làm lại flow.</div>
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
                <div className="text-muted-foreground">Hãy quay lại /free và làm lại flow.</div>
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
                {cfg?.turnstile_enabled && cfg.turnstile_site_key ? (
                  <TurnstileWidget siteKey={cfg.turnstile_site_key} onToken={setTurnToken} />
                ) : null}

                <Button
                  className="w-full"
                  disabled={!canVerify || loading}
                  onClick={async () => {
                    if (!claimToken || !outToken) return;
                    setLoading(true);
                    setError(null);
                    try {
                      const fp = getOrCreateFingerprint();
                      const res = await postFunction<RevealOk | RevealErr>("/free-reveal", {
                        claim_token: claimToken,
                        out_token: outToken,
                        fingerprint: fp,
                        turnstile_token: cfg?.turnstile_enabled ? turnToken : null,
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
                      if (revealedStoreKey) {
                        try {
                          sessionStorage.setItem(revealedStoreKey, JSON.stringify(st));
                        } catch {
                          // ignore
                        }
                      }
                    } catch (e: any) {
                      setError(friendlyRevealError(e?.message ?? "UNAUTHORIZED"));
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  {loading ? "Đang xác minh…" : "Verify"}
                </Button>

                <PublicInfo note={cfg?.free_public_note} links={cfg?.free_public_links} />
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

                <PublicInfo note={cfg?.free_public_note} links={cfg?.free_public_links} />

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
