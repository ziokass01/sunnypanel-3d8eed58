import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { postFunction } from "@/lib/functions";
import { fetchFreeConfig } from "@/features/free/free-config";
import { TurnstileWidget } from "@/features/free/TurnstileWidget";
import { FreeDeviceHistoryCard, FreeFlowSteps, markFreeAttemptFail, markFreeSuccess, readFreeDeviceHistory } from "@/features/free/flow-ux";
import { clearBundle, isFresh, readBundle, writeBundle } from "@/lib/freeFlow";
import {
  clearFreeFlowStorage,
  getFreeStartMeta,
  getOrCreateFingerprint,
  getOutToken,
  getSelectedKeyTypeCode,
  setOutToken,
} from "@/features/free/fingerprint";

type RevealOk = {
  ok: true;
  key: string;
  expires_at: string;
  key_type_label?: string | null;
  key_type_code?: string | null;
  created_at?: string | null;
  session_id?: string | null;
  ip_hash?: string | null;
};
type RevealErr = { ok: false; msg: string; code?: string };

type ResolveOk = { ok: true; session_id: string };
type ResolveErr = { ok: false; code?: string; msg: string };

function isValidClaimToken(tok: string) {
  const t = String(tok || "").trim();
  if (t.length < 16 || t.length > 512) return false;
  // base64url-ish (we generate with btoa url-safe)
  return /^[A-Za-z0-9_-]+$/.test(t);
}

function friendlyRevealError(msg: string) {
  const m = String(msg || "").trim();
  if (!m) return "Xác thực không thành công. Vui lòng làm lại.";
  if (m === "Failed to fetch" || m.toLowerCase().includes("failed to fetch")) {
    return "Không gọi được backend (Failed to fetch). Gợi ý: (1) CORS allow origin cho domain hiện tại, (2) backend URL/project mismatch, (3) backend functions chưa deploy đúng môi trường.";
  }
  if (m === "UNAUTHORIZED") return "Xác thực không thành công. Vui lòng quay lại trang Get Key 🔑 và vượt link lại.";
  if (m === "SESSION_NOT_FOUND") return "Lỗi không tìm thấy yêu cầu. Hãy quay lại trang Get Key để Xác minh lại.";
  if (m === "OUT_TOKEN_REQUIRED") return "Thiếu xác thực. Hãy quay lại trang Get Key 🔑 rồi vượt lại.";
  if (m === "OUT_TOKEN_MISMATCH") return "Xác thực không đúng . Vui lòng quay lại trang Get Key 🔑 và làm lại.";
  if (m === "CLAIM_INVALID") return "Lỗi xác minh không hợp lệ. Vui lòng quay lại trang Get Key 🔑 và làm lại.";
  if (m === "GATE_STATUS_INVALID") return "Xác thực chưa hợp lệ hoặc chưa xác thực. Vui lòng quay lại trang Get Key 🔑 và làm lại.";
  if (m === "RATE_LIMIT") return "Bạn đã hết lượt nhận key trong 24 giờ. Vui lòng thử lại sau.";
  if (m === "SERVER_ERROR") return "Server bận. Vui lòng thử lại.";
  if (m === "CLAIM_EXPIRED") return "Phiên xác thực đã hết hạn. Vui lòng quay lại trang Get Key 🔑 và làm lại.";
  if (m === "SESSION_BIND_MISMATCH") return "Phiên không khớp thiết bị/IP. Vui lòng bắt đầu lại từ trang Get Key 🔑.";
  if (m === "BLOCKED") return "Thiết bị hoặc IP của bạn đã bị chặn.";
  if (m === "ALREADY_REVEALED") return "Key 🔑 đã được tạo. Vui lòng copy Key 🔑 bên dưới.";
  return `Xác thực không thành công (${m}).`;
}

type RevealedState = { key: string; expiresAt: string; label: string };
const LAST_FREE_KEY_STORAGE = "lastFreeKey";

