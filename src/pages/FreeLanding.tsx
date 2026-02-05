import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchFreeConfig, type FreeConfig } from "@/features/free/free-config";
import { PublicInfo } from "@/features/free/PublicInfo";
import { postFunction } from "@/lib/functions";
import {
  getFreeTestMode,
  getOrCreateFingerprint,
  setFreeStartMeta,
  setOutToken,
  setSelectedKeyTypeCode,
} from "@/features/free/fingerprint";
import { supabase } from "@/integrations/supabase/client";

type StartOk = { ok: true; out_token: string; outbound_url: string; min_delay_seconds: number };
type StartErr = { ok: false; msg: string; code?: string };
type LastFreeKey = {
  key: string;
  key_type: string;
  created_at: string;
  expires_at: string;
  ip_hash?: string | null;
  session_id?: string | null;
};

const LAST_FREE_KEY_STORAGE = "lastFreeKey";

function formatVnDateTime(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

function shortHash(v?: string | null, n = 10) {
  const x = String(v ?? "").trim();
  if (!x) return "-";
  return x.length > n ? `${x.slice(0, n)}…` : x;
}

export function FreeLandingPage() {
  const [cfg, setCfg] = useState<FreeConfig | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [lastFreeKey, setLastFreeKey] = useState<LastFreeKey | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_FREE_KEY_STORAGE);
      if (raw) {
        const parsed = JSON.parse(raw) as LastFreeKey;
        if (parsed?.key) setLastFreeKey(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

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

  const debugMode = useMemo(() => new URLSearchParams(window.location.search).get("debug") === "1", []);

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
                  const testMode = getFreeTestMode();
                  const session = testMode ? await supabase.auth.getSession() : null;
                  if (testMode && !session?.data?.session?.access_token) {
                    setErr("Test mode yêu cầu đăng nhập admin.");
                    return;
                  }
                  const res = await postFunction<StartOk | StartErr>(
                    "/free-start",
                    {
                      key_type_code: selected,
                      fingerprint: fp,
                      test_mode: testMode,
                    },
                    {
                      authToken: testMode ? session?.data?.session?.access_token ?? null : null,
                      headers: {
                        "x-fp": fp,
                      },
                    },
                  );

                  if (!res.ok) {
                    setErr((res as StartErr).msg || "Start failed");
                    return;
                  }

                  setOutToken(res.out_token);
                  setFreeStartMeta({
                    startedAtMs: Date.now(),
                    minDelaySeconds: Math.max(5, Number(res.min_delay_seconds ?? 25)),
                  });
                  try { localStorage.removeItem("free_claim_token"); } catch { /* ignore */ }
                  setSelectedKeyTypeCode(selected);

                  // Redirect to Link4M outbound
                  window.location.href = res.outbound_url;
                } catch (e: any) {
                  const code = String(e?.code ?? "").trim();
                  if (code === "SERVER_RATE_LIMIT_MISCONFIG") {
                    setErr(
                      debugMode
                        ? "Server đang cấu hình thiếu, vui lòng thử lại sau. (Owner: chạy migration FREE_RATE_LIMIT fix trong Supabase SQL Editor.)"
                        : "Server đang cấu hình thiếu, vui lòng thử lại sau.",
                    );
                  } else {
                    setErr(e?.message ?? "Start failed");
                  }
                } finally {
                  setLoading(false);
                }
              }}
            >
              {loading ? "Đang chuyển hướng…" : "Get Key"}
            </Button>

            {lastFreeKey ? (
              <div className="rounded-md border p-3 space-y-2">
                <div className="text-sm font-semibold">Key vừa nhận</div>
                <div className="break-all font-mono text-sm">{lastFreeKey.key}</div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(lastFreeKey.key);
                    } catch {
                      // ignore
                    }
                  }}
                >
                  Copy key
                </Button>
                <div className="text-xs text-muted-foreground">Loại key: {lastFreeKey.key_type || "-"}</div>
                <div className="text-xs text-muted-foreground">Tạo lúc: {formatVnDateTime(lastFreeKey.created_at)}</div>
                <div className="text-xs text-muted-foreground">Hết hạn: {formatVnDateTime(lastFreeKey.expires_at)}</div>
                <div className="text-xs text-muted-foreground">IP hash: {shortHash(lastFreeKey.ip_hash, 12)}</div>
                <div className="text-xs text-muted-foreground">Session: {shortHash(lastFreeKey.session_id, 12)}</div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
