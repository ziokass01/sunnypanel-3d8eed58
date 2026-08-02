import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildGtrafficApiUrl,
  buildGtrafficBrowserUrl,
  isGtrafficBlockedResponse,
  isGtrafficEdgeIpBlock,
  isQuotaExhaustedError,
  normalizeShortlinkMode,
  orderedProvidersForPass,
  parseGtrafficResponse,
  providerIsExhaustedToday,
  type ShortlinkChannel,
  type ProviderShortenResult,
  vietnamDate,
} from "../_shared/gtraffic.ts";

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
  const rendered = template
    .replaceAll("{url_enc}", encUrl)
    .replaceAll("{url}", gateUrl)
    .replaceAll("{token}", encToken);
  if (!/[?&](url|u|link|target)=/i.test(rendered) && !template.includes("{url") && !/^https?:\/\//i.test(rendered)) return "";
  return rendered;
}

function normalizeProviderApiBase(kind: string, rawApi: string) {
  let api = String(rawApi || "").trim();
  if (!api) return "";
  if (kind !== "link4m") return api;

  // Link4M currently documents /api-shorten/v2. Older admin rows often contain
  // /api-shorten or /api-shorten/; normalize those without touching token/url templates.
  api = api.replace(/(https?:\/\/[^/?#]*link4m\.(?:co|com)\/api-shorten)\/?(?=([?#]|$))/i, "$1/v2");
  api = api.replace(/(\/api-shorten\/v2)\/+([?#]|$)/i, "$1$2");
  return api;
}

function isCloudflareChallenge(raw: string) {
  const value = String(raw || "").toLowerCase();
  return value.includes("<title>just a moment")
    || value.includes("challenge-platform")
    || value.includes("cf-chl-")
    || value.includes("cloudflare ray id")
    || value.includes("enable javascript and cookies to continue");
}

function isHtmlResponse(raw: string, contentType = "") {
  const value = String(raw || "").trim().toLowerCase();
  const type = String(contentType || "").toLowerCase();
  return type.includes("text/html") || value.startsWith("<!doctype html") || value.startsWith("<html");
}

function safeProviderError(error: unknown) {
  const raw = String((error as any)?.message ?? error ?? "SHORTLINK_FAILED");
  if (isCloudflareChallenge(raw)) return "LINK4M_CLOUDFLARE_CHALLENGE";
  if (isHtmlResponse(raw)) return "SHORTLINK_PROVIDER_HTML_RESPONSE";
  return raw
    .replace(/([?&](?:apikey|api|token|tokenUser)=)[^&\s]+/gi, "$1***")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

async function fetchProviderResponse(url: string, headers: Record<string, string>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      headers,
      redirect: "follow",
      signal: controller.signal,
    });
    const raw = await res.text();
    let data: any = null;
    try { data = JSON.parse(raw); } catch { data = null; }
    return { res, data, raw };
  } catch (error) {
    if ((error as any)?.name === "AbortError") throw new Error("SHORTLINK_TIMEOUT");
    throw new Error(`SHORTLINK_FETCH_FAILED: ${String((error as any)?.message ?? error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function readJsonOrText(url: string, providerKind = "custom") {
  const common = {
    "accept": "application/json,text/plain,*/*",
    "cache-control": "no-cache",
    "pragma": "no-cache",
  };
  const profiles: Array<Record<string, string>> = providerKind === "link4m"
    ? [
      {
        ...common,
        "user-agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
        "accept-language": "en-US,en;q=0.9,vi;q=0.8",
        "referer": "https://my.link4m.com/",
      },
      {
        ...common,
        "user-agent": "SunnyPanel-FreeKey/1.2",
      },
    ]
    : [{ ...common, "user-agent": "SunnyPanel-FreeKey/1.2" }];

  let lastError: Error | null = null;
  for (const headers of profiles) {
    const { res, data, raw } = await fetchProviderResponse(url, headers);
    const contentType = res.headers.get("content-type") || "";

    if (isCloudflareChallenge(raw)) {
      lastError = new Error("LINK4M_CLOUDFLARE_CHALLENGE");
      continue;
    }
    if (isHtmlResponse(raw, contentType) && !data) {
      lastError = new Error("SHORTLINK_PROVIDER_HTML_RESPONSE");
      continue;
    }
    if (!res.ok) {
      if (providerKind === "gtraffic" && isGtrafficBlockedResponse(res.status, data)) {
        throw new Error("GTRAFFIC_EDGE_IP_BLOCKED");
      }
      const reason = String(data?.message || data?.error || `HTTP_${res.status}`).trim();
      throw new Error(reason || `HTTP_${res.status}`);
    }
    return { data, raw };
  }

  throw lastError ?? new Error("SHORTLINK_RESPONSE_INVALID");
}
function extractShortUrl(data: any, raw: string) {
  const candidates = [
    data?.shortenedUrl,
    data?.shortenedURL,
    data?.shortened_url,
    data?.shortUrl,
    data?.short_url,
    data?.url,
    data?.html,
    data?.short,
    data?.result?.shortenedUrl,
    data?.result?.shortened_url,
    data?.result?.url,
    data?.result,
    data?.data?.shortenedUrl,
    data?.data?.shortenedURL,
    data?.data?.shortened_url,
    data?.data?.shortUrl,
    data?.data?.short_url,
    data?.data?.url,
    raw,
  ];
  for (const c of candidates) {
    const v = String(c ?? "").trim().replace(/^['"]|['"]$/g, "");
    if (/^https?:\/\//i.test(v)) return v;
  }
  return "";
}

async function shortenWithProvider(provider: any, gateUrl: string) {
  const kind = text(provider?.provider || "custom", 32).toLowerCase() || "custom";
  const token = text(provider?.api_token_secret, 4096);
  const rawApiUrl = text(provider?.api_url_template, 4096);
  const apiUrl = normalizeProviderApiBase(kind, rawApiUrl);
  if (kind === "none") return { outboundUrl: gateUrl } satisfies ProviderShortenResult;

  const providerHint = [
  kind,
  text(provider?.name, 128),
  text(provider?.note, 512),
  rawApiUrl,
  apiUrl,
].join(" ").toLowerCase();
const isLink4M = providerHint.includes("link4m");

let requestUrl = "";
if (isLink4M) {
  if (!token) throw new Error("SHORTLINK_TOKEN_MISSING");
  // Several legacy Link4M rows were saved under another provider kind.
  // Detect them by all row metadata before traffic68/custom handling so
  // round-robin cannot alternate between a working /st row and an old
  // server-side api-shorten row that Cloudflare challenges.
  const outbound = new URL("https://link4m.co/st");
  outbound.searchParams.set("api", token);
  outbound.searchParams.set("url", gateUrl);
  return { outboundUrl: outbound.toString() } satisfies ProviderShortenResult;
}
if (kind === "gtraffic") {
  if (!token) throw new Error("SHORTLINK_TOKEN_MISSING");
  const endpoint = buildGtrafficApiUrl(apiUrl, token, gateUrl);
  try {
    const { data } = await readJsonOrText(endpoint, kind);
    const shortBaseUrl = Deno.env.get("GTRAFFIC_SHORT_BASE_URL") || "https://gtraffic.io";
    return parseGtrafficResponse(data, shortBaseUrl);
  } catch (error) {
    if (!isGtrafficEdgeIpBlock(error)) throw error;
    const browserBaseUrl = Deno.env.get("GTRAFFIC_BROWSER_BASE_URL") || "https://gtraffic.io/st";
    return {
      outboundUrl: buildGtrafficBrowserUrl(browserBaseUrl, token, gateUrl),
      quotaDate: vietnamDate(),
      browserBridge: true,
    } satisfies ProviderShortenResult;
  }
}
if (kind === "traffic68") {
  const base = apiUrl || "https://traffic68.com/api/quicklink/st";
  return {
    outboundUrl: `${base}${base.includes("?") ? "&" : "?"}api=${encodeURIComponent(token)}&url=${encodeURIComponent(gateUrl)}`,
  } satisfies ProviderShortenResult;
}
if (kind === "nhapma") {
    const base = apiUrl || "https://service.nhapma.com/api";
    requestUrl = renderTemplate(base.includes("{url") || base.includes("{token") ? base : `${base}${base.includes("?") ? "&" : "?"}token={token}&url={url_enc}`, gateUrl, token);
  } else if (kind === "layma") {
    const base = apiUrl || "https://api.layma.net/api/admin/shortlink/quicklink";
    requestUrl = renderTemplate(base.includes("{url") || base.includes("{token") ? base : `${base}${base.includes("?") ? "&" : "?"}tokenUser={token}&format=json&url={url_enc}`, gateUrl, token);
  } else {
    requestUrl = renderTemplate(apiUrl, gateUrl, token);
  }

  if (!requestUrl) throw new Error("SHORTLINK_TEMPLATE_INVALID");
  if (!token && /\{token\}|apikey=|api=|token=|tokenUser=/i.test(apiUrl || requestUrl)) throw new Error("SHORTLINK_TOKEN_MISSING");

  // A manually-created short URL can be used as a static fallback. This is
  // intentionally treated as a browser destination, not fetched by the Edge
  // Function (fetching it would follow the redirect and return HTML).
  const isApiRequest = /api-shorten|\/api(\/|\?|$)|format=json|[?&](?:apikey|api|token|tokenUser)=/i.test(requestUrl);
  const hasTemplateToken = /\{(?:url|url_enc|token)\}/i.test(requestUrl);
  if ((kind === "custom" || kind === "link4m") && /^https?:\/\//i.test(requestUrl) && !isApiRequest && !hasTemplateToken) {
    return { outboundUrl: requestUrl } satisfies ProviderShortenResult;
  }

  // If admin intentionally configured a browser quick-link template, allow it to be returned directly.
  if (/\/st\?/i.test(requestUrl) && !isApiRequest) return { outboundUrl: requestUrl } satisfies ProviderShortenResult;

  const { data, raw } = await readJsonOrText(requestUrl, kind);
  const shortUrl = extractShortUrl(data, raw);
  if (!shortUrl) throw new Error(String(data?.message || data?.error || "SHORTLINK_RESPONSE_INVALID"));
  return { outboundUrl: shortUrl } satisfies ProviderShortenResult;
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
async function loadProviders(db: any, passNo: number, channel: ShortlinkChannel) {
  const res = await db.from("licenses_free_shortlink_providers")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (res.error) throw res.error;
  return orderedProvidersForPass((res.data ?? []) as any[], passNo, channel)
    .filter((provider) => !providerIsExhaustedToday(provider));
}
function fallbackProviderFromSettings(cfg: any, passNo: number) {
  const template = text(passNo === 2 ? (cfg.free_outbound_url_pass2 || cfg.free_outbound_url) : cfg.free_outbound_url, 4096);
  if (!template) return null;
  if (/api-shorten|manager\.gtraffic\.io|\{token\}|[?&](?:apikey|api|token|tokenUser)=/i.test(template)) return null;
  return { id: null, name: passNo === 2 ? "Legacy Pass2" : "Legacy Pass1", provider: "custom", api_url_template: template, api_token_secret: "", pass_scope: passNo === 2 ? "pass2" : "pass1", sort_order: 9999, source: "settings_legacy" };
}
async function chooseProvider(db: any, cfg: any, passNo: number, channel: ShortlinkChannel) {
  let providers: any[] = [];
  try { providers = await loadProviders(db, passNo, channel); } catch { providers = []; }
  if (!providers.length) {
    if (channel === "secondary") throw new Error("SECONDARY_SHORTLINK_NOT_READY");
    const fb = fallbackProviderFromSettings(cfg, passNo);
    if (fb) return fb;
    throw new Error("SHORTLINK_PROVIDER_MISSING");
  }

  const mode = normalizeShortlinkMode(channel === "secondary" ? cfg.free_secondary_shortlink_mode : cfg.free_shortlink_mode);
  const lastId = text(channel === "secondary"
    ? (passNo === 2 ? cfg.free_secondary_last_provider_id_pass2 : cfg.free_secondary_last_provider_id_pass1)
    : (passNo === 2 ? cfg.free_shortlink_last_provider_id_pass2 : cfg.free_shortlink_last_provider_id_pass1), 64);
  let selected: any;

  if (mode === "priority_failover") {
    selected = providers[0];
    if (!selected) {
      const fallback = fallbackProviderFromSettings(cfg, passNo);
      if (fallback) return fallback;
      throw new Error("ALL_SHORTLINK_PROVIDERS_EXHAUSTED_TODAY");
    }
  } else if (mode === "random") {
    let pool = providers;
    if (lastId && providers.length > 1) pool = providers.filter((p) => String(p.id) !== lastId);
    selected = pool[Math.floor(Math.random() * pool.length)] ?? providers[0];
  } else {
    const idxRaw = Number(channel === "secondary"
      ? (passNo === 2 ? cfg.free_secondary_next_index_pass2 : cfg.free_secondary_next_index_pass1)
      : (passNo === 2 ? cfg.free_shortlink_next_index_pass2 : cfg.free_shortlink_next_index_pass1));
    const idx = Number.isFinite(idxRaw) ? Math.max(0, Math.floor(idxRaw)) : 0;
    selected = providers[idx % providers.length] ?? providers[0];
    const next = (idx + 1) % providers.length;
    const patch: Record<string, unknown> = channel === "secondary"
      ? (passNo === 2 ? { free_secondary_next_index_pass2: next } : { free_secondary_next_index_pass1: next })
      : (passNo === 2 ? { free_shortlink_next_index_pass2: next } : { free_shortlink_next_index_pass1: next });
    try { await db.from("licenses_free_settings").update(patch).eq("id", 1); } catch { /* ignore */ }
  }

  if (selected?.id) {
    const patch: Record<string, unknown> = channel === "secondary"
      ? (passNo === 2 ? { free_secondary_last_provider_id_pass2: selected.id } : { free_secondary_last_provider_id_pass1: selected.id })
      : (passNo === 2 ? { free_shortlink_last_provider_id_pass2: selected.id } : { free_shortlink_last_provider_id_pass1: selected.id });
    try { await db.from("licenses_free_settings").update(patch).eq("id", 1); } catch { /* ignore */ }
  }
  return selected;
}

async function providerCandidates(db: any, cfg: any, passNo: number, selected: any, channel: ShortlinkChannel) {
  let providers: any[] = [];
  try { providers = await loadProviders(db, passNo, channel); } catch { providers = []; }
  const out: any[] = [];
  const seen = new Set<string>();
  const mode = normalizeShortlinkMode(channel === "secondary" ? cfg.free_secondary_shortlink_mode : cfg.free_shortlink_mode);
  const push = (provider: any) => {
    if (!provider) return;
    if (mode === "priority_failover" && providerIsExhaustedToday(provider)) return;
    const key = provider?.id
      ? `id:${String(provider.id)}`
      : `cfg:${text(provider?.provider, 32)}:${text(provider?.api_url_template, 512)}:${text(provider?.api_token_secret, 64)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(provider);
  };
  push(selected);
  for (const provider of providers) push(provider);
  return out;
}

async function markProviderFailure(db: any, provider: any, error: unknown) {
  if (!provider?.id) return;
  const message = safeProviderError(error);
  const patch: Record<string, unknown> = {
    last_error: message,
    fail_count: Math.max(0, Number(provider?.fail_count ?? 0)) + 1,
  };
  if (text(provider?.provider, 32).toLowerCase() === "gtraffic" && isQuotaExhaustedError(error)) {
    patch.quota_remaining = 0;
    patch.quota_date = vietnamDate();
  }
  try {
    await db.from("licenses_free_shortlink_providers").update(patch).eq("id", provider.id);
  } catch { /* ignore */ }
}

async function markProviderSuccess(db: any, provider: any, passNo: number, result: ProviderShortenResult, channel: ShortlinkChannel) {
  if (!provider?.id) return;
  const providerPatch: Record<string, unknown> = {
    last_used_at: new Date().toISOString(),
    last_error: null,
    fail_count: 0,
  };
  if (text(provider?.provider, 32).toLowerCase() === "gtraffic" && result.quotaRemaining !== null && result.quotaRemaining !== undefined) {
    providerPatch.quota_remaining = result.quotaRemaining;
    providerPatch.quota_date = result.quotaDate || vietnamDate();
  }
  try {
    await db.from("licenses_free_shortlink_providers").update(providerPatch).eq("id", provider.id);
  } catch { /* ignore */ }
  const patch: Record<string, unknown> = channel === "secondary"
    ? (passNo === 2 ? { free_secondary_last_provider_id_pass2: provider.id } : { free_secondary_last_provider_id_pass1: provider.id })
    : (passNo === 2 ? { free_shortlink_last_provider_id_pass2: provider.id } : { free_shortlink_last_provider_id_pass1: provider.id });
  try { await db.from("licenses_free_settings").update(patch).eq("id", 1); } catch { /* ignore */ }
}

async function shortenWithFailover(db: any, cfg: any, passNo: number, gateUrl: string, channel: ShortlinkChannel) {
  const failures: string[] = [];
  let selected: any = null;
  let candidates: any[] = [];

  try {
    selected = await chooseProvider(db, cfg, passNo, channel);
    candidates = await providerCandidates(db, cfg, passNo, selected, channel);
  } catch (error) {
    const message = safeProviderError(error);
    failures.push(`provider-config: ${message}`);
    throw error;
  }

  for (const provider of candidates) {
    try {
      const result = await shortenWithProvider(provider, gateUrl);
      const outboundUrl = result.outboundUrl;
      if (!outboundUrl) throw new Error("SHORTLINK_RESPONSE_EMPTY");
      await markProviderSuccess(db, provider, passNo, result, channel);
      return { provider, outboundUrl, degraded: false, failures: [] as string[] };
    } catch (error) {
      const message = safeProviderError(error);
      failures.push(`${text(provider?.name || provider?.provider || "provider", 80)}: ${message}`);
      await markProviderFailure(db, provider, error);
    }
  }

  // Fail closed: never expose the raw gate URL when every shortener fails.
  throw new Error(`ALL_SHORTLINK_PROVIDERS_FAILED${failures.length ? ` | ${failures.join(" | ")}` : ""}`);
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
  const linkChannel: ShortlinkChannel = text(body.link_channel, 16).toLowerCase() === "secondary" ? "secondary" : "primary";
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
  if (linkChannel === "primary" && cfg.free_enabled === false) return await deny("FREE_DISABLED", { msg: cfg.free_disabled_message || "FREE_DISABLED" });
  if (linkChannel === "secondary" && cfg.free_secondary_enabled === false) return await deny("SECONDARY_SHORTLINK_NOT_READY");

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

  const requiresDoubleGate = Boolean(keyType.requires_double_gate ?? false);
  if (linkChannel === "secondary") {
    const pass1Providers = await loadProviders(db, 1, "secondary").catch(() => [] as any[]);
    const pass2Providers = requiresDoubleGate ? await loadProviders(db, 2, "secondary").catch(() => [] as any[]) : pass1Providers;
    if (!pass1Providers.length || (requiresDoubleGate && !pass2Providers.length)) {
      return await deny("SECONDARY_SHORTLINK_NOT_READY");
    }
  }

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
  let effectiveMinDelay = minDelay;
  let activateAfterAt = new Date(nowMs + minDelay * 1000).toISOString();
  const gateExpiresAt = new Date(nowMs + (minDelay + gateLifeSeconds) * 1000).toISOString();

  let provider: any;
  let gateUrl = "";
  let outboundUrl = "";
  let shortlinkDegraded = false;
  let shortlinkFailures: string[] = [];
  try {
    gateUrl = gateUrlFromToken(gateToken, 1);
    const shortened = await shortenWithFailover(db, cfg, 1, gateUrl, linkChannel);
    provider = shortened.provider;
    outboundUrl = shortened.outboundUrl;
    shortlinkDegraded = Boolean(shortened.degraded);
    shortlinkFailures = Array.isArray(shortened.failures) ? shortened.failures : [];
    if (shortlinkDegraded) {
      // The direct emergency URL does not contain an external shortener delay.
      // Activate it immediately so opening /free/gate cannot burn the token as
      // GATE_TOO_EARLY. The degraded state is logged and returned to the UI.
      effectiveMinDelay = 0;
      activateAfterAt = nowIso;
    }
  } catch (error) {
    if (linkChannel === "secondary" && safeProviderError(error).includes("SECONDARY_SHORTLINK_NOT_READY")) {
      return await deny("SECONDARY_SHORTLINK_NOT_READY");
    }
    return await deny("SHORTLINK_CREATE_FAILED", { detail: safeProviderError(error) });
  }
  if (!outboundUrl) return await deny("OUTBOUND_URL_TEMPLATE_INVALID", { gate_url: gateUrl });

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
    shortlink_channel: linkChannel,
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
      shortlink_channel: linkChannel,
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

  await logGate(db, {
    ...baseLog,
    session_id: sessionId,
    pass_no: 1,
    event_code: shortlinkDegraded ? "start_ok_tokenized_degraded" : "start_ok_tokenized",
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
      shortlink_channel: linkChannel,
      shortlink_degraded: shortlinkDegraded,
      shortlink_failures: shortlinkFailures.length ? shortlinkFailures : undefined,
      session_ttl_seconds: sessionTtlSeconds,
      gate_life_seconds: gateLifeSeconds,
      min_delay_seconds: effectiveMinDelay,
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
    shortlink_degraded: shortlinkDegraded,
    shortlink_failures: shortlinkFailures.length ? shortlinkFailures : undefined,
    passes_required: requiresDoubleGate ? 2 : 1,
    min_delay_seconds: effectiveMinDelay,
    min_delay_seconds_pass2: Math.max(0, Number(cfg.free_min_delay_enabled === false ? 0 : cfg.free_min_delay_seconds_pass2 ?? minDelay) || 0),
    gate_token_life_seconds: gateLifeSeconds,
    trace_id: traceId,
    expires_at: expiresAt,
    session_ttl_seconds: sessionTtlSeconds,
    provider: provider?.name ?? null,
  }, 200);
});
