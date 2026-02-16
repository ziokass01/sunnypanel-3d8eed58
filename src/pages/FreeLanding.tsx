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

type StartOk = {
  ok: true;
  out_token: string;
  outbound_url: string;
  gate_url: string;
  claim_base_url: string;
  min_delay_seconds: number;
};
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
      .catch((e: any) => {
        if (cancelled) return;
        const code = String(e?.code ?? "").trim();
        if (code === "FREE_NOT_READY") {
          setErr("FREE_NOT_READY: Backend FREE chưa sẵn sàng (thiếu secrets hoặc thiếu bảng cấu hình). Owner cần set SUPABASE_SERVICE_ROLE_KEY + chạy migrations FREE.");
          return;
        }
        if (code === "FETCH_FAILED") {
          setErr(
            "Failed to fetch: Không gọi được backend. Gợi ý: (1) CORS allow origin cho domain hiện tại, (2) backend URL/project mismatch, (3) backend functions chưa deploy đúng môi trường.",
          );
          return;
        }
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
  // free_outbound_url can be empty in settings; backend will fall back to default Link4M.
  const canGet = hasTypes && !isClosed && !loading && !missingText;

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
                <div className="font-medium">Cần apply migration FREE</div>
                <div className="text-muted-foreground">
                  Hệ thống FREE chưa đủ object trong database. Vui lòng báo owner chạy migration FREE mới nhất. ({missingText})
                </div>
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
                if (!selected) return;

                setLoading(true);
                setErr(null);
                try {
                  const fp = getOrCreateFingerprint();
                  // IMPORTANT: test_mode is ONLY for explicit debug flows.
                  // If someone accidentally left it enabled in localStorage, it would bypass Link4M.
                  const testMode = debugMode && getFreeTestMode();
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
                      // Only send when debugMode explicitly enabled
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
                    const r = res as StartErr;
                    if (r.code === "SERVER_RATE_LIMIT_MISCONFIG") {
                      setErr("Server FREE chưa đủ migration. Vui lòng báo owner chạy migration FREE mới nhất.");
                    } else {
                      setErr(r.msg || "Start failed");
                    }
                    return;
                  }

                  setOutToken(res.out_token);
                  setFreeStartMeta({
                    startedAtMs: Date.now(),
                    minDelaySeconds: Math.max(5, Number(res.min_delay_seconds ?? 25)),
                  });
                  try {
                    // Keep backward compat, but ensure current key is used by FreeGate fallbacks.
                    localStorage.setItem("free_out_token_v1", String(res.out_token));
                    localStorage.setItem("free_out_token", String(res.out_token));
                    localStorage.setItem("free_started_at_ms", String(Date.now()));
                    localStorage.setItem("free_min_delay_seconds", String(Math.max(5, Number(res.min_delay_seconds ?? 25))));
                    localStorage.setItem("free_key_type_code", String(selected));
                  } catch {
                    // ignore
                  }
                  try {
                    localStorage.removeItem("free_claim_token");
                  } catch {
                    /* ignore */
                  }
                  setSelectedKeyTypeCode(selected);

                  // Redirect to Link4M outbound
                  window.location.href = res.outbound_url;
                } catch (e: any) {
                  const code = String(e?.code ?? "").trim();
                  if (code === "SERVER_RATE_LIMIT_MISCONFIG") {
                    setErr(
                      "SERVER_RATE_LIMIT_MISCONFIG: Database thiếu RPC/bảng rate-limit cho FREE. Owner cần chạy migration FREE (đặc biệt: 20260206150000_free_schema_runtime_fix.sql + các migration free_rate_limit_*).",
                    );
                    return;
                  }
                  if (code === "FREE_NOT_READY") {
                    setErr("FREE_NOT_READY: Backend FREE chưa sẵn sàng (thiếu secrets hoặc thiếu bảng cấu hình). Owner cần kiểm tra secrets + migration.");
                    return;
                  }
                  if (code === "UNAUTHORIZED") {
                    setErr("Bạn chưa đăng nhập/không có quyền. Vui lòng đăng nhập admin rồi thử lại.");
                    return;
                  }
                  setErr(e?.message ?? "Start failed");
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
