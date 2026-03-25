import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchFreeConfig, type FreeConfig } from "@/features/free/free-config";
import { FreeNotice } from "@/features/free/FreeNotice";
import { FreeDownloadCards } from "@/features/free/FreeDownloadCards";
import { PublicInfo } from "@/features/free/PublicInfo";
import { FreeDeviceHistoryCard, FreeFlowSteps, markFreeAttempt, markFreeAttemptFail, readFreeDeviceHistory, syncFreeNextEligibleAt } from "@/features/free/flow-ux";
import { getFunction, postFunction } from "@/lib/functions";
import { clearBundle, writeBundle } from "@/lib/freeFlow";
import {
  getFreeTestMode,
  getOrCreateFingerprint,
  setFreeStartMeta,
  setOutToken,
  setSelectedKeyTypeCode,
} from "@/features/free/fingerprint";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import ZaloGetKeyBubble from "../components/ZaloGetKeyBubble";

type StartOk = {
  ok: true;
  out_token: string;
  out_token_pass2?: string | null;
  session_id?: string;
  outbound_url: string;
  outbound_url_pass2?: string | null;
  gate_url: string;
  gate_url_pass2?: string | null;
  claim_base_url: string;
  min_delay_seconds: number;
  min_delay_seconds_pass2?: number;
  passes_required?: number;
};
type StartErr = { ok: false; msg: string; code?: string; detail?: any };
type LastFreeKey = {
  key: string;
  key_type: string;
  created_at: string;
  expires_at: string;
  ip_hash?: string | null;
  session_id?: string | null;
};

const LAST_FREE_KEY_STORAGE = "lastFreeKey";

