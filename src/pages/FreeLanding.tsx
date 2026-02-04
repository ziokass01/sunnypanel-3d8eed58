import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchFreeConfig, type FreeConfig } from "@/features/free/free-config";
import { PublicInfo } from "@/features/free/PublicInfo";
import { postFunction } from "@/lib/functions";
import { getOrCreateFingerprint, setOutToken, setSelectedKeyTypeCode } from "@/features/free/fingerprint";

type StartOk = { ok: true; out_token: string; outbound_url: string; min_delay_seconds: number };
type StartErr = { ok: false; msg: string };

export function FreeLandingPage() {
  const [cfg, setCfg] = useState<FreeConfig | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchFreeConfig()
      .then((c) => {
        if (cancelled) return;
        setCfg(c);
        const first = c.key_types?.[0]?.code ?? "";
        setSelected(first);
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

  const isClosed = cfg ? !cfg.free_enabled : false;
  const hasTypes = Boolean(cfg?.key_types?.length);
  const canGet = Boolean(cfg?.free_outbound_url) && hasTypes && !isClosed && !loading && !missingText;

  return (
    <div className="min-h-svh bg-background">
      <main className="mx-auto flex min-h-svh max-w-lg items-center p-4">
        <Card className="w-full">
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <img src="/brand.png" alt="SUNNY" className="h-10 w-10 rounded-xl" />
              <div>
                <CardTitle>Get key free</CardTitle>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {err ? <div className="text-sm text-destructive">{err}</div> : null}

            {missingText ? (
              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium">Missing configuration</div>
                <div className="text-muted-foreground">{missingText}</div>
              </div>
            ) : null}

            {cfg && isClosed ? (
              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium">Tạm đóng</div>
                <div className="text-muted-foreground">{cfg.free_disabled_message}</div>
              </div>
            ) : null}

            <PublicInfo note={cfg?.free_public_note} links={cfg?.free_public_links} />

            <div className="space-y-2">
              <div className="text-sm font-medium">Chọn loại key</div>
              <Select value={selected} onValueChange={setSelected} disabled={!hasTypes || isClosed || loading}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={hasTypes ? "Chọn…" : "Chưa có loại key"} />
                </SelectTrigger>
                <SelectContent>
                  {(cfg?.key_types ?? []).map((k) => (
                    <SelectItem key={k.code} value={k.code}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full"
              size="lg"
              disabled={!canGet}
              onClick={async () => {
                if (!cfg?.free_outbound_url) return;
                if (!selected) return;

                setLoading(true);
                setErr(null);
                try {
                  const fp = getOrCreateFingerprint();
                  const res = await postFunction<StartOk | StartErr>("/free-start", {
                    key_type_code: selected,
                    fingerprint: fp,
                  });

                  if (!res.ok) {
                    setErr((res as StartErr).msg || "Start failed");
                    return;
                  }

                  setOutToken(res.out_token);
                  setSelectedKeyTypeCode(selected);

                  // Redirect to Link4M outbound
                  window.location.href = res.outbound_url;
                } catch (e: any) {
                  setErr(e?.message ?? "Start failed");
                } finally {
                  setLoading(false);
                }
              }}
            >
              {loading ? "Đang chuyển hướng…" : "Get Key"}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