export function FreeClaimPage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();

  // NOTE: do NOT rely solely on router parsing; some redirect/shortener flows can produce malformed URLs with multiple '?'.
  // We robustly normalize the query from the real window.location.search.
  const normalizedQuery = useMemo(() => {
    // Normalize malformed queries like: /free/claim?claim=<TOKEN>?sid=<SID>&t=<T>
    // Rule: remove leading '?', then replace any remaining '?' with '&' before parsing.
    const raw = String(window.location.search || "");
    const withoutLeading = raw.startsWith("?") ? raw.slice(1) : raw;
    return withoutLeading.replace(/\?/g, "&");
  }, []);

  const robustParams = useMemo(() => {
    return new URLSearchParams(normalizedQuery);
  }, [normalizedQuery]);

  // Fallback: recover claim token when URL is like "/free/claim?claim<TOKEN>&sid=..." (missing '=')
  const recoveredClaimRaw = useMemo(() => {
    const normalized = normalizedQuery;
    const first = (normalized.split("&")[0] || "").trim();

    const prefixes = ["claim_token", "claimToken", "claim", "token", "c"];
    for (const p of prefixes) {
      if (!first.toLowerCase().startsWith(p.toLowerCase())) continue;
      // If it already has '=', normal parser should have caught it.
      if (first.slice(0, p.length + 1).toLowerCase() === `${p.toLowerCase()}=`) return "";
      const recovered = first.slice(p.length).trim();
      if (recovered) return recovered;
    }
    return "";
  }, [normalizedQuery]);

  const getParam = (keys: string[]) => {
    for (const k of keys) {
      const v = (robustParams.get(k) || "").trim();
      if (v) return v;
    }
    return "";
  };

  const queryClaimRaw = getParam(["claim", "claim_token", "claimToken", "c", "token"]);
  const tFromQuery = getParam(["t", "outToken", "out_token"]);
  const sidFromQuery = getParam(["sid", "session_id"]);
  const debugMode = getParam(["debug"]) === "1";

  // ---- Token source rules (NO MIX of *different* sessions):
  // Primary: URL. If URL is incomplete, we may do HYBRID recovery for missing pieces from *fresh* storage.
  // Fallback: Storage bundle (fresh + complete).

  const bundle = useMemo(() => readBundle(), []);
  const bundleFresh = useMemo(() => (bundle ? isFresh(bundle) : false), [bundle]);

  const startMeta = useMemo(() => getFreeStartMeta(), []);
  const metaFresh = useMemo(() => {
    const startedAtMs = Number(startMeta?.startedAtMs ?? 0);
    if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) return false;
    return Date.now() - startedAtMs <= 30 * 60 * 1000;
  }, [startMeta]);

  const claimFromUrl = useMemo(() => {
    const c1 = isValidClaimToken(queryClaimRaw) ? queryClaimRaw : "";
    if (c1) return c1;
    const c2 = isValidClaimToken(recoveredClaimRaw) ? recoveredClaimRaw : "";
    return c2;
  }, [queryClaimRaw, recoveredClaimRaw]);

  function readLegacyOutToken(): string {
    // (1) fingerprint storage
    const primary = String(getOutToken() || "").trim();
    if (primary) return primary;

    // (2) legacy LS keys
    try {
      const fb1 = String(localStorage.getItem("free_out_token_v1") || "").trim();
      if (fb1) return fb1;
      const fb2 = String(localStorage.getItem("free_out_token") || "").trim();
      if (fb2) return fb2;
    } catch {
      // ignore
    }

    return "";
  }

  const { claimToken, outToken, sessionId, tokenSource } = useMemo(() => {
    const sidUrl = String(sidFromQuery || "").trim();
    const outUrl = String(tFromQuery || "").trim();

    // URL / HYBRID mode (claim is required to proceed)
    if (claimFromUrl) {
      const claim = claimFromUrl;
      let out = outUrl;

      // HYBRID RECOVERY: if URL has claim but missing t => try to recover t from fresh storage
      if (!out) {
        // Prefer bundle match first (prevents mixing)
        if (bundleFresh && bundle?.claim_token === claim && bundle?.out_token) {
          out = String(bundle.out_token).trim();
        } else if (metaFresh) {
          out = readLegacyOutToken();
        }
      }

      // If URL has sid but missing t: still allow (out may be recovered above)
      // If URL has t but missing sid: keep sid empty and force canonical resolve by out_token later.
      let sid = sidUrl;

      // Borrow sid from bundle ONLY when bundle matches claim+out (and is fresh)
      if (!sid && out && bundleFresh && bundle?.claim_token === claim && bundle?.out_token === out) {
        sid = String(bundle.session_id || "").trim();
      }

      return {
        claimToken: claim,
        outToken: out,
        sessionId: sid,
        tokenSource: outUrl ? ("url" as const) : out ? ("hybrid" as const) : ("url" as const),
      };
    }

    // Storage bundle mode (must be fresh + complete)
    if (bundleFresh && bundle?.claim_token && bundle?.out_token && bundle?.session_id) {
      return {
        claimToken: String(bundle.claim_token).trim(),
        outToken: String(bundle.out_token).trim(),
        sessionId: String(bundle.session_id).trim(),
        tokenSource: "bundle" as const,
      };
    }

    return { claimToken: "", outToken: "", sessionId: "", tokenSource: "none" as const };
  }, [bundle, bundleFresh, claimFromUrl, metaFresh, sidFromQuery, tFromQuery]);

  const [resolvedSessionId, setResolvedSessionId] = useState<string>("");
  const effectiveSessionId = resolvedSessionId || sessionId || "";

  const didRetryRef = useRef(false);

  function clearLegacyFreeKeys() {
    try {
      const keys = [
        "free_out_token_v1",
        "free_out_token",
        "free_session_id_v1",
        "free_session_id",
        "free_claim_token",
        "session_id",
      ];
      for (const k of keys) localStorage.removeItem(k);
    } catch {
      // ignore
    }
  }

  function clearAllFreeStorage() {
    clearBundle();
    clearFreeFlowStorage();
    clearLegacyFreeKeys();
  }

  // Reset the one-time retry guard when tokens change.
  useEffect(() => {
    didRetryRef.current = false;
  }, [claimToken, outToken]);

  // Canonical session_id: whenever we have out_token, resolve sid from backend.
  // This repairs missing/incorrect sid due to URL mangling/copy.
  useEffect(() => {
    if (!outToken) return;
    let cancelled = false;
    void (async () => {
      const sid = await resolveByOutToken(outToken, debugMode);
      if (cancelled) return;
      // resolveByOutToken already sets state + storage; no-op here.
      void sid;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outToken, debugMode]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<RevealedState | null>(null);
  const [serverDebug, setServerDebug] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [deviceHistory, setDeviceHistory] = useState(() => readFreeDeviceHistory());

  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");

  async function resolveByOutToken(outTok: string, debug: boolean): Promise<string | null> {
    const tok = String(outTok || "").trim();
    if (!tok) return null;

    try {
      const res = await postFunction<ResolveOk | ResolveErr>("/free-resolve", {
        out_token: tok,
        debug: debug ? 1 : undefined,
      });

      if ((res as ResolveOk).ok) {
        const sid = String((res as ResolveOk).session_id || "").trim();
        if (!sid) return null;

        try {
          localStorage.setItem("free_session_id_v1", sid);
          localStorage.setItem("free_session_id", sid);
          localStorage.setItem("session_id", sid);
        } catch {
          // ignore
        }

        setResolvedSessionId(sid);
        return sid;
      }

      return null;
    } catch {
      return null;
    }
  }

  // If URL/hybrid mode is active, persist the atomic bundle for reload/multi-tab robustness.
  useEffect(() => {
    if (tokenSource !== "url" && tokenSource !== "hybrid") return;
    if (!claimToken || !outToken) return;

    // If we have a sid (either from URL or a verified matching bundle), we can write the full bundle.
    if (effectiveSessionId) {
      writeBundle({ session_id: effectiveSessionId, out_token: outToken, claim_token: claimToken });
    }

    // Backward-compat storage (does not affect token selection logic)
    try {
      localStorage.setItem("free_claim_token", claimToken);
    } catch {
      // ignore
    }
  }, [tokenSource, claimToken, outToken, effectiveSessionId]);

  // Backward-compat: persist out token from query so reloads don't lose it.
  useEffect(() => {
    if (!tFromQuery) return;
    setOutToken(tFromQuery);
    try {
      localStorage.setItem("free_out_token_v1", tFromQuery);
    } catch {
      // ignore
    }
  }, [tFromQuery]);

  // Backward-compat: persist session_id from query for robustness.
  useEffect(() => {
    if (!sidFromQuery) return;
    try {
      localStorage.setItem("free_session_id_v1", sidFromQuery);
      localStorage.setItem("free_session_id", sidFromQuery);
    } catch {
      // ignore
    }
  }, [sidFromQuery]);

  const hasBareClaimKey = useMemo(() => {
    const q = `&${normalizedQuery}&`;
    const keys = ["claim", "claim_token", "claimToken", "token", "c"];

    for (const k of keys) {
      const keyEq = `&${k}=`.toLowerCase();
      const keyBare = `&${k}`.toLowerCase();

      const qLower = q.toLowerCase();
      const hasEq = qLower.includes(keyEq);
      const hasBare = qLower.includes(keyBare);

      // Bare key present but no '=' form anywhere => malformed shortener like '?claim'
      if (hasBare && !hasEq) return true;
    }

    return false;
  }, [normalizedQuery]);

  useEffect(() => {
    // Fail-fast: URL contains claim key but no value (e.g. /free/claim?claim)
    // If we are NOT in fresh+complete bundle mode, we must clear FREE storage and stop.
    if (!hasBareClaimKey) return;
    if (claimFromUrl) return;

    const inBundleMode = tokenSource === "bundle";
    if (inBundleMode) return;

    clearAllFreeStorage();
    setError("Link nhận key không hợp lệ hoặc đã bị rút gọn sai. Hãy quay lại trang Get Key 🔑 và bấm Get Key 🔑 lại.");
  }, [hasBareClaimKey, claimFromUrl, tokenSource]);

  useEffect(() => {
    if (!claimToken) return;
    if (!outToken) {
      setError("Lỗi thiếu xác thực. Hãy quay lại Get Key 🔑 rồi vượt lại.");
    }
  }, [claimToken, outToken]);

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

  // Fetch backend config to determine Turnstile requirements.
  useEffect(() => {
    void (async () => {
      try {
        const cfg = await fetchFreeConfig();
        const enabled = Boolean(cfg.turnstile_enabled && cfg.turnstile_site_key);
        setTurnstileEnabled(enabled);
        setTurnstileSiteKey(cfg.turnstile_site_key ?? null);
        if (!enabled) setTurnstileToken("");
      } catch {
        // If config cannot be fetched, fail open (do not block claim UI).
        setTurnstileEnabled(false);
        setTurnstileSiteKey(null);
        setTurnstileToken("");
      }
    })();
  }, []);

  const returnSeconds = 10;

  const selectedLabel = useMemo(() => {
    const code = (getSelectedKeyTypeCode() || "").trim();
    return code ? `Key free (${code})` : "Key free";
  }, []);

  const canVerify = useMemo(() => {
    if (revealed) return false;
    if (!claimToken) return false;
    if (!outToken) return false;
    if (turnstileEnabled && !turnstileToken) return false;
    return !loading;
  }, [claimToken, outToken, revealed, loading, turnstileEnabled, turnstileToken]);

  async function revealOnce(opts?: { forceSid?: string | null }) {
    if (!claimToken) return;
    if (!outToken) {
      setError("Thiếu token (t). Hãy quay lại Get Key và đi đúng flow Link4M → Gate.");
      return;
    }
    if (loading || revealed) return;

    setLoading(true);
    setError(null);
    setServerDebug(null);

    try {
      const fp = getOrCreateFingerprint();

      let sid = String(opts?.forceSid ?? "").trim() || effectiveSessionId;
      if (!sid) {
        const resolved = await resolveByOutToken(outToken, debugMode);
        if (resolved) sid = resolved;
      }

      const res = await postFunction<RevealOk | RevealErr>("/free-reveal", {
        claim_token: claimToken,
        out_token: outToken,
        session_id: sid || undefined,
        fingerprint: fp,
        cf_turnstile_response: turnstileEnabled ? turnstileToken : undefined,
        debug: debugMode ? 1 : undefined,
      });

      if ((res as any)?.debug) setServerDebug((res as any).debug);
      if ((res as any)?.warnings) setServerDebug((prev: any) => ({ ...(prev ?? {}), warnings: (res as any).warnings }));

      if (!res.ok) {
        const err = res as RevealErr;
        const code = String(err.code || err.msg || "").trim();

        // If session not found, try to resolve session_id again and retry ONCE with the new sid.
        if (code === "SESSION_NOT_FOUND") {
          const currentSid = sid;
          const nextSid = await resolveByOutToken(outToken, debugMode);

          if (!nextSid) {
            // Hard stop: clear stale FREE storage so user won't get stuck in a loop.
            clearAllFreeStorage();
            const friendly = "Lỗi xác thực không tồn tại hoặc bị sai. Hãy quay lại trang Get Key 🔑 vượt lại.";
            setError(debugMode && code ? `${friendly} (${code})` : friendly);
            return;
          }

          if (!didRetryRef.current && nextSid !== currentSid) {
            didRetryRef.current = true;
            setLoading(false);
            await revealOnce({ forceSid: nextSid });
            return;
          }
        }

        const friendly = friendlyRevealError(code || err.msg || "UNAUTHORIZED");
        markFreeAttemptFail(code || err.msg || "REVEAL_FAILED");
        setDeviceHistory(readFreeDeviceHistory());
        setError(debugMode && code ? `${friendly} (${code})` : friendly);
        return;
      }

      const st: RevealedState = {
        key: (res as RevealOk).key,
        expiresAt: (res as RevealOk).expires_at,
        label: (res as RevealOk).key_type_label || selectedLabel,
      };

      setRevealed(st);

      try {
        const okRes = res as RevealOk;
        const payload = {
          key: okRes.key,
          key_type: okRes.key_type_label || okRes.key_type_code || selectedLabel,
          created_at: okRes.created_at || new Date().toISOString(),
          expires_at: okRes.expires_at,
          ip_hash: okRes.ip_hash || null,
          session_id: okRes.session_id || null,
        };
        localStorage.setItem(LAST_FREE_KEY_STORAGE, JSON.stringify(payload));
        markFreeSuccess({ keyLabel: payload.key_type, nextEligibleAt: okRes.expires_at || null });
        setDeviceHistory(readFreeDeviceHistory());
      } catch {
        // ignore
      }
    } catch (e: any) {
      const code = String(e?.code || "").trim();
      const friendly = friendlyRevealError(code || e?.message || "UNAUTHORIZED");
      markFreeAttemptFail(code || e?.message || "REVEAL_FAILED");
      setDeviceHistory(readFreeDeviceHistory());
      setError(debugMode && code ? `${friendly} (${code})` : friendly);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!claimToken || !outToken) return;
    if (revealed) return;
    void revealOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimToken, outToken, effectiveSessionId]);

  async function closeAndReturn() {
    try {
      if (outToken) {
        await postFunction("/free-close", { out_token: outToken });
      }
    } catch {
      // ignore
    } finally {
      clearFreeFlowStorage();
      clearBundle();
      try {
        localStorage.removeItem("free_claim_token");
      } catch {
        /* ignore */
      }
      nav("/free", { replace: true });
    }
  }

  // Auto return ONLY AFTER key is revealed.
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
      <main className="mx-auto flex min-h-svh max-w-xl items-center p-4">
        <Card className="w-full overflow-hidden border-border/80 shadow-xl shadow-primary/5">
          <CardHeader className="space-y-4 border-b bg-gradient-to-br from-primary/12 via-background to-background pb-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <img src="/brand.png" alt="SUNNY" className="h-11 w-11 rounded-2xl border bg-background p-1 shadow-sm" />
                <div>
                  <CardTitle className="text-xl">Nhận Key 🔑</CardTitle>
                  <div className="mt-1 text-sm text-muted-foreground">Bước cuối cùng. Khi phiên hợp lệ, key sẽ hiện ngay ở bên dưới.</div>
                </div>
              </div>
              <Badge variant="outline" className="min-w-[92px] justify-center rounded-full px-3 py-1 text-center">Bước 4 / 4</Badge>
            </div>
            <FreeFlowSteps current={4} />
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            <div className="rounded-2xl border bg-gradient-to-br from-background to-muted/30 p-4 text-sm text-muted-foreground shadow-sm">
              <div className="font-semibold text-foreground">Lưu ý</div>
              <div className="mt-1 leading-6">Nếu bạn thấy lỗi xác thực, hãy quay lại bước đầu để tạo lại phiên mới. Khi nhận thành công, bấm copy để lưu key ngay.</div>
            </div>

            <FreeDeviceHistoryCard history={deviceHistory} />

            {!claimToken ? (
              <div className="space-y-3 rounded-2xl border bg-background/70 p-4">
                <div className="text-sm font-semibold">Xác thực không thành công hoặc thiếu dữ liệu</div>
                <div className="text-sm text-muted-foreground">Hãy quay lại trang Get Key 🔑 và làm lại từ đầu để tạo phiên sạch.</div>
                <Button variant="secondary" className="h-11 w-full rounded-2xl" onClick={() => nav("/free", { replace: true })}>
                  Quay lại Get Key 🔑
                </Button>
              </div>
            ) : null}

            {claimToken && !outToken ? (
              <div className="space-y-3 rounded-2xl border bg-background/70 p-4">
                <div className="text-sm font-semibold">Thiếu xác thực</div>
                <div className="text-sm text-muted-foreground">Liên kết hiện tại chưa đủ thông tin. Hãy quay lại trang Get Key 🔑 rồi vượt lại đúng flow.</div>
                <Button variant="secondary" className="h-11 w-full rounded-2xl" onClick={() => nav("/free", { replace: true })}>
                  Quay lại Get Key 🔑
                </Button>
              </div>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {debugMode ? (
              <div className="rounded-2xl border p-3 text-xs text-muted-foreground space-y-1">
                <div>debug=1</div>
                <div>tokenSource: {tokenSource}</div>
                <div>claim_token_len: {claimToken ? claimToken.length : 0}</div>
                <div>claim_mask: {claimToken ? `${claimToken.slice(0, 6)}…${claimToken.slice(-4)}` : ""}</div>
                <div>sid_len: {sessionId ? sessionId.length : 0}</div>
                <div>sid_mask: {sessionId ? `${sessionId.slice(0, 6)}…${sessionId.slice(-4)}` : ""}</div>
                <div>resolved_sid_len: {resolvedSessionId ? resolvedSessionId.length : 0}</div>
                <div>resolved_sid_mask: {resolvedSessionId ? `${resolvedSessionId.slice(0, 6)}…${resolvedSessionId.slice(-4)}` : ""}</div>
                <div>effective_sid_len: {effectiveSessionId ? effectiveSessionId.length : 0}</div>
                <div>effective_sid_mask: {effectiveSessionId ? `${effectiveSessionId.slice(0, 6)}…${effectiveSessionId.slice(-4)}` : ""}</div>
                <div>t_len: {outToken ? outToken.length : 0}</div>
                <div>t_mask: {outToken ? `${outToken.slice(0, 6)}…${outToken.slice(-4)}` : ""}</div>
                {serverDebug ? (
                  <div className="pt-2">
                    <div className="text-foreground font-medium">backend debug</div>
                    <pre className="whitespace-pre-wrap break-words">{JSON.stringify(serverDebug, null, 2)}</pre>
                  </div>
                ) : null}
              </div>
            ) : null}

            {!revealed ? (
              <div className="space-y-3 rounded-2xl border bg-background/70 p-4">
                {turnstileEnabled && turnstileSiteKey ? (
                  <div className="rounded-2xl border p-3">
                    <TurnstileWidget
                      siteKey={turnstileSiteKey}
                      onToken={setTurnstileToken}
                      onError={(m) => setError(m)}
                    />
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border bg-background p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Trạng thái</div>
                    <div className="mt-1 text-sm font-semibold">{loading ? "Đang xác minh" : "Sẵn sàng"}</div>
                  </div>
                  <div className="rounded-2xl border bg-background p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Loại key</div>
                    <div className="mt-1 text-sm font-semibold">{selectedLabel}</div>
                  </div>
                  <div className="rounded-2xl border bg-background p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Tiếp theo</div>
                    <div className="mt-1 text-sm font-semibold">Hiển thị key</div>
                  </div>
                </div>

                <Button className="h-12 w-full rounded-2xl text-base font-semibold" disabled={!canVerify || loading} onClick={() => void revealOnce()}>
                  {loading ? "Đang xác minh…" : "Xác minh"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4 rounded-2xl border bg-gradient-to-br from-background to-muted/30 p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{revealed.label}</div>
                    <div className="text-xs text-muted-foreground">Key đã sẵn sàng. Bạn nên copy ngay để lưu lại.</div>
                  </div>
                  <Badge className="rounded-full">Thành công</Badge>
                </div>

                <div className="rounded-2xl border bg-background px-4 py-4 text-center">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Key của bạn</div>
                  <div className="mt-2 break-all font-mono text-lg font-semibold text-foreground">{revealed.key}</div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border bg-background px-3 py-3 text-sm">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Trạng thái</div>
                    <div className="mt-1 font-semibold text-primary">Thành công</div>
                  </div>
                  <div className="rounded-2xl border bg-background px-3 py-3 text-sm">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Tự quay lại</div>
                    <div className="mt-1 font-semibold">{returnSeconds}s</div>
                  </div>
                  <div className="rounded-2xl border bg-background px-3 py-3 text-sm sm:col-span-2">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Hết hạn</div>
                    <div className="mt-1 break-all font-medium text-foreground">{revealed.expiresAt}</div>
                  </div>
                </div>

                <Button
                  className="h-12 w-full rounded-2xl text-base font-semibold"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(revealed.key);
                      setCopied(true);
                    } catch {
                      // ignore
                    }
                    await closeAndReturn();
                  }}
                >
                  {copied ? "Đã copy key" : "Copy key"}
                </Button>

                <div className="text-center text-xs text-muted-foreground">
                  Tự động quay lại sau {returnSeconds}s nếu bạn không thao tác thêm.
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
