import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { postFunction } from "@/lib/functions";
import { fetchFreeConfig } from "@/features/free/free-config";
import { TurnstileWidget } from "@/features/free/TurnstileWidget";

type RevealOk = { ok: true; key: string; expires_at: string };
type RevealErr = { ok: false; msg: string };

export function FreeClaimPage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const claimToken = sp.get("c") ?? "";

  const [turnstile, setTurnstile] = useState<{ enabled: boolean; siteKey: string | null } | null>(null);
  const [turnToken, setTurnToken] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ key: string; expiresAt: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchFreeConfig()
      .then((cfg) => {
        if (cancelled) return;
        setTurnstile({ enabled: cfg.turnstile_enabled, siteKey: cfg.turnstile_site_key });
      })
      .catch(() => {
        if (cancelled) return;
        setTurnstile({ enabled: false, siteKey: null });
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

  const canVerify = useMemo(() => {
    if (!claimToken) return false;
    if (!turnstile?.enabled) return true;
    return Boolean(turnToken);
  }, [claimToken, turnstile?.enabled, turnToken]);

  async function closeAndReturn() {
    try {
      await postFunction("/free-close", {});
    } catch {
      // ignore
    }
    nav("/free", { replace: true });
  }

  useEffect(() => {
    if (!revealed) return;
    const t = window.setTimeout(() => {
      void closeAndReturn();
    }, 5000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  return (
    <div className="min-h-svh bg-background">
      <main className="mx-auto flex min-h-svh max-w-lg items-center p-4">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Receive key</CardTitle>
            <CardDescription>Key sẽ chỉ hiển thị 1 lần duy nhất.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!claimToken ? (
              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium">Missing claim token</div>
                <div className="text-muted-foreground">Hãy quay lại /free và làm lại flow.</div>
              </div>
            ) : null}

            {error ? <div className="text-sm text-destructive">{error}</div> : null}

            {!revealed ? (
              <div className="space-y-3">
                {turnstile?.enabled && turnstile.siteKey ? (
                  <TurnstileWidget siteKey={turnstile.siteKey} onToken={setTurnToken} />
                ) : null}

                <Button
                  className="w-full"
                  disabled={!canVerify || loading}
                  onClick={async () => {
                    if (!claimToken) return;
                    setLoading(true);
                    setError(null);
                    try {
                      const res = await postFunction<RevealOk | RevealErr>("/free-reveal", {
                        claim_token: claimToken,
                        turnstile_token: turnstile?.enabled ? turnToken : null,
                      });

                      if (!res.ok) {
                        setError((res as RevealErr).msg || "Reveal failed");
                        return;
                      }
                      setRevealed({ key: res.key, expiresAt: res.expires_at });
                    } catch (e: any) {
                      setError(e?.message ?? "Reveal failed");
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  {loading ? "Verifying…" : "Verify lần cuối"}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-md border p-3">
                  <div className="text-sm text-muted-foreground">Your 1-day key</div>
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
                  Tự động quay lại sau 5s nếu không copy.
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
