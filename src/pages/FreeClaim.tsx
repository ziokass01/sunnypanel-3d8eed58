import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { postFunction } from "@/lib/functions";
import { fetchFreeConfig } from "@/features/free/free-config";
import { TurnstileWidget } from "@/features/free/TurnstileWidget";
import { clearBundle, isFresh, readBundle, writeBundle } from "@/lib/freeFlow";
import { clearFreeFlowStorage, getOrCreateFingerprint, getSelectedKeyTypeCode, setOutToken } from "@/features/free/fingerprint";

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
  if (m === "UNAUTHORIZED") return "Xác thực không thành công. Vui lòng quay lại Get Key và vượt link lại.";
  if (m === "SESSION_NOT_FOUND") return "Không tìm thấy phiên (session). Hãy quay lại /free và bấm Xác minh lại.";
  if (m === "OUT_TOKEN_REQUIRED") return "Thiếu token (t). Hãy quay lại Get Key và đi đúng flow Link4M → Gate.";
  if (m === "OUT_TOKEN_MISMATCH") return "Token (t) không khớp phiên. Vui lòng quay lại Get Key và làm lại.";
  if (m === "CLAIM_INVALID") return "Token xác minh không hợp lệ. Vui lòng quay lại Get Key và làm lại.";
  if (m === "GATE_STATUS_INVALID") return "Gate chưa hợp lệ hoặc phiên chưa qua Gate. Vui lòng quay lại Get Key và làm lại.";
  if (m === "RATE_LIMIT") return "Bạn đã hết lượt nhận key trong 24 giờ. Vui lòng thử lại sau.";
  if (m === "SERVER_ERROR") return "Server bận. Vui lòng thử lại.";
  if (m === "CLAIM_EXPIRED") return "Phiên xác thực đã hết hạn. Vui lòng quay lại Get Key và làm lại.";
  if (m === "SESSION_BIND_MISMATCH") return "Phiên không khớp thiết bị/IP. Vui lòng bắt đầu lại từ trang Get Key.";
  if (m === "BLOCKED") return "Thiết bị hoặc IP của bạn đã bị chặn.";
  if (m === "ALREADY_REVEALED") return "Key đã được phát. Hãy copy key bên dưới.";
  return `Xác thực không thành công (${m}).`;
}

type RevealedState = { key: string; expiresAt: string; label: string };
const LAST_FREE_KEY_STORAGE = "lastFreeKey";

