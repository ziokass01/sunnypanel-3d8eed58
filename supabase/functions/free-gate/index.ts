import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-fp, x-admin-key",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-max-age": "86400",
  "vary": "origin",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function text(value: unknown, max = 4096) {
  return String(value ?? "").trim().slice(0, max);
}
function getIp(req: Request) {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ?? "0.0.0.0";
}
async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(String(input ?? ""));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function clampSeconds(value: unknown, fallback: number, min: number, max: number) {
  const n = Math.floor(Number(value ?? fallback));
  const safe = Number.isFinite(n) && n > 0 ? n : fallback;
  return Math.min(max, Math.max(min, safe));
}
function secondsUntil(iso: unknown) {
  const ms = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(ms)) return -1;
  return Math.ceil((ms - Date.now()) / 1000);
}
function minIsoDeadline(...items: Array<string | number | Date | null | undefined>) {
  const times = items
    .map((item) => item instanceof Date ? item.getTime() : typeof item === "number" ? item : Date.parse(String(item ?? "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!times.length) return new Date().toISOString();
  return new Date(Math.min(...times)).toISOString();
}
function publicBase() {
  return (Deno.env.get("FREE_PUBLIC_BASE_URL") || Deno.env.get("PUBLIC_BASE_URL") || "https://mityangho.id.vn").replace(/\/+$/, "");
}
function randomToken(prefix: string) {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const body = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${prefix}_${body}`;
}
function gateUrlFromToken(gateToken: string, passNo: number) {
  const url = new URL(`${publicBase()}/free/gate`);
  url.searchParams.set("t", gateToken);
  url.searchParams.set("p", String(passNo));
  return url.toString();
}
async function claimTokenForGate(gateToken: string, sessionId: string) {
  const secret = Deno.env.get("FREE_CLAIM_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "sunny-free-claim-v1";
  const digest = await sha256Hex(`claim-v1:${secret}:${sessionId}:${gateToken}`);
  return `clm_${digest}`;
}
function normalizeTemplate(template: string) {
  return String(template || "")
    .trim()
    .replace(/\{\s*gate_url_enc\s*\}/gi, "{url_enc}")
    .replace(/\{\s*gate_url\s*\}/gi, "{url}")
    .replace(/\{\s*GATE_URL_ENC\s*\}/g, "{url_enc}")
    .replace(/\{\s*GATE_URL\s*\}/g, "{url}")
    .replace(/\{\s*api_token\s*\}/gi, "{token}");
}
function renderTemplate(templateRaw: string, gateUrl: string, apiToken: string) {
  const template = normalizeTemplate(templateRaw);
  if (!template) return "";
  return template
    .replaceAll("{url_enc}", encodeURIComponent(gateUrl))
    .replaceAll("{url}", gateUrl)
    .replaceAll("{token}", encodeURIComponent(apiToken));
}
async function readJsonOrText(url: string) {
  const res = await fetch(url, { headers: { "accept": "application/json,text/plain,*/*", "user-agent": "SunnyPanel-FreeKey/1.0" } });
  const raw = await res.text();
  let data: any = null;
  try { data = JSON.parse(raw); } catch { data = null; }
  if (!res.ok) throw new Error(data?.message || data?.error || raw.slice(0, 180) || `HTTP_${res.status}`);
  return { data, raw };
}
function extractShortUrl(data: any, raw: string) {
  const candidates = [data?.shortenedUrl, data?.short_url, data?.url, data?.html, data?.short, data?.result, data?.data?.shortenedUrl, data?.data?.url, raw];
  for (const c of candidates) {
    const v = String(c ?? "").trim();
    if (/^https?:\/\//i.test(v)) return v;
  }
  return "";
}
async function shortenWithProvider(provider: any, gateUrl: string) {
  const kind = text(provider?.provider || "custom", 32).toLowerCase() || "custom";
  const token = text(provider?.api_token_secret, 4096);
  const apiUrl = text(provider?.api_url_template, 4096);
  if (kind === "none") return gateUrl;

  let requestUrl = "";
  if (kind === "traffic68") {
    const base = apiUrl || "https://traffic68.com/api/quicklink/st";
    return `${base}${base.includes("?") ? "&" : "?"}api=${encodeURIComponent(token)}&url=${encodeURIComponent(gateUrl)}`;
  }
  if (kind === "link4m") {
    const base = apiUrl || "https://link4m.co/api-shorten/v2";
    requestUrl = renderTemplate(base.includes("{url") || base.includes("{token") ? base : `${base}${base.includes("?") ? "&" : "?"}api={token}&url={url_enc}`, gateUrl, token);
  } else if (kind === "nhapma") {
    const base = apiUrl || "https://service.nhapma.com/api";
    requestUrl = renderTemplate(base.includes("{url") || base.includes("{token") ? base : `${base}${base.includes("?") ? "&" : "?"}token={token}&url={url_enc}`, gateUrl, token);
  } else if (kind === "layma") {
    const base = apiUrl || "https://api.layma.net/api/admin/shortlink/quicklink";
    requestUrl = renderTemplate(base.includes("{url") || base.includes("{token") ? base : `${base}${base.includes("?") ? "&" : "?"}tokenUser={token}&format=json&url={url_enc}`, gateUrl, token);
  } else {
    requestUrl = renderTemplate(apiUrl, gateUrl, token);
  }
  if (!requestUrl) throw new Error("SHORTLINK_TEMPLATE_INVALID");
  if (/\/st\?/i.test(requestUrl) && !/api-shorten|\/api(\/|\?|$)|format=json/i.test(requestUrl)) return requestUrl;
  const { data, raw } = await readJsonOrText(requestUrl);
  const shortUrl = extractShortUrl(data, raw);
  if (!shortUrl) throw new Error(String(data?.message || data?.error || "SHORTLINK_RESPONSE_INVALID"));
  return shortUrl;
}
async function logGate(db: any, row: Record<string, unknown>) {
  try { await db.from("licenses_free_gate_logs").insert(row); } catch { /* ignore */ }
}
async function updateSession(db: any, sessionId: string, patch: Record<string, unknown>) {
  const { error } = await db.from("licenses_free_sessions").update(patch).eq("session_id", sessionId);
  return !error;
}
async function loadProviders(db: any, passNo: number) {
  const scopes = passNo === 2 ? ["both", "pass2"] : ["both", "pass1"];
  const res = await db.from("licenses_free_shortlink_providers")
    .select("*")
    .eq("enabled", true)
    .in("pass_scope", scopes)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (res.error) throw res.error;
  return (res.data ?? []) as any[];
}
function fallbackProviderFromSettings(cfg: any, passNo: number) {
  const template = text(passNo === 2 ? (cfg.free_outbound_url_pass2 || cfg.free_outbound_url) : cfg.free_outbound_url, 4096);
  if (!template) return null;
  return { id: null, name: passNo === 2 ? "Legacy Pass2" : "Legacy Pass1", provider: "custom", api_url_template: template, api_token_secret: "", pass_scope: passNo === 2 ? "pass2" : "pass1", sort_order: 9999 };
}
async function chooseProvider(db: any, cfg: any, passNo: number, avoidId?: string | null) {
  let providers: any[] = [];
  try { providers = await loadProviders(db, passNo); } catch { providers = []; }
  if (!providers.length) {
    const fb = fallbackProviderFromSettings(cfg, passNo);
    if (fb) return fb;
    throw new Error("SHORTLINK_PROVIDER_MISSING");
  }
  if (avoidId && providers.length > 1) {
    const filtered = providers.filter((p) => String(p.id) !== String(avoidId));
    if (filtered.length) providers = filtered;
  }
  const mode = text(cfg.free_shortlink_mode || "round_robin", 32).toLowerCase() === "random" ? "random" : "round_robin";
  const lastId = text(passNo === 2 ? cfg.free_shortlink_last_provider_id_pass2 : cfg.free_shortlink_last_provider_id_pass1, 64);
  let selected: any;
  if (mode === "random") {
    let pool = providers;
    if (lastId && providers.length > 1) pool = providers.filter((p) => String(p.id) !== lastId);
    selected = pool[Math.floor(Math.random() * pool.length)] ?? providers[0];
  } else {
    const idxRaw = Number(passNo === 2 ? cfg.free_shortlink_next_index_pass2 : cfg.free_shortlink_next_index_pass1);
    const idx = Number.isFinite(idxRaw) ? Math.max(0, Math.floor(idxRaw)) : 0;
    selected = providers[idx % providers.length] ?? providers[0];
    const next = (idx + 1) % providers.length;
    const patch: Record<string, unknown> = passNo === 2 ? { free_shortlink_next_index_pass2: next } : { free_shortlink_next_index_pass1: next };
    try { await db.from("licenses_free_settings").update(patch).eq("id", 1); } catch { /* ignore */ }
  }
  if (selected?.id) {
    const patch: Record<string, unknown> = passNo === 2 ? { free_shortlink_last_provider_id_pass2: selected.id } : { free_shortlink_last_provider_id_pass1: selected.id };
    try { await db.from("licenses_free_settings").update(patch).eq("id", 1); } catch { /* ignore */ }
  }
  return selected;
}
async function createNextGateToken(db: any, cfg: any, session: any, passNo: 1 | 2, hashes: { ipHash: string; uaHash: string; fpHash: string }) {
  const gateToken = randomToken("gt");
  const gateHash = await sha256Hex(gateToken);
  const delay = Math.max(0, Number(cfg.free_min_delay_enabled === false ? 0 : (passNo === 2 ? cfg.free_min_delay_seconds_pass2 : cfg.free_min_delay_seconds) ?? 0) || 0);
  const gateLifeSeconds = clampSeconds(cfg.free_gate_token_life_seconds ?? session?.gate_token_life_seconds, 600, 60, 1800);
  const nowMs = Date.now();
  const activateAfterAt = new Date(nowMs + delay * 1000).toISOString();
  const gateExpiresAt = new Date(nowMs + (delay + gateLifeSeconds) * 1000).toISOString();
  const avoidId = passNo === 2 ? text(session?.provider_id_pass1, 64) : null;
  const provider = await chooseProvider(db, cfg, passNo, avoidId);
  const gateUrl = gateUrlFromToken(gateToken, passNo);
  const outboundUrl = await shortenWithProvider(provider, gateUrl);
  const ins = await db.from("licenses_free_gate_tokens").insert({
    session_id: session.session_id,
    pass_no: passNo,
    token_hash: gateHash,
    status: "pending",
    activate_after_at: activateAfterAt,
    expires_at: gateExpiresAt,
    provider_id: provider?.id ?? null,
    short_url: outboundUrl,
    ip_hash: hashes.ipHash,
    ua_hash: hashes.uaHash,
    fingerprint_hash: hashes.fpHash || hashes.ipHash,
  });
  if (ins.error) throw ins.error;
  if (provider?.id) {
    try { await db.from("licenses_free_shortlink_providers").update({ last_used_at: new Date().toISOString(), last_error: null }).eq("id", provider.id); } catch { /* ignore */ }
  }
  return { gateToken, gateUrl, outboundUrl, provider, delay, gateLifeSeconds, gateExpiresAt, activateAfterAt };
}
async function loadSession(db: any, sessionId: string) {
  const { data, error } = await db.from("licenses_free_sessions").select("*").eq("session_id", sessionId).maybeSingle();
  if (error) throw error;
  return data as any;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED", msg: "METHOD_NOT_ALLOWED" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) return json({ ok: false, code: "SERVER_NOT_READY", msg: "SERVER_NOT_READY" }, 503);

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return json({ ok: false, code: "BAD_JSON", msg: "BAD_JSON" }, 200);

  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const passNoFromBody = Number(body.pass ?? 1) === 2 ? 2 : 1;
  const gateToken = text(body.gate_token || body.gateToken, 4096);
  const sessionIdFromBody = text(body.session_id, 128);
  const outToken = text(body.out_token, 4096);
  const fingerprint = text(body.fingerprint, 512);
  const currentUrl = text(body.current_url, 2048);
  const referrer = text(body.referrer, 2048);
  const ip = getIp(req);
  const ua = req.headers.get("user-agent") ?? "";
  const ipHash = await sha256Hex(ip);
  const uaHash = await sha256Hex(ua);
  const fpHash = fingerprint ? await sha256Hex(fingerprint) : "";

  const { data: settings } = await db.from("licenses_free_settings").select("*").eq("id", 1).maybeSingle();
  const cfg = (settings ?? {}) as any;

  let baseLog = {
    session_id: sessionIdFromBody || null,
    pass_no: passNoFromBody,
    ip_hash: ipHash,
    ua_hash: uaHash,
    fingerprint_hash: fpHash || null,
    detail: { route: "free-gate", current_url: currentUrl || null, referrer: referrer || null, tokenized: Boolean(gateToken) },
  } as Record<string, unknown>;

  async function deny(code: string, extra: Record<string, unknown> = {}) {
    const sid = text(baseLog.session_id, 128);
    if (sid) await updateSession(db, sid, { last_error: code });
    await logGate(db, { ...baseLog, event_code: code, detail: { ...(baseLog.detail as any), ...extra } });
    return json({ ok: false, code, msg: code, ...extra }, 200);
  }

  if (cfg.free_enabled === false) return await deny("FREE_DISABLED");

  // New tokenized gate flow: /free/gate?t=gt_xxx. No session/out token is required in URL.
  if (gateToken) {
    const gateHash = await sha256Hex(gateToken);
    const tokenRes = await db.from("licenses_free_gate_tokens").select("*").eq("token_hash", gateHash).maybeSingle();
    if (tokenRes.error) return await deny("GATE_TOKEN_LOAD_FAILED", { detail: tokenRes.error.message });
    const gateRow = tokenRes.data as any;
    if (!gateRow) return await deny("GATE_TOKEN_INVALID");

    const session = await loadSession(db, String(gateRow.session_id));
    if (!session) return await deny("SESSION_NOT_FOUND");
    baseLog = { ...baseLog, session_id: session.session_id, pass_no: Number(gateRow.pass_no ?? passNoFromBody), key_type_code: session.key_type_code ?? null };

    if (session.closed_at || String(session.status ?? "").toLowerCase() === "closed") return await deny("SESSION_CLOSED");
    if (secondsUntil(session.expires_at) <= 0) return await deny("SESSION_EXPIRED");

    const passNo = Number(gateRow.pass_no ?? passNoFromBody) === 2 ? 2 : 1;
    let requiresDoubleGate = Number(session.passes_required ?? 1) >= 2;
    if (!requiresDoubleGate && session.key_type_code) {
      try {
        const { data: keyType } = await db.from("licenses_free_key_types").select("requires_double_gate").eq("code", session.key_type_code).maybeSingle();
        requiresDoubleGate = Boolean((keyType as any)?.requires_double_gate ?? false);
      } catch { /* ignore */ }
    }

    const status = String(gateRow.status ?? "").toLowerCase();
    if (status !== "pending") {
      const sessionStatus = String(session.status ?? "").toLowerCase();
      const finalGateWasUsed = status === "used" && !(requiresDoubleGate && passNo === 1) && (sessionStatus === "gate_ok" || sessionStatus === "revealed");
      if (finalGateWasUsed) {
        const claimToken = await claimTokenForGate(gateToken, session.session_id);
        return json({ ok: true, next: "CLAIM", session_id: session.session_id, claim_token: claimToken, claim_url: "/free/claim", replay: true }, 200);
      }
      return await deny(status === "burned_early" ? "GATE_TOKEN_BURNED" : status === "expired" ? "GATE_TOKEN_EXPIRED" : "GATE_TOKEN_ALREADY_USED", { token_status: status });
    }

    if (session.revealed_at || String(session.status ?? "").toLowerCase() === "revealed") return await deny("ALREADY_REVEALED");

    const requireIp = Boolean(cfg.free_gate_require_ip_match ?? false);
    const requireUa = Boolean(cfg.free_gate_require_ua_match ?? false);
    if (requireIp && text(gateRow.ip_hash || session.ip_hash, 128) && text(gateRow.ip_hash || session.ip_hash, 128) !== ipHash) return await deny("DEVICE_MISMATCH", { field: "ip" });
    if (requireUa && text(gateRow.ua_hash || session.ua_hash, 128) && text(gateRow.ua_hash || session.ua_hash, 128) !== uaHash) return await deny("DEVICE_MISMATCH", { field: "ua" });
    if (fpHash && text(gateRow.fingerprint_hash || session.fingerprint_hash, 128) && text(gateRow.fingerprint_hash || session.fingerprint_hash, 128) !== fpHash) return await deny("DEVICE_MISMATCH", { field: "fingerprint" });

    const activateMs = Date.parse(String(gateRow.activate_after_at ?? ""));
    const expiresMs = Date.parse(String(gateRow.expires_at ?? ""));
    const nowMs = Date.now();
    if (Number.isFinite(activateMs) && nowMs < activateMs) {
      await db.from("licenses_free_gate_tokens").update({ status: "burned_early", burned_at: new Date().toISOString(), fail_reason: "GATE_TOO_EARLY" }).eq("id", gateRow.id).eq("status", "pending");
      await updateSession(db, session.session_id, { status: "closed", closed_at: new Date().toISOString(), out_expires_at: new Date().toISOString(), last_error: "GATE_TOO_EARLY" });
      await logGate(db, { ...baseLog, event_code: "GATE_TOO_EARLY", detail: { ...(baseLog.detail as any), activate_after_at: gateRow.activate_after_at, wait_seconds: Math.ceil((activateMs - nowMs) / 1000) }, fingerprint_hash: fpHash || null, ip_hash: ipHash, ua_hash: uaHash });
      return json({ ok: false, code: "GATE_TOO_EARLY", msg: "GATE_TOO_EARLY", wait_seconds: Math.ceil((activateMs - nowMs) / 1000) }, 200);
    }
    if (!Number.isFinite(expiresMs) || nowMs > expiresMs) {
      await db.from("licenses_free_gate_tokens").update({ status: "expired", fail_reason: "GATE_TOKEN_EXPIRED" }).eq("id", gateRow.id).eq("status", "pending");
      await updateSession(db, session.session_id, { status: "closed", closed_at: new Date().toISOString(), out_expires_at: new Date().toISOString(), last_error: "GATE_TOKEN_EXPIRED" });
      return await deny("GATE_TOKEN_EXPIRED");
    }

    if (requiresDoubleGate && passNo === 1) {
      const lock = await db.from("licenses_free_gate_tokens")
        .update({ status: "used", used_at: new Date().toISOString() })
        .eq("id", gateRow.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (!lock.data) return await deny("GATE_TOKEN_ALREADY_USED");

      let next;
      try {
        next = await createNextGateToken(db, cfg, session, 2, { ipHash, uaHash, fpHash });
      } catch (error) {
        await updateSession(db, session.session_id, { status: "closed", closed_at: new Date().toISOString(), last_error: "PASS2_SHORTLINK_FAILED" });
        return await deny("PASS2_SHORTLINK_FAILED", { detail: String((error as any)?.message ?? error) });
      }
      await updateSession(db, session.session_id, {
        status: "waiting_pass2",
        passes_required: 2,
        passes_completed: 1,
        current_pass: 2,
        pass1_ok_at: new Date().toISOString(),
        gate_ok_at: new Date().toISOString(),
        provider_id_pass2: next.provider?.id ?? null,
        last_error: null,
      });
      await logGate(db, { ...baseLog, event_code: "pass1_ok_tokenized", detail: { ...(baseLog.detail as any), next: "PASS2", provider_id: next.provider?.id ?? null, provider_name: next.provider?.name ?? null } });
      return json({ ok: true, next: "PASS2", outbound_url: next.outboundUrl, gate_url: next.gateUrl, min_delay_seconds: next.delay, gate_token_life_seconds: next.gateLifeSeconds }, 200);
    }

    const lock = await db.from("licenses_free_gate_tokens")
      .update({ status: "used", used_at: new Date().toISOString() })
      .eq("id", gateRow.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!lock.data) return await deny("GATE_TOKEN_ALREADY_USED");

    const claimToken = await claimTokenForGate(gateToken, session.session_id);
    const claimHash = await sha256Hex(claimToken);
    const claimWindowSeconds = clampSeconds(cfg.free_claim_window_seconds, 180, 30, 600);
    const claimExpiresAt = minIsoDeadline(Date.now() + claimWindowSeconds * 1000, session.expires_at);
    await updateSession(db, session.session_id, {
      status: "gate_ok",
      gate_ok_at: new Date().toISOString(),
      pass2_ok_at: passNo === 2 ? new Date().toISOString() : session.pass2_ok_at ?? null,
      passes_completed: requiresDoubleGate ? 2 : 1,
      current_pass: passNo,
      claim_token_hash: claimHash,
      claim_expires_at: claimExpiresAt,
      last_error: null,
    });
    await logGate(db, { ...baseLog, event_code: "gate_ok_tokenized", detail: { ...(baseLog.detail as any), next: "CLAIM" } });
    return json({ ok: true, next: "CLAIM", session_id: session.session_id, claim_token: claimToken, claim_url: "/free/claim", claim_expires_at: claimExpiresAt }, 200);
  }

  // Legacy fallback for already-open old browser tabs. New flow should always use gate_token.
  const passNo = passNoFromBody;
  const sessionId = sessionIdFromBody;
  if (!sessionId || !outToken) return await deny("INVALID_SESSION");
  const outHash = await sha256Hex(outToken);
  const { data: session, error: sessionError } = await db.from("licenses_free_sessions").select("*").eq("session_id", sessionId).maybeSingle();
  if (sessionError) return await deny("SESSION_LOAD_FAILED", { detail: sessionError.message });
  if (!session) return await deny("SESSION_NOT_FOUND");
  baseLog.key_type_code = session.key_type_code ?? null;

  if (session.closed_at || String(session.status ?? "").toLowerCase() === "closed") return await deny("SESSION_CLOSED");
  if (session.revealed_at || String(session.status ?? "").toLowerCase() === "revealed") return await deny("ALREADY_REVEALED");
  if (secondsUntil(session.expires_at) <= 0 || (session.out_expires_at && secondsUntil(session.out_expires_at) <= 0)) return await deny("SESSION_EXPIRED");
  const acceptedOutHashes = [text(session.out_token_hash, 128), text(session.out_token_hash_pass2, 128)].filter(Boolean);
  if (acceptedOutHashes.length && !acceptedOutHashes.includes(outHash)) return await deny("OUT_TOKEN_MISMATCH");

  const requireIp = Boolean(cfg.free_gate_require_ip_match ?? false);
  const requireUa = Boolean(cfg.free_gate_require_ua_match ?? false);
  if (requireIp && text(session.ip_hash, 128) && text(session.ip_hash, 128) !== ipHash) return await deny("DEVICE_MISMATCH", { field: "ip" });
  if (requireUa && text(session.ua_hash, 128) && text(session.ua_hash, 128) !== uaHash) return await deny("DEVICE_MISMATCH", { field: "ua" });
  if (fpHash && text(session.fingerprint_hash, 128) && text(session.fingerprint_hash, 128) !== fpHash) return await deny("DEVICE_MISMATCH", { field: "fingerprint" });

  const startedAtMs = Date.parse(String(passNo === 2 ? session.pass2_started_at ?? session.started_at ?? session.created_at : session.started_at ?? session.created_at ?? ""));
  const requiredWait = Math.max(0, Number(passNo === 2 ? cfg.free_min_delay_seconds_pass2 : cfg.free_min_delay_seconds) || 0, Boolean(cfg.free_gate_antibypass_enabled ?? false) ? Number(cfg.free_gate_antibypass_seconds ?? 0) || 0 : 0);
  if (requiredWait > 0 && Number.isFinite(startedAtMs)) {
    const elapsed = Math.floor((Date.now() - startedAtMs) / 1000);
    if (elapsed < requiredWait) {
      await updateSession(db, sessionId, { status: "closed", closed_at: new Date().toISOString(), out_expires_at: new Date().toISOString(), last_error: "GATE_TOO_EARLY" });
      return await deny("GATE_TOO_EARLY", { wait_seconds: requiredWait - elapsed, required_seconds: requiredWait, elapsed_seconds: elapsed });
    }
  }

  let requiresDoubleGate = false;
  if (session.key_type_code) {
    try {
      const { data: keyType } = await db.from("licenses_free_key_types").select("requires_double_gate").eq("code", session.key_type_code).maybeSingle();
      requiresDoubleGate = Boolean((keyType as any)?.requires_double_gate ?? false);
    } catch { /* ignore */ }
  }

  if (requiresDoubleGate && passNo === 1) {
    let next;
    try { next = await createNextGateToken(db, cfg, session, 2, { ipHash, uaHash, fpHash }); }
    catch (error) { return await deny("PASS2_SHORTLINK_FAILED", { detail: String((error as any)?.message ?? error) }); }
    await updateSession(db, sessionId, { status: "waiting_pass2", passes_required: 2, passes_completed: 1, current_pass: 2, pass1_ok_at: new Date().toISOString(), gate_ok_at: new Date().toISOString(), provider_id_pass2: next.provider?.id ?? null, last_error: null });
    return json({ ok: true, next: "PASS2", outbound_url: next.outboundUrl, gate_url: next.gateUrl, min_delay_seconds: next.delay, gate_token_life_seconds: next.gateLifeSeconds }, 200);
  }

  const claimToken = randomToken("clm");
  const claimHash = await sha256Hex(claimToken);
  const claimWindowSeconds = clampSeconds(cfg.free_claim_window_seconds, 180, 30, 600);
  const claimExpiresAt = minIsoDeadline(Date.now() + claimWindowSeconds * 1000, session.expires_at);
  await updateSession(db, sessionId, { status: "gate_ok", gate_ok_at: new Date().toISOString(), claim_token_hash: claimHash, claim_expires_at: claimExpiresAt, last_error: null });
  await logGate(db, { ...baseLog, event_code: "gate_ok_legacy", detail: { ...(baseLog.detail as any), next: "CLAIM" } });
  return json({ ok: true, next: "CLAIM", session_id: sessionId, claim_token: claimToken, claim_url: "/free/claim", claim_expires_at: claimExpiresAt }, 200);
});
