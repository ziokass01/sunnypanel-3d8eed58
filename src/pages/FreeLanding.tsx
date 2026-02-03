import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchFreeConfig, type FreeConfig } from "@/features/free/free-config";
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
          <CardHeader>
            <CardTitle>Get key free</CardTitle>
            <CardDescription>
              Chọn loại key → bấm Get Key → vượt Link4M → nhận key. (Không có quyền nào khác)
            </CardDescription>
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

              <div className="text-xs text-muted-foreground">
                {cfg?.free_outbound_url ? (
                  <>Bạn sẽ được chuyển sang Link4M để vượt link.</>
                ) : (
                  <>Admin chưa cấu hình Link4M outbound URL.</>
                )}
              </div>
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

            <div className="text-center text-xs text-muted-foreground">
              Nếu lỗi/treo, hãy quay lại trang này và bấm Get Key lại.
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