type ResetKeySnapshot = {
  ok: boolean;
  key?: string;
  created_at?: string | null;
  expires_at?: string | null;
};

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
  const [deviceHistory, setDeviceHistory] = useState(() => readFreeDeviceHistory());
  const [showClosedDialog, setShowClosedDialog] = useState(false);

  const isPendingSessionError = useMemo(() => {
    const message = String(err ?? "").toLowerCase();
    return (
      message.includes("quá nhiều phiên")
      || message.includes("đang chờ xác thực")
      || message.includes("pending")
      || message.includes("session_pending_limit")
    );
  }, [err]);

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
    setDeviceHistory(readFreeDeviceHistory());
  }, []);

  useEffect(() => {
    if (!lastFreeKey?.key) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await postFunction<ResetKeySnapshot>("/reset-key", {
          action: "check",
          key: String(lastFreeKey.key).trim().toUpperCase(),
        });
        if (cancelled || !res?.ok || !res.key) return;

        const expiresAt = res.expires_at ?? lastFreeKey.expires_at ?? null;
        const createdAt = res.created_at ?? lastFreeKey.created_at ?? null;
        const next = {
          ...lastFreeKey,
          key: res.key,
          created_at: createdAt,
          expires_at: expiresAt,
        };

        setLastFreeKey(next);
        try {
          localStorage.setItem(LAST_FREE_KEY_STORAGE, JSON.stringify(next));
        } catch {
          // ignore
        }
        syncFreeNextEligibleAt(expiresAt);
        setDeviceHistory(readFreeDeviceHistory());
      } catch {
        // ignore sync failures, keep cached data
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lastFreeKey?.key]);

  useEffect(() => {
    if (!err || !isPendingSessionError) return;
    toast({
      variant: "destructive",
      title: (
        <span className="inline-flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Cảnh báo xác thực
        </span>
      ),
      description: "Thiết bị đang có phiên xác thực chờ xử lý. Hãy hoàn tất tab trước hoặc chờ vài phút rồi thử lại.",
    });
  }, [err, isPendingSessionError]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(fetchFreeConfig({ fingerprint: getOrCreateFingerprint() }))
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

  const debugMode = useMemo(() => import.meta.env.DEV && new URLSearchParams(window.location.search).get("debug") === "1", []);

  const isClosed = cfg ? !cfg.free_enabled : false;
  const hasTypes = Boolean(cfg?.key_types?.length);
  // free_outbound_url can be empty in settings; backend will fall back to default Link4M.
  const canGet = hasTypes && !loading && !missingText;

  return (
    <>
      <div className="min-h-svh bg-background">
        <main className="mx-auto flex min-h-svh max-w-xl items-center p-4">
        <Card className="w-full">
          <CardHeader className="space-y-4 border-b bg-gradient-to-br from-primary/10 via-background to-background pb-5">
            <div className="flex items-center gap-3">
              <img src="/brand.png" alt="SUNNY" className="h-11 w-11 rounded-2xl border bg-background p-1 shadow-sm" />
              <div className="space-y-1">
                <CardTitle className="text-xl">Get Key 🔑</CardTitle>
                <p className="text-sm text-muted-foreground">Chào mừng mọi người đến với trang web của Sunny Mod.</p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-2xl border bg-background/80 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Flow</div>
                <div className="mt-1 text-sm font-semibold">4 bước rõ ràng</div>
              </div>
              <div className="rounded-2xl border bg-background/80 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Thiết bị</div>
                <div className="mt-1 text-sm font-semibold">Giữ đúng một phiên</div>
              </div>
              <div className="rounded-2xl border bg-background/80 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Trạng thái</div>
                <div className="mt-1 text-sm font-semibold">Tự chuyển bước</div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <FreeFlowSteps current={1} />

            <FreeNotice notice={cfg?.free_notice} />

            <div className="rounded-2xl border bg-gradient-to-br from-muted/50 to-background p-4 text-sm text-muted-foreground shadow-sm">
              <div className="font-semibold text-foreground">Cách dùng nhanh</div>
              <div className="mt-1 leading-6">Chọn loại key phù hợp, bấm <span className="font-medium text-foreground">Get Key</span>, vượt Link4M rồi hệ thống sẽ tự dẫn bạn qua bước xác thực và nhận key.</div>
            </div>

            {err && !isPendingSessionError ? (
              <div className="space-y-2">
                <div className="text-sm text-destructive">{err}</div>
              </div>
            ) : null}

            {missingText ? (
              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium">Cần apply migration FREE</div>
                <div className="text-muted-foreground">
                  Hệ thống FREE chưa đủ object trong database. Vui lòng báo owner chạy migration FREE mới nhất. ({missingText})
                </div>
              </div>
            ) : null}

            <PublicInfo note={cfg?.free_public_note} links={cfg?.free_public_links} />

            <FreeDeviceHistoryCard history={deviceHistory} remainingTodayServer={cfg?.free_quota_remaining_today ?? null} lastKeyExpiresAt={lastFreeKey?.expires_at ?? null} />

            <div className="space-y-2 rounded-2xl border bg-background/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">Chọn loại key</div>
                <Badge variant="outline" className="rounded-full">Bước 1</Badge>
              </div>
              <Select value={selected} onValueChange={setSelected} disabled={!hasTypes || loading}>
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
              className="h-12 w-full rounded-2xl text-base font-semibold shadow-sm"
              size="lg"
              disabled={!canGet}
              onClick={async () => {
                if (isClosed) {
                  setShowClosedDialog(true);
                  return;
                }

                if (!selected) return;

                // Start a new flow atomically: clear old bundle first (avoid mixing tokens across sessions)
                clearBundle();
                markFreeAttempt();
                setDeviceHistory(readFreeDeviceHistory());

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
                    if (r.code === "OUTBOUND_URL_TEMPLATE_INVALID") {
                      markFreeAttemptFail(r.code);
                      setDeviceHistory(readFreeDeviceHistory());
                      setErr(`${r.code}: ${r.msg}`);
                      return;
                    }
                    if (r.code === "SERVER_RATE_LIMIT_MISCONFIG") {
                      markFreeAttemptFail(r.code);
                      setDeviceHistory(readFreeDeviceHistory());
                      setErr("Server FREE chưa đủ migration. Vui lòng báo owner chạy migration FREE mới nhất.");
                    } else if (r.code === "SESSION_PENDING_LIMIT") {
                      markFreeAttemptFail(r.code);
                      setDeviceHistory(readFreeDeviceHistory());
                      setErr("Thiết bị này đang có quá nhiều phiên đang chờ xác thực. Hãy hoàn tất hoặc chờ vài phút rồi thử lại.");
                    } else {
                      markFreeAttemptFail(r.code || r.msg || "START_FAILED");
                      setDeviceHistory(readFreeDeviceHistory());
                      setErr(r.msg || "Start failed");
                    }
                    return;
                  }

                  setOutToken(res.out_token);

                  // Persist bundle as the single source of truth for this flow (session_id + out_token)
                  try {
                    const sid = String((res as any).session_id ?? "").trim();
                    if (sid) {
                      writeBundle({ session_id: sid, out_token: String(res.out_token) });
                    }
                  } catch {
                    // ignore
                  }

                  setFreeStartMeta({
                    startedAtMs: Date.now(),
                    minDelaySeconds: Math.max(0, Number(res.min_delay_seconds ?? 0)),
                  });
                  try {
                    // Keep backward compat, but ensure current key is used by FreeGate fallbacks.
                    localStorage.setItem("free_out_token_v1", String(res.out_token));
                    localStorage.setItem("free_out_token", String(res.out_token));

                    // Persist session_id to survive Link4M/mobile flows.
                    const sid = String((res as any).session_id ?? "").trim();
                    if (sid) {
                      localStorage.setItem("free_session_id_v1", sid);
                      localStorage.setItem("free_session_id", sid);
                    }

                    localStorage.setItem("free_started_at_ms", String(Date.now()));
                    localStorage.setItem("free_min_delay_seconds", String(Math.max(0, Number(res.min_delay_seconds ?? 0))));
                    localStorage.setItem("free_key_type_code", String(selected));
                    const pass2Tok = String((res as any).out_token_pass2 ?? "").trim();
                    if (pass2Tok) localStorage.setItem("free_out_token_pass2", pass2Tok);
                    const pass2Outbound = String((res as any).outbound_url_pass2 ?? "").trim();
                    if (pass2Outbound) localStorage.setItem("free_outbound_url_pass2", pass2Outbound);
                  } catch {
                    // ignore
                  }
                  try {
                    localStorage.removeItem("free_claim_token");
                  } catch {
                    /* ignore */
                  }
                  setSelectedKeyTypeCode(selected);

                  const outbound = String(res.outbound_url ?? "").trim();
                  if (!outbound) {
                    if (testMode) {
                      window.location.assign(res.gate_url);
                      return;
                    }
                    setErr("OUTBOUND_URL_MISSING: Chưa cấu hình Link4M outbound đúng. Vui lòng báo admin kiểm tra free_outbound_url.");
                    return;
                  }

                  // Redirect to Link4M outbound
                  window.location.assign(outbound);
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
                  if (code === "SESSION_PENDING_LIMIT") {
                    setErr("Thiết bị này đang có quá nhiều phiên đang chờ xác thực. Hãy hoàn tất hoặc chờ vài phút rồi thử lại.");
                    return;
                  }
                  markFreeAttemptFail(code || e?.message || "START_FAILED");
                  setDeviceHistory(readFreeDeviceHistory());
                  setErr(e?.message ?? "Start failed");
                } finally {
                  setLoading(false);
                }
              }}
            >
              {loading ? "Đang chuyển hướng…" : "Get Key 🔑"}
            </Button>

            {lastFreeKey ? (
              <div className="space-y-3 rounded-2xl border bg-gradient-to-br from-background to-muted/30 p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Key 🔑 vừa nhận</div>
                    <div className="text-xs text-muted-foreground">Lưu nhanh để bạn dễ copy lại khi cần.</div>
                  </div>
                  <Badge className="rounded-full">Đã nhận</Badge>
                </div>
                <div className="rounded-xl border bg-background px-3 py-3 font-mono text-sm break-all">{lastFreeKey.key}</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border bg-background/80 px-3 py-2 text-xs text-muted-foreground">Loại key: <span className="font-medium text-foreground">{lastFreeKey.key_type || "-"}</span></div>
                  <div className="rounded-xl border bg-background/80 px-3 py-2 text-xs text-muted-foreground">Hết hạn: <span className="font-medium text-foreground">{formatVnDateTime(lastFreeKey.expires_at)}</span></div>
                  <div className="rounded-xl border bg-background/80 px-3 py-2 text-xs text-muted-foreground">Tạo lúc: <span className="font-medium text-foreground">{formatVnDateTime(lastFreeKey.created_at)}</span></div>
                  <div className="rounded-xl border bg-background/80 px-3 py-2 text-xs text-muted-foreground">Session: <span className="font-medium text-foreground">{shortHash(lastFreeKey.session_id, 12)}</span></div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-2xl"
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
                <div className="text-[11px] text-muted-foreground">IP hash: {shortHash(lastFreeKey.ip_hash, 12)}</div>
              </div>
            ) : null}
            <FreeDownloadCards cfg={cfg} />

          </CardContent>
        </Card>
        </main>
      </div>

      <Dialog open={showClosedDialog} onOpenChange={setShowClosedDialog}>
        <DialogContent
          hideCloseButton
          className="w-[calc(100vw-2.5rem)] max-w-[24rem] overflow-hidden rounded-[28px] border border-primary/20 bg-[#101010]/95 p-0 text-foreground shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:max-w-md"
        >
          <div className="bg-gradient-to-r from-primary/18 via-primary/8 to-transparent px-5 py-4">
            <DialogHeader className="space-y-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-primary/80">Thông báo</div>
                    <DialogTitle className="mt-1 text-left text-base font-semibold sm:text-lg">
                      Tạm đóng Get Key
                    </DialogTitle>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowClosedDialog(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-primary/20 bg-background/70 text-muted-foreground transition hover:text-foreground"
                  aria-label="Đóng thông báo"
                >
                  <span className="text-lg leading-none">×</span>
                </button>
              </div>
            </DialogHeader>
          </div>

          <div className="px-5 pb-5 pt-4">
            <div className="rounded-[22px] border border-primary/15 bg-primary/5 px-4 py-4 text-sm leading-6 text-muted-foreground">
              {String(cfg?.free_disabled_message ?? "Trang Get Key đang tạm đóng.")
                .split(/\n+/)
                .filter(Boolean)
                .map((line, index) => (
                  <p key={`${index}-${line.slice(0, 24)}`}>{line}</p>
                ))}
            </div>

            <div className="mt-4 flex justify-end">
              <Button type="button" variant="secondary" className="rounded-2xl" onClick={() => setShowClosedDialog(false)}>
                Đã hiểu
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ZaloGetKeyBubble />
    </>
  );
}
