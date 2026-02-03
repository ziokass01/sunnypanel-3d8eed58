import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { postFunction } from "@/lib/functions";
import { fetchFreeConfig, type FreeConfig } from "@/features/free/free-config";
import { TurnstileWidget } from "@/features/free/TurnstileWidget";
import { clearFreeFlowStorage, getOrCreateFingerprint, getOutToken, getSelectedKeyTypeCode } from "@/features/free/fingerprint";

type RevealOk = { ok: true; key: string; expires_at: string; key_type_label?: string | null };
type RevealErr = { ok: false; msg: string };

export function FreeClaimPage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const claimToken = sp.get("c") ?? "";

  const [cfg, setCfg] = useState<FreeConfig | null>(null);
  const [turnToken, setTurnToken] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ key: string; expiresAt: string; label: string } | null>(null);

  const outToken = useMemo(() => getOutToken(), []);

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
    if (!claimToken) return false;
    if (!outToken) return false;
    if (!cfg?.turnstile_enabled) return true;
    return Boolean(turnToken);
  }, [claimToken, outToken, cfg?.turnstile_enabled, turnToken]);

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

  // Safety: never let user stuck on claim page
  useEffect(() => {
    if (revealed) return;
    const t = window.setTimeout(() => {
      if (!revealed) void closeAndReturn();
    }, returnSeconds * 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnSeconds]);

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
            <CardTitle>Nhận key</CardTitle>
            <CardDescription>Key chỉ hiển thị 1 lần duy nhất.</CardDescription>
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
                        setError((res as RevealErr).msg || "Reveal failed");
                        return;
                      }
                      setRevealed({
                        key: (res as RevealOk).key,
                        expiresAt: (res as RevealOk).expires_at,
                        label: (res as RevealOk).key_type_label || selectedLabel,
                      });
                    } catch (e: any) {
                      setError(e?.message ?? "Reveal failed");
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  {loading ? "Đang xác minh…" : "Nhận key"}
                </Button>

                <div className="text-center text-xs text-muted-foreground">Tự động quay lại sau {returnSeconds}s.</div>
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
                  Copy & quay lại
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
