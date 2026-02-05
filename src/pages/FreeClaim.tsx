import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { postFunction } from "@/lib/functions";
import { fetchFreeConfig, type FreeConfig } from "@/features/free/free-config";
import { PublicInfo } from "@/features/free/PublicInfo";
import { TurnstileWidget } from "@/features/free/TurnstileWidget";
import { clearFreeFlowStorage, getOrCreateFingerprint, getOutToken, getSelectedKeyTypeCode, setOutToken } from "@/features/free/fingerprint";

type RevealOk = { ok: true; key: string; expires_at: string; key_type_label?: string | null };
type RevealErr = { ok: false; msg: string };

type RevealedCache = { key: string; expiresAt: string; label: string };

function cacheKeyForClaimToken(claimToken: string) {
  return `fk_revealed_v1:${claimToken}`;
}

function isValidTurnstileSiteKey(key: string | null | undefined) {
  const k = String(key ?? "").trim();
  // Cloudflare Turnstile site keys typically start with "0x". Treat anything else as invalid/dummy.
  return k.length >= 16 && k.startsWith("0x");
}

export function FreeClaimPage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const claimToken = useMemo(() => {
    // Compat: prefer `c`, fallback to `claim`, then local cache.
    const primary = sp.get("c");
    if (primary && primary.trim()) return primary.trim();
    const legacy = sp.get("claim");
    if (!primary && legacy && legacy.trim()) return legacy.trim();
    // Some redirect/shortener flows can strip query params; keep a fallback token.
    if (!primary && !legacy) {
      try {
        return localStorage.getItem("free_claim_token") ?? "";
      } catch {
        return "";
      }
    }
    return "";
  }, [sp]);

  const [cfg, setCfg] = useState<FreeConfig | null>(null);
  const [turnToken, setTurnToken] = useState<string>("");
  const [turnstileError, setTurnstileError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ key: string; expiresAt: string; label: string } | null>(null);

  const outToken = useMemo(() => {
    const queryOut = (sp.get("o") ?? "").trim();
    if (queryOut) {
      setOutToken(queryOut);
      return queryOut;
    }
    return getOutToken();
  }, [sp]);

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
    // Restore revealed key after reload so we don't re-issue keys.
    if (!claimToken) return;
    try {
      const raw = sessionStorage.getItem(cacheKeyForClaimToken(claimToken));
      if (!raw) return;
      const parsed = JSON.parse(raw) as RevealedCache;
      if (parsed?.key && parsed?.expiresAt) setRevealed(parsed);
    } catch {
      // ignore
    }
  }, [claimToken]);

  const clearRevealedCache = () => {
    if (!claimToken) return;
    try {
      sessionStorage.removeItem(cacheKeyForClaimToken(claimToken));
    } catch {
      // ignore
    }
  };

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
    if (!claimToken) return false;
    if (!outToken) return false;
    const turnstileRequired =
      Boolean(cfg?.turnstile_enabled) &&
      isValidTurnstileSiteKey(cfg?.turnstile_site_key) &&
      !turnstileError;
    if (!turnstileRequired) return true;
    return Boolean(turnToken);
  }, [claimToken, outToken, cfg?.turnstile_enabled, cfg?.turnstile_site_key, turnToken, turnstileError]);

  async function closeAndReturn() {
    try {
      if (outToken) {
        await postFunction("/free-close", { out_token: outToken });
      }
    } catch {
      // ignore
    } finally {
      clearFreeFlowStorage();
      nav("/free", { replace: true });
    }
  }

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
                <CardDescription>Key chỉ hiển thị 1 lần duy nhất.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!claimToken ? (
              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium">Phiên không hợp lệ</div>
                <div className="text-muted-foreground">Thiếu claim token. Hãy quay lại /free và làm lại flow.</div>
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
                {cfg?.turnstile_enabled && isValidTurnstileSiteKey(cfg?.turnstile_site_key) ? (
                  <TurnstileWidget
                    siteKey={cfg.turnstile_site_key!}
                    onToken={setTurnToken}
                    onError={(msg) => {
                      // Treat Turnstile failures as disabled to avoid permanently blocking Verify.
                      setTurnstileError(msg || "Turnstile error");
                    }}
                  />
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
                        turnstile_token:
                          cfg?.turnstile_enabled && isValidTurnstileSiteKey(cfg?.turnstile_site_key) && !turnstileError
                            ? turnToken
                            : null,
                      });

                      if (!res.ok) {
                        const msg = (res as RevealErr).msg || "Reveal failed";
                        // If backend refuses (already revealed/invalid), guide user safely.
                        if (msg === "REVEAL_IN_PROGRESS") {
                          setError("Hệ thống đang xử lý. Vui lòng chờ vài giây rồi thử lại.");
                        } else if (msg === "UNAUTHORIZED" || msg === "ALREADY_REVEALED") {
                          setError("Key đã được reveal hoặc session không hợp lệ. Vui lòng quay lại và làm lại flow.");
                        } else {
                          setError(msg);
                        }
                        return;
                      }
                      try {
                        localStorage.removeItem("free_claim_token");
                      } catch {
                        // ignore
                      }
                      const next: RevealedCache = {
                        key: (res as RevealOk).key,
                        expiresAt: (res as RevealOk).expires_at,
                        label: (res as RevealOk).key_type_label || selectedLabel,
                      };
                      setRevealed(next);
                      try {
                        sessionStorage.setItem(cacheKeyForClaimToken(claimToken), JSON.stringify(next));
                      } catch {
                        // ignore
                      }
                    } catch (e: any) {
                      setError(e?.message ?? "Reveal failed");
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

                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={async () => {
                    clearRevealedCache();
                    try {
                      localStorage.removeItem("free_claim_token");
                    } catch {
                      // ignore
                    }
                    await closeAndReturn();
                  }}
                >
                  Xóa key
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