export function FreeClaimPage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();

  // NOTE: do NOT rely solely on router parsing; some redirect/shortener flows can produce malformed URLs with multiple '?'.
  // We robustly normalize the query from the real window.location.search.
  const robustParams = useMemo(() => {
    // Normalize malformed queries like: /free/claim?claim=<TOKEN>?sid=<SID>&t=<T>
    // Rule: remove leading '?', then replace any remaining '?' with '&' before parsing.
    const raw = String(window.location.search || "");
    const withoutLeading = raw.startsWith("?") ? raw.slice(1) : raw;
    const normalized = withoutLeading.replace(/\?/g, "&");
    return new URLSearchParams(normalized);
  }, []);

  // Fallback: recover claim token when URL is like "/free/claim?claim<TOKEN>&sid=..." (missing '=')
  const recoveredClaimRaw = useMemo(() => {
    const raw = String(window.location.search || "");
    const withoutLeading = raw.startsWith("?") ? raw.slice(1) : raw;
    const normalized = withoutLeading.replace(/\?/g, "&");
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
  }, []);

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

  // ---- Token source rules (NO MIX):
  // A) URL mode: valid only when claim + out_token are present in URL
  // B) Storage mode: only when URL mode invalid, use a fresh bundle with full tokens
  const bundle = useMemo(() => readBundle(), []);
  const bundleFresh = useMemo(() => (bundle ? isFresh(bundle) : false), [bundle]);

  const claimFromUrl = useMemo(() => {
    const c1 = isValidClaimToken(queryClaimRaw) ? queryClaimRaw : "";
    if (c1) return c1;
    const c2 = isValidClaimToken(recoveredClaimRaw) ? recoveredClaimRaw : "";
    return c2;
  }, [queryClaimRaw, recoveredClaimRaw]);

  const urlModeValid = useMemo(() => {
    return Boolean(claimFromUrl && String(tFromQuery || "").trim());
  }, [claimFromUrl, tFromQuery]);

  const { claimToken, outToken, sessionId, tokenSource } = useMemo(() => {
    if (urlModeValid) {
      const claim = claimFromUrl;
      const out = String(tFromQuery || "").trim();
      const sidUrl = String(sidFromQuery || "").trim();

      // If URL has no sid, only borrow sid from bundle when bundle matches claim+out (and is fresh)
      let sid = sidUrl;
      if (!sid && bundleFresh && bundle?.claim_token === claim && bundle?.out_token === out) {
        sid = String(bundle.session_id || "").trim();
      }

      return {
        claimToken: claim,
        outToken: out,
        sessionId: sid,
        tokenSource: "url" as const,
      };
    }

    // Storage mode (bundle must be fresh and complete)
    if (bundleFresh && bundle?.claim_token && bundle?.out_token && bundle?.session_id) {
      return {
        claimToken: String(bundle.claim_token).trim(),
        outToken: String(bundle.out_token).trim(),
        sessionId: String(bundle.session_id).trim(),
        tokenSource: "bundle" as const,
      };
    }

    return { claimToken: "", outToken: "", sessionId: "", tokenSource: "none" as const };
  }, [bundle, bundleFresh, claimFromUrl, sidFromQuery, tFromQuery, urlModeValid]);

  const [resolvedSessionId, setResolvedSessionId] = useState<string>("");
  const effectiveSessionId = resolvedSessionId || sessionId || "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<RevealedState | null>(null);
  const [serverDebug, setServerDebug] = useState<any>(null);

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

  // If URL mode is active, persist the atomic bundle for reload/multi-tab robustness.
  useEffect(() => {
    if (tokenSource !== "url") return;
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

  useEffect(() => {
    if (!claimToken) return;
    if (!outToken) {
      setError("Thiếu token (t). Hãy quay lại Get Key và đi đúng flow Link4M → Gate.");
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
          if (nextSid && nextSid !== currentSid) {
            setLoading(false);
            await revealOnce({ forceSid: nextSid });
            return;
          }
        }

        const friendly = friendlyRevealError(code || err.msg || "UNAUTHORIZED");
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
      } catch {
        // ignore
      }
    } catch (e: any) {
      const code = String(e?.code || "").trim();
      const friendly = friendlyRevealError(code || e?.message || "UNAUTHORIZED");
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
      <main className="mx-auto flex min-h-svh max-w-lg items-center p-4">
        <Card className="w-full">
          <CardHeader>
            <div className="flex items-center gap-3">
              <img src="/brand.png" alt="SUNNY" className="h-10 w-10 rounded-xl" />
              <div>
                <CardTitle>Nhận key</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!claimToken ? (
              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium"> Xác thực không thành công hoặc lỗi </div>
                <div className="text-muted-foreground">Hãy quay lại trang Getkey và làm lại.</div>
                <div className="mt-3">
                  <Button variant="secondary" className="w-full" onClick={() => nav("/free", { replace: true })}>
                    Quay lại Get Key
                  </Button>
                </div>
              </div>
            ) : null}

            {claimToken && !outToken ? (
              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium">Thiếu token (t)</div>
                <div className="text-muted-foreground">Hãy quay lại Get Key và đi đúng flow Link4M → Gate.</div>
                <div className="mt-3">
                  <Button variant="secondary" className="w-full" onClick={() => nav("/free", { replace: true })}>
                    Quay lại Get Key
                  </Button>
                </div>
              </div>
            ) : null}

            {error ? <div className="text-sm text-destructive">{error}</div> : null}

            {debugMode ? (
              <div className="rounded-md border p-3 text-xs text-muted-foreground space-y-1">
                <div>debug=1</div>
                <div>claim_token_len: {claimToken ? claimToken.length : 0}</div>
                <div>
                  claim_mask: {claimToken ? `${claimToken.slice(0, 6)}…${claimToken.slice(-4)}` : ""}
                </div>
                <div>sid_len: {sessionId ? sessionId.length : 0}</div>
                <div>
                  sid_mask: {sessionId ? `${sessionId.slice(0, 6)}…${sessionId.slice(-4)}` : ""}
                </div>
                <div>t_len: {outToken ? outToken.length : 0}</div>
                <div>
                  t_mask: {outToken ? `${outToken.slice(0, 6)}…${outToken.slice(-4)}` : ""}
                </div>
                {serverDebug ? (
                  <div className="pt-2">
                    <div className="text-foreground font-medium">backend debug</div>
                    <pre className="whitespace-pre-wrap break-words">{JSON.stringify(serverDebug, null, 2)}</pre>
                  </div>
                ) : null}
              </div>
            ) : null}

             {!revealed ? (
               <div className="space-y-3">
                 {turnstileEnabled && turnstileSiteKey ? (
                   <div className="rounded-md border p-3">
                     <TurnstileWidget
                       siteKey={turnstileSiteKey}
                       onToken={setTurnstileToken}
                       onError={(m) => setError(m)}
                     />
                   </div>
                 ) : null}

                  <Button className="w-full" disabled={!canVerify || loading} onClick={() => void revealOnce()}>
                    {loading ? "Đang xác minh…" : "Xác minh"}
                  </Button>
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
