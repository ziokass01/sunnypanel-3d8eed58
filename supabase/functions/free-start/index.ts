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
  const encUrl = encodeURIComponent(gateUrl);
  const encToken = encodeURIComponent(apiToken);
  let rendered = template
    .replaceAll("{url_enc}", encUrl)
    .replaceAll("{url}", gateUrl)
    .replaceAll("{token}", encToken);
  if (!/[?&](url|u|link|target)=/i.test(rendered) && !template.includes("{url") && !/^https?:\/\//i.test(rendered)) return "";
  return rendered;
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
    requestUrl = `${base}${base.includes("?") ? "&" : "?"}api=${encodeURIComponent(token)}&url=${encodeURIComponent(gateUrl)}`;
    // Traffic68 quicklink is itself the outbound URL in the reference implementation.
    return requestUrl;
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
  if (!token && /\{token\}|api=|token=|tokenUser=/i.test(apiUrl || requestUrl)) throw new Error("SHORTLINK_TOKEN_MISSING");

  // If admin intentionally configured a browser quick-link template, allow it to be returned directly.
  if (/\/st\?/i.test(requestUrl) && !/api-shorten|\/api(\/|\?|$)|format=json/i.test(requestUrl)) return requestUrl;

  const { data, raw } = await readJsonOrText(requestUrl);
  const shortUrl = extractShortUrl(data, raw);
  if (!shortUrl) throw new Error(String(data?.message || data?.error || "SHORTLINK_RESPONSE_INVALID"));
  return shortUrl;
}
async function logGate(db: any, row: Record<string, unknown>) {
  try { await db.from("licenses_free_gate_logs").insert(row); } catch { /* ignore */ }
}
async function closeStale(db: any, ipHash: string, fpHash: string) {
  const cutoff = new Date(Date.now() - 45 * 60 * 1000).toISOString();
  try {
    await db.from("licenses_free_sessions").update({ status: "closed", closed_at: new Date().toISOString(), last_error: "AUTO_CLOSE_STALE_PENDING" })
      .in("status", ["started", "waiting", "waiting_pass2", "gate_ok"])
      .lt("created_at", cutoff)
      .is("revealed_at", null);
  } catch { /* ignore */ }
  try {
    if (fpHash) {
      await db.from("licenses_free_sessions").update({ status: "closed", closed_at: new Date().toISOString(), last_error: "AUTO_CLOSE_OLD_SAME_FP" })
        .eq("fingerprint_hash", fpHash)
        .in("status", ["started", "waiting", "waiting_pass2"])
        .lt("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
        .is("revealed_at", null);
    }
  } catch { /* ignore */ }
  void ipHash;
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
async function chooseProvider(db: any, cfg: any, passNo: number) {
  let providers: any[] = [];
  try { providers = await loadProviders(db, passNo); } catch { providers = []; }
  if (!providers.length) {
    const fb = fallbackProviderFromSettings(cfg, passNo);
    if (fb) return fb;
    throw new Error("SHORTLINK_PROVIDER_MISSING");
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
    const patch: Record<string, unknown> = passNo === 2
      ? { free_shortlink_last_provider_id_pass2: selected.id }
      : { free_shortlink_last_provider_id_pass1: selected.id };
    try { await db.from("licenses_free_settings").update(patch).eq("id", 1); } catch { /* ignore */ }
  }
  return selected;
}
function isMissingColumn(error: any) {
  const msg = String(error?.message ?? error ?? "").toLowerCase();
  return msg.includes("column") || msg.includes("schema cache") || msg.includes("could not find") || msg.includes("does not exist");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED", msg: "METHOD_NOT_ALLOWED" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) return json({ ok: false, code: "FREE_NOT_READY", msg: "FREE_NOT_READY" }, 503);

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return json({ ok: false, code: "BAD_JSON", msg: "BAD_JSON" }, 200);

  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const keyTypeCode = text(body.key_type_code || body.keyTypeCode, 128);
  const appCode = text(body.app_code || "free-fire", 64) || "free-fire";
  const packageCode = text(body.package_code, 128) || null;
  const creditCode = text(body.credit_code, 128) || null;
  const walletKind = text(body.wallet_kind, 32) || null;
  const fingerprint = text(body.fingerprint || req.headers.get("x-fp"), 512);
  const ip = getIp(req);
  const ua = req.headers.get("user-agent") ?? "";
  const ipHash = await sha256Hex(ip || "0.0.0.0");
  const uaHash = await sha256Hex(ua);
  const fpHash = fingerprint ? await sha256Hex(fingerprint) : "";
  const traceId = "free-" + crypto.randomUUID();
  const baseLog = { ip_hash: ipHash, ua_hash: uaHash, fingerprint_hash: fpHash || null, key_type_code: keyTypeCode || null } as Record<string, unknown>;
  async function deny(code: string, extra: Record<string, unknown> = {}) {
    await logGate(db, { ...baseLog, event_code: code, detail: { route: "free-start", app_code: appCode, trace_id: traceId, ...extra } });
    return json({ ok: false, code, msg: code, trace_id: traceId, ...extra }, 200);
  }

  if (!keyTypeCode) return await deny("MISSING_KEY_TYPE");

  const { data: settings, error: settingsErr } = await db.from("licenses_free_settings").select("*").eq("id", 1).maybeSingle();
  if (settingsErr) return await deny("FREE_SETTINGS_LOAD_FAILED", { detail: settingsErr.message });
  const cfg = (settings ?? {}) as any;
  if (cfg.free_enabled === false) return await deny("FREE_DISABLED", { msg: cfg.free_disabled_message || "FREE_DISABLED" });

  await closeStale(db, ipHash, fpHash);

  let keyType: any = null;
  try {
    const byApp = await db.from("licenses_free_key_types").select("*").eq("code", keyTypeCode).eq("app_code", appCode).maybeSingle();
    keyType = byApp.data;
    if (!keyType) {
      const anyApp = await db.from("licenses_free_key_types").select("*").eq("code", keyTypeCode).maybeSingle();
      keyType = anyApp.data;
    }
  } catch (error) {
    return await deny("KEY_TYPE_LOAD_FAILED", { detail: String((error as any)?.message ?? error) });
  }
  if (!keyType || keyType.enabled === false) return await deny("KEY_TYPE_DISABLED");

  const waitingLimit = Math.max(1, Number(cfg.free_session_waiting_limit ?? 2) || 2);
  try {
    let pending = db.from("licenses_free_sessions").select("session_id", { count: "exact", head: true })
      .in("status", ["started", "waiting", "waiting_pass2", "gate_ok"])
      .is("revealed_at", null);
    if (fpHash) pending = pending.eq("fingerprint_hash", fpHash);
    else pending = pending.eq("ip_hash", ipHash);
    const { count } = await pending;
    if (Number(count ?? 0) >= waitingLimit) {
      await logGate(db, { ...baseLog, event_code: "SESSION_PENDING_LIMIT_SOFT", detail: { route: "free-start", count, waiting_limit: waitingLimit, trace_id: traceId } });
      return json({ ok: false, code: "SESSION_PENDING_LIMIT", msg: "Thiết bị này đang có nhiều phiên chờ. Hãy đóng các tab cũ hoặc chờ vài phút rồi thử lại.", wait_seconds: 300, trace_id: traceId }, 200);
    }
  } catch {
    await logGate(db, { ...baseLog, event_code: "PENDING_LIMIT_CHECK_SKIPPED", detail: { route: "free-start", trace_id: traceId } });
  }

  const sessionId = crypto.randomUUID();
  const outToken = randomToken("out");
  const outHash = await sha256Hex(outToken);
  const gateToken = randomToken("gt");
  const gateHash = await sha256Hex(gateToken);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const minDelay = Math.max(0, Number(cfg.free_min_delay_enabled === false ? 0 : cfg.free_min_delay_seconds ?? 0) || 0);
  const gateLifeSeconds = clampSeconds(cfg.free_gate_token_life_seconds, 600, 60, 1800);
  const claimWindowSeconds = clampSeconds(cfg.free_claim_window_seconds, 180, 30, 600);
  const configuredSessionTtl = clampSeconds(cfg.free_session_absolute_seconds, 900, 300, 3600);
  const neededTtl = minDelay + gateLifeSeconds + claimWindowSeconds + 120;
  const sessionTtlSeconds = Math.max(configuredSessionTtl, neededTtl);
  const expiresAt = new Date(nowMs + sessionTtlSeconds * 1000).toISOString();
  const outExpiresAt = expiresAt;
  const activateAfterAt = new Date(nowMs + minDelay * 1000).toISOString();
  const gateExpiresAt = new Date(nowMs + (minDelay + gateLifeSeconds) * 1000).toISOString();

  let provider: any;
  let gateUrl = "";
  let outboundUrl = "";
  try {
    provider = await chooseProvider(db, cfg, 1);
    gateUrl = gateUrlFromToken(gateToken, 1);
    outboundUrl = await shortenWithProvider(provider, gateUrl);
  } catch (error) {
    return await deny("SHORTLINK_CREATE_FAILED", { detail: String((error as any)?.message ?? error) });
  }
  if (!outboundUrl) return await deny("OUTBOUND_URL_TEMPLATE_INVALID", { gate_url: gateUrl });

  const requiresDoubleGate = Boolean(keyType.requires_double_gate ?? false);
  const fullPayload: Record<string, unknown> = {
    session_id: sessionId,
    key_type_code: keyTypeCode,
    duration_seconds: Math.max(0, Number(keyType.duration_seconds ?? 0) || 0),
    status: "waiting",
    started_at: nowIso,
    expires_at: expiresAt,
    out_token_hash: outHash,
    out_expires_at: outExpiresAt,
    ip_hash: ipHash,
    ua_hash: uaHash,
    fingerprint_hash: fpHash || ipHash,
    reveal_count: 0,
    last_error: null,
    app_code: appCode,
    package_code: packageCode,
    credit_code: creditCode,
    wallet_kind: walletKind,
    trace_id: traceId,
    passes_required: requiresDoubleGate ? 2 : 1,
    passes_completed: 0,
    current_pass: 1,
    gate_flow_version: "tokenized_v1",
    gate_token_life_seconds: gateLifeSeconds,
    provider_id_pass1: provider?.id ?? null,
  };
  const compatPayload: Record<string, unknown> = {
    session_id: sessionId,
    key_type_code: keyTypeCode,
    duration_seconds: Math.max(0, Number(keyType.duration_seconds ?? 0) || 0),
    status: "waiting",
    started_at: nowIso,
    expires_at: expiresAt,
    out_token_hash: outHash,
    out_expires_at: outExpiresAt,
    ip_hash: ipHash,
    ua_hash: uaHash,
    fingerprint_hash: fpHash || ipHash,
    reveal_count: 0,
    last_error: null,
  };

  let inserted = await db.from("licenses_free_sessions").insert(fullPayload);
  if (inserted.error && isMissingColumn(inserted.error)) inserted = await db.from("licenses_free_sessions").insert(compatPayload);
  if (inserted.error) return await deny("SESSION_CREATE_FAILED", { detail: inserted.error.message });

  try {
    const tokenInsert = await db.from("licenses_free_gate_tokens").insert({
      session_id: sessionId,
      pass_no: 1,
      token_hash: gateHash,
      status: "pending",
      activate_after_at: activateAfterAt,
      expires_at: gateExpiresAt,
      provider_id: provider?.id ?? null,
      short_url: outboundUrl,
      ip_hash: ipHash,
      ua_hash: uaHash,
      fingerprint_hash: fpHash || ipHash,
    });
    if (tokenInsert.error) throw tokenInsert.error;
  } catch (error) {
    await db.from("licenses_free_sessions").update({ status: "closed", closed_at: new Date().toISOString(), last_error: "GATE_TOKEN_CREATE_FAILED" }).eq("session_id", sessionId);
    return await deny("GATE_TOKEN_CREATE_FAILED", { detail: String((error as any)?.message ?? error) });
  }

  try {
    if (provider?.id) await db.from("licenses_free_shortlink_providers").update({ last_used_at: new Date().toISOString(), last_error: null }).eq("id", provider.id);
  } catch { /* ignore */ }

  await logGate(db, {
    ...baseLog,
    session_id: sessionId,
    pass_no: 1,
    event_code: "start_ok_tokenized",
    detail: {
      route: "free-start",
      app_code: appCode,
      trace_id: traceId,
      package_code: packageCode,
      credit_code: creditCode,
      wallet_kind: walletKind,
      provider_id: provider?.id ?? null,
      provider_name: provider?.name ?? null,
      provider_kind: provider?.provider ?? null,
      session_ttl_seconds: sessionTtlSeconds,
      gate_life_seconds: gateLifeSeconds,
      min_delay_seconds: minDelay,
    },
  });

  return json({
    ok: true,
    session_id: sessionId,
    out_token: outToken,
    gate_token: gateToken,
    outbound_url: outboundUrl,
    gate_url: gateUrl,
    outbound_url_pass2: null,
    gate_url_pass2: null,
    passes_required: requiresDoubleGate ? 2 : 1,
    min_delay_seconds: minDelay,
    min_delay_seconds_pass2: Math.max(0, Number(cfg.free_min_delay_enabled === false ? 0 : cfg.free_min_delay_seconds_pass2 ?? minDelay) || 0),
    gate_token_life_seconds: gateLifeSeconds,
    trace_id: traceId,
    expires_at: expiresAt,
    session_ttl_seconds: sessionTtlSeconds,
    provider: provider?.name ?? null,
  }, 200);
});
