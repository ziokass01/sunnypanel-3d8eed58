import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchFreeConfig, type FreeConfig } from "@/features/free/free-config";

export function FreeLandingPage() {
  const [cfg, setCfg] = useState<FreeConfig | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchFreeConfig()
      .then((c) => {
        if (cancelled) return;
        setCfg(c);
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(e?.message ?? "Failed to load config");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const missingText = useMemo(() => {
    const m = cfg?.missing ?? [];
    return m.length ? m.join(", ") : null;
  }, [cfg]);

  const fallbackOutbound = `${window.location.origin}/free/gate`;
  const outbound = (cfg?.free_outbound_url ?? fallbackOutbound) || fallbackOutbound;
  const usingFallback = !cfg?.free_outbound_url;
  const canGo = Boolean(outbound);

  return (
    <div className="min-h-svh bg-background">
      <main className="mx-auto flex min-h-svh max-w-lg items-center p-4">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Get 1-day key</CardTitle>
            <CardDescription>Hoàn tất bước redirect để nhận key miễn phí 24h.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {err ? <div className="text-sm text-destructive">{err}</div> : null}
            {missingText ? (
              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium">Missing configuration</div>
                <div className="text-muted-foreground">{missingText}</div>
              </div>
            ) : null}

            <Button
              className="w-full"
              size="lg"
              disabled={!canGo}
              onClick={() => {
                if (!outbound) return;
                window.location.href = outbound;
              }}
            >
              Get 1-day key
            </Button>

            <Button
              className="w-full"
              variant="secondary"
              onClick={() => {
                window.location.href = "/admin/free-keys";
              }}
            >
              Mở Panel Admin
            </Button>

            {cfg?.show_test_redirect_button ? (
              <div className="space-y-3">
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={() => {
                    if (!outbound) return;
                    window.open(outbound, "_blank", "noopener,noreferrer");
                  }}
                  disabled={loading && !cfg}
                >
                  Test Redirect (temporary)
                </Button>

                <div className="rounded-md border p-3 text-sm">
                  <div className="mb-2 font-medium">Debug status</div>
                  <div className="space-y-1 text-muted-foreground">
                    <div>
                      <span className="font-medium text-foreground">FREE_OUTBOUND_URL:</span>{" "}
                      <span className="break-all">{outbound ?? "(missing)"}</span>
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Destination:</span>{" "}
                      <span className="break-all">{cfg?.destination_gate_url ?? ""}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
