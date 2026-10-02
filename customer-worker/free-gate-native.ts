// @ts-nocheck
import { createServiceClient } from "./supabase-rest.js";
import {
  buildGtrafficApiUrl,
  isGtrafficBlockedResponse,
  isGtrafficEdgeIpBlock,
  isQuotaExhaustedError,
  normalizeShortlinkMode,
  orderedProvidersForPass,
  parseGtrafficResponse,
  providerIsExhaustedToday,
  providerIsTemporarilyUnavailable,
  type ProviderShortenResult,
  type ShortlinkChannel,
  vietnamDate,
} from "./free-shared/gtraffic.js";

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
  return (req.headers.get("cf-connecting-ip") || "").trim();
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
function publicBase(env: any) {
  return String(env?.FREE_PUBLIC_BASE_URL || env?.PUBLIC_BASE_URL || "https://mityangho.id.vn").replace(/\/+$/, "");
}
function randomToken(prefix: string) {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const body = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${prefix}_${body}`;
}
function gateUrlFromToken(gateToken: string, passNo: number, env: any) {
  const url = new URL(`${publicBase(env)}/free/gate`);
  url.searchParams.set("t", gateToken);
  url.searchParams.set("p", String(passNo));
  return url.toString();
}

function outboundConcealsGateSecret(outboundUrl: string, gateUrl: string) {
  const outbound = String(outboundUrl ?? "").trim();
  const target = String(gateUrl ?? "").trim();
  if (!outbound || !target) return false;

  let gateToken = "";
  try {
    gateToken = new URL(target).searchParams.get("t") || "";
  } catch {
    return false;
  }

  let candidate = outbound;
  for (let i = 0; i < 4; i += 1) {
    if ((gateToken && candidate.includes(gateToken)) || candidate.includes(target)) return false;
    try {
      const decoded = decodeURIComponent(candidate);
      if (decoded === candidate) break;
      candidate = decoded;
    } catch {
      break;
    }
  }
  return true;
}
async function claimTokenForGate(gateToken: string, sessionId: string, env: any) {
  const secret = env?.FREE_CLAIM_SECRET || env?.SUPABASE_SERVICE_ROLE_KEY || env?.UPSTREAM_SERVICE_ROLE_KEY || "sunny-free-claim-v1";
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

function providerErrorPrefix(providerKind: string) {
  const normalized = String(providerKind || "provider").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return normalized || "PROVIDER";
}

function safeProviderError(error: unknown) {
  const raw = String((error as any)?.message ?? error ?? "SHORTLINK_FAILED");
  const trimmed = raw.trim();
  if (/^[A-Z0-9_]+_CLOUDFLARE_CHALLENGE$/.test(trimmed)) return trimmed;
  if (isCloudflareChallenge(raw)) return "SHORTLINK_PROVIDER_CLOUDFLARE_CHALLENGE";
  if (isHtmlResponse(raw)) return "SHORTLINK_PROVIDER_HTML_RESPONSE";
  return raw
    .replace(/([?&](?:apikey|api|token|tokenUser)=)[^&\s]+/gi, "$1***")
    .replace(/gt_[A-Za-z0-9_-]{16,}/g, "gt_***")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

async function fetchProviderResponse(url: string, headers: Record<string, string>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { headers, redirect: "follow", signal: controller.signal });
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
  const normalizedProviderKind = String(providerKind || "custom").trim().toLowerCase();
  let profiles: Array<Record<string, string>>;

  if (normalizedProviderKind === "link4m") {
    profiles = [
      {
        ...common,
        "user-agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
        "accept-language": "en-US,en;q=0.9,vi;q=0.8",
        "referer": "https://my.link4m.com/",
      },
      { ...common, "user-agent": "SunnyPanel-FreeKey/1.2" },
    ];
  } else if (normalizedProviderKind === "ontops") {
    profiles = [
      { ...common, "user-agent": "SunnyPanel-FreeKey/1.3" },
      { ...common, "user-agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" },
      { ...common },
    ];
  } else if (normalizedProviderKind === "layma") {
    profiles = [
      { "accept": "application/json" },
      { ...common },
    ];
  } else {
    profiles = [{ ...common, "user-agent": "SunnyPanel-FreeKey/1.3" }];
  }

  let lastError: Error | null = null;
  for (const headers of profiles) {
    const { res, data, raw } = await fetchProviderResponse(url, headers);
    const contentType = res.headers.get("content-type") || "";
    if (isCloudflareChallenge(raw)) {
      lastError = new Error(`${providerErrorPrefix(providerKind)}_CLOUDFLARE_CHALLENGE`);
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
      if (normalizedProviderKind === "ontops" && res.status >= 500) {
        lastError = new Error(`HTTP_${res.status}`);
        continue;
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
    data?.shortLink,
    data?.short_link,
    data?.url,
    data?.html,
    data?.short,
    data?.result?.shortenedUrl,
    data?.result?.shortened_url,
    data?.result?.shortUrl,
    data?.result?.short_url,
    data?.result?.shortLink,
    data?.result?.short_link,
    data?.result?.url,
    data?.result,
    data?.data?.shortenedUrl,
    data?.data?.shortenedURL,
    data?.data?.shortened_url,
    data?.data?.shortUrl,
    data?.data?.short_url,
    data?.data?.shortLink,
    data?.data?.short_link,
    data?.data?.url,
    raw,
  ];
  for (const c of candidates) {
    const v = String(c ?? "").trim().replace(/^['"]|['"]$/g, "");
    if (/^https?:\/\//i.test(v)) return v;
  }
  return "";
}

function buildOntopsApiUrl(apiUrl: string, apiToken: string, gateUrl: string) {
  const endpoint = new URL(apiUrl || "https://api-management.ontops.link/api/public/create-short-link");
  endpoint.searchParams.set("apikey", apiToken);
  endpoint.searchParams.set("url", gateUrl);
  return endpoint.toString();
}
function parseOntopsResponse(data: any, shortBaseUrl = "https://ontops.link") {
  const id = String(data?.id ?? data?.data?.id ?? data?.result?.id ?? "").trim().slice(0, 128);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    const reason = String(data?.message ?? data?.error ?? "ONTOPS_RESPONSE_INVALID").trim().slice(0, 300);
    throw new Error(reason || "ONTOPS_RESPONSE_INVALID");
  }
  const base = String(shortBaseUrl || "https://ontops.link").trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(base)) throw new Error("ONTOPS_SHORT_BASE_INVALID");
  return { outboundUrl: `${base}/${encodeURIComponent(id)}` } satisfies ProviderShortenResult;
}

async function shortenWithProvider(provider: any, gateUrl: string, env: any) {
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
  // Browser quick-links expose their destination (including the gate secret).
  // Only return an opaque short URL created by the provider API.
  const base = apiUrl || "https://link4m.co/api-shorten/v2";
  requestUrl = renderTemplate(
    base.includes("{url") || base.includes("{token")
      ? base
      : `${base}${base.includes("?") ? "&" : "?"}api={token}&url={url_enc}`,
    gateUrl,
    token,
  );
  const { data, raw } = await readJsonOrText(requestUrl, "link4m");
  const shortUrl = extractShortUrl(data, raw);
  if (!shortUrl) throw new Error(String(data?.message || data?.error || "LINK4M_RESPONSE_INVALID"));
  return { outboundUrl: shortUrl } satisfies ProviderShortenResult;
}
if (kind === "ontops") {
  if (!token) throw new Error("SHORTLINK_TOKEN_MISSING");
  requestUrl = buildOntopsApiUrl(apiUrl, token, gateUrl);
  const { data } = await readJsonOrText(requestUrl, "ontops");
  const shortBaseUrl = env?.ONTOPS_SHORT_BASE_URL || "https://ontops.link";
  return parseOntopsResponse(data, shortBaseUrl);
}
if (kind === "gtraffic") {
  if (!token) throw new Error("SHORTLINK_TOKEN_MISSING");
  const endpoint = buildGtrafficApiUrl(apiUrl, token, gateUrl);
  try {
    const { data } = await readJsonOrText(endpoint, kind);
    const shortBaseUrl = env?.GTRAFFIC_SHORT_BASE_URL || "https://gtraffic.io";
    return parseGtrafficResponse(data, shortBaseUrl);
  } catch (error) {
    if (!isGtrafficEdgeIpBlock(error)) throw error;
    // Browser bridge URLs embed gateUrl and would disclose the gate token.
    throw new Error("GTRAFFIC_EDGE_IP_BLOCKED_OPAQUE_LINK_REQUIRED");
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
  if (/\/st\?/i.test(requestUrl) && !/api-shorten|\/api(\/|\?|$)|format=json/i.test(requestUrl)) return { outboundUrl: requestUrl } satisfies ProviderShortenResult;
  if (kind === "custom" && /^https?:\/\//i.test(requestUrl) && !/[?&](apikey|api|token|tokenUser|url|u|link|target)=/i.test(requestUrl)) {
    return { outboundUrl: requestUrl } satisfies ProviderShortenResult;
  }
  const { data, raw } = await readJsonOrText(requestUrl, kind);
  if (kind === "layma" && data?.success === false) {
    throw new Error("LAYMA_API_REJECTED");
  }
  const shortUrl = extractShortUrl(data, raw);
  if (!shortUrl) throw new Error(String(data?.message || data?.error || "SHORTLINK_RESPONSE_INVALID"));
  return { outboundUrl: shortUrl } satisfies ProviderShortenResult;
}
async function logGate(db: any, row: Record<string, unknown>) {
  try { await db.from("licenses_free_gate_logs").insert(row); } catch { /* ignore */ }
}
async function updateSession(db: any, sessionId: string, patch: Record<string, unknown>) {
  const { error } = await db.from("licenses_free_sessions").update(patch).eq("session_id", sessionId);
  return !error;
}
async function loadProviders(db: any, passNo: number, channel: ShortlinkChannel, excludeIds: string[] = []) {
  const res = await db.from("licenses_free_shortlink_providers")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (res.error) throw res.error;
  const excluded = new Set(excludeIds.map(String));
  return orderedProvidersForPass((res.data ?? []) as any[], passNo, channel)
    .filter((provider) => !providerIsExhaustedToday(provider) && !providerIsTemporarilyUnavailable(provider) && !excluded.has(String(provider?.id ?? "")));
}
function fallbackProviderFromSettings(cfg: any, passNo: number) {
  const template = text(passNo === 2 ? (cfg.free_outbound_url_pass2 || cfg.free_outbound_url) : cfg.free_outbound_url, 4096);
  if (!template) return null;
  if (/api-shorten|manager\.gtraffic\.io|\{token\}|[?&](?:apikey|api|token|tokenUser)=/i.test(template)) return null;
  return { id: null, name: passNo === 2 ? "Legacy Pass2" : "Legacy Pass1", provider: "custom", api_url_template: template, api_token_secret: "", pass_scope: passNo === 2 ? "pass2" : "pass1", sort_order: 9999, source: "settings_legacy" };
}
async function chooseProvider(db: any, cfg: any, passNo: number, channel: ShortlinkChannel, excludeIds: string[] = []) {
  let providers: any[] = [];
  try { providers = await loadProviders(db, passNo, channel, excludeIds); } catch { providers = []; }
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

async function providerCandidates(db: any, cfg: any, passNo: number, selected: any, channel: ShortlinkChannel, excludeIds: string[] = []) {
  let providers: any[] = [];
  try { providers = await loadProviders(db, passNo, channel, excludeIds); } catch { providers = []; }
  const mode = normalizeShortlinkMode(channel === "secondary" ? cfg.free_secondary_shortlink_mode : cfg.free_shortlink_mode);
  const out: any[] = [];
  const seen = new Set<string>();
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

async function configuredProviderDailyQuota(provider: any) {
  if (provider?.daily_quota_enabled === false) return 0;
  const value = Number(provider?.daily_quota_limit ?? 0);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

async function reserveProviderQuota(db: any, provider: any) {
  const limit = await configuredProviderDailyQuota(provider);
  if (!provider?.id || limit <= 0) return { allowed: true, reserved: false };

  const result = await db.rpc("reserve_free_shortlink_provider_quota", {
    p_provider_id: provider.id,
    p_today: vietnamDate(),
  });
  if (result.error) throw new Error("PROVIDER_QUOTA_RESERVE_FAILED");

  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return {
    allowed: row?.allowed === true,
    reserved: row?.allowed === true,
  };
}

async function releaseProviderQuota(db: any, provider: any) {
  const limit = await configuredProviderDailyQuota(provider);
  if (!provider?.id || limit <= 0) return;
  try {
    await db.rpc("release_free_shortlink_provider_quota", {
      p_provider_id: provider.id,
      p_today: vietnamDate(),
    });
  } catch {
    // Conservative failure: at most one local quota slot stays reserved.
  }
}

function shouldTemporarilyCoolDownProvider(provider: any, error: unknown) {
  if (text(provider?.provider, 32).toLowerCase() === "gtraffic") return false;
  const message = safeProviderError(error).toUpperCase();
  return message.includes("CLOUDFLARE_CHALLENGE")
    || message.includes("SHORTLINK_TIMEOUT")
    || message.includes("SHORTLINK_FETCH_FAILED")
    || message.includes("LAYMA_API_REJECTED");
}

async function markProviderFailure(db: any, provider: any, error: unknown) {
  if (!provider?.id) return;
  const patch: Record<string, unknown> = {
    last_error: safeProviderError(error),
    fail_count: Math.max(0, Number(provider?.fail_count ?? 0)) + 1,
  };
  if (isQuotaExhaustedError(error)) {
    patch.quota_remaining = 0;
    patch.quota_date = vietnamDate();
    const localLimit = await configuredProviderDailyQuota(provider);
    if (localLimit > 0) patch.quota_used_today = localLimit;
  }
  if (shouldTemporarilyCoolDownProvider(provider, error)) {
    patch.unavailable_until = new Date(Date.now() + 5 * 60 * 1000).toISOString();
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
    unavailable_until: null,
  };
  if (result.quotaRemaining !== null && result.quotaRemaining !== undefined) {
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

async function shortenWithFailover(db: any, cfg: any, passNo: number, gateUrl: string, channel: ShortlinkChannel, env: any, excludeIds: string[] = []) {
  const failures: string[] = [];
  let selected: any = null;
  let candidates: any[] = [];

  try {
    selected = await chooseProvider(db, cfg, passNo, channel, excludeIds);
    candidates = await providerCandidates(db, cfg, passNo, selected, channel, excludeIds);
  } catch (error) {
    const message = safeProviderError(error);
    failures.push(`provider-config: ${message}`);
    throw error;
  }

  for (const provider of candidates) {
    let quotaReserved = false;
    try {
      const quota = await reserveProviderQuota(db, provider);
      quotaReserved = quota.reserved;
      if (!quota.allowed) {
        const quotaError = new Error("PROVIDER_DAILY_QUOTA_EXHAUSTED");
        const quotaMessage = safeProviderError(quotaError);
        failures.push(`${text(provider?.name || provider?.provider || "provider", 80)}: ${quotaMessage}`);
        await markProviderFailure(db, provider, quotaError);
        continue;
      }

      const result = await shortenWithProvider(provider, gateUrl, env);
      const outboundUrl = result.outboundUrl;
      if (!outboundUrl) throw new Error("SHORTLINK_RESPONSE_EMPTY");
      if (!outboundConcealsGateSecret(outboundUrl, gateUrl)) {
        throw new Error("SHORTLINK_GATE_SECRET_EXPOSED");
      }
      await markProviderSuccess(db, provider, passNo, result, channel);
      return { provider, outboundUrl, degraded: false, failures: [] as string[] };
    } catch (error) {
      if (quotaReserved && !isQuotaExhaustedError(error)) {
        await releaseProviderQuota(db, provider);
      }
      const message = safeProviderError(error);
      failures.push(`${text(provider?.name || provider?.provider || "provider", 80)}: ${message}`);
      await markProviderFailure(db, provider, error);
    }
  }

  // Fail closed: a provider error must never expose the gate URL directly.
  throw new Error(`ALL_SHORTLINK_PROVIDERS_FAILED${failures.length ? ` | ${failures.join(" | ")}` : ""}`);
}

async function createNextGateToken(db: any, cfg: any, session: any, passNo: 1 | 2, hashes: { ipHash: string; uaHash: string; fpHash: string }, env: any, excludeIds: string[] = []) {
  const gateToken = randomToken("gt");
  const gateHash = await sha256Hex(gateToken);
  const antiDelay = cfg.free_gate_antibypass_enabled === true ? Math.max(0, Number(cfg.free_gate_antibypass_seconds) || 0) : 0;
  const configuredDelay = Math.max(antiDelay, Number(cfg.free_min_delay_enabled === false ? 0 : (passNo === 2 ? cfg.free_min_delay_seconds_pass2 : cfg.free_min_delay_seconds) ?? 0) || 0);
  const gateLifeSeconds = clampSeconds(cfg.free_gate_token_life_seconds ?? session?.gate_token_life_seconds, 600, 60, 1800);
  const nowMs = Date.now();
  const channel: ShortlinkChannel = String(session?.shortlink_channel ?? "primary") === "secondary" ? "secondary" : "primary";
  const gateUrl = gateUrlFromToken(gateToken, passNo, env);
  const shortened = await shortenWithFailover(db, cfg, passNo, gateUrl, channel, env, excludeIds);
  const provider = shortened.provider;
  const outboundUrl = shortened.outboundUrl;
  const degraded = Boolean(shortened.degraded);
  const failures = Array.isArray(shortened.failures) ? shortened.failures : [];
  const delay = degraded ? 0 : configuredDelay;
  const activateAfterAt = new Date(nowMs + delay * 1000).toISOString();
  const gateExpiresAt = new Date(nowMs + (delay + gateLifeSeconds) * 1000).toISOString();
  const ins = await db.rpc("free_flow_publish_gate", {
    p_pass: passNo,
    p_session_id: session.session_id, p_out_hash: passNo === 2 ? session.out_token_hash_pass2 : session.out_token_hash,
    p_gate_hash: gateHash, p_short_url: outboundUrl, p_provider_id: provider?.id ?? null,
    p_delay: delay, p_life: gateLifeSeconds, p_channel: channel,
  });
  if (ins.error || ins.data?.ok !== true) throw new Error(ins.data?.code || ins.error?.message || "PASS2_PUBLISH_FAILED");
  return { gateToken, gateUrl, outboundUrl, provider, delay, gateLifeSeconds, gateExpiresAt, activateAfterAt, degraded, failures };
}
async function loadSession(db: any, sessionId: string) {
  const { data, error } = await db.from("licenses_free_sessions").select("*").eq("session_id", sessionId).maybeSingle();
  if (error) throw error;
  return data as any;
}

export async function handleFreeGate(req: Request, env: any) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED", msg: "METHOD_NOT_ALLOWED" }, 405);
  const db = createServiceClient(env);
  if (!db) return json({ ok: false, code: "SERVER_NOT_READY", msg: "SERVER_NOT_READY" }, 503);

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, code: "BAD_JSON", msg: "BAD_JSON" }, 400);
  const gateToken = text(body.gate_token || body.gateToken, 4096);
  const outToken = text(body.out_token, 4096);
  if (!gateToken) return json({ ok: false, code: "TOKENIZED_GATE_REQUIRED", msg: "TOKENIZED_GATE_REQUIRED" }, 200);
  if (!outToken) return json({ ok: false, code: "OUT_TOKEN_REQUIRED", msg: "OUT_TOKEN_REQUIRED" }, 200);
  const fingerprint = text(body.fingerprint, 512);
  const ip = getIp(req);
  if (!ip) return json({ ok: false, code: "CLIENT_IP_REQUIRED", msg: "CLIENT_IP_REQUIRED" }, 400);
  const hashes = { ipHash: await sha256Hex(ip), uaHash: await sha256Hex(req.headers.get("user-agent") ?? ""), fpHash: fingerprint ? await sha256Hex(fingerprint) : "" };
  const settings = await db.from("licenses_free_settings").select("*").eq("id", 1).maybeSingle();
  if (settings.error || !settings.data) return json({ ok: false, code: "SETTINGS_LOAD_FAILED", msg: "SETTINGS_LOAD_FAILED" }, 503);
  const cfg = settings.data;
  const gateHash = await sha256Hex(gateToken);
  // New independent pair for pass 2. Gate secret stays inside the provider's
  // destination; the browser only receives the new out_token after commit.
  const nextOutToken = randomToken("out");
  const claimToken = await claimTokenForGate(gateToken, "gate", env);
  const decision = await db.rpc("free_flow_consume_gate", {
    p_gate_hash: gateHash, p_out_hash: await sha256Hex(outToken),
    p_fp_hash: hashes.fpHash, p_ip_hash: hashes.ipHash, p_ua_hash: hashes.uaHash,
    p_session_id: text(body.session_id, 128), p_pass: Number(body.pass ?? 1),
    p_next_out_hash: await sha256Hex(nextOutToken), p_claim_hash: await sha256Hex(claimToken),
    p_claim_window: clampSeconds(cfg.free_claim_window_seconds, 180, 30, 600),
  });
  if (decision.error || !decision.data || typeof decision.data.ok !== "boolean") return json({ ok: false, code: "FREE_GUARD_NOT_READY", msg: "FREE_GUARD_NOT_READY" }, 503);
  const result = decision.data;
  if (result.ok !== true) {
    await logGate(db, { session_id: result.session_id || null, event_code: result.code || "GATE_DENIED", ip_hash: hashes.ipHash, ua_hash: hashes.uaHash, fingerprint_hash: hashes.fpHash || null });
    return json({ ok: false, code: result.code || "GATE_DENIED", msg: result.code || "GATE_DENIED" }, 200);
  }
  await logGate(db, { session_id: result.session_id, pass_no: Number(body.pass ?? 1),
    event_code: result.next === "SHORTLINK_FALLBACK" ? "shortlink_early_return_fallback" : result.next === "PASS2" ? "pass1_ok_tokenized" : "gate_ok_tokenized",
    detail: { next: result.next }, ip_hash: hashes.ipHash, ua_hash: hashes.uaHash, fingerprint_hash: hashes.fpHash });
  if (result.next === "PASS2" || result.next === "SHORTLINK_FALLBACK") {
    const session = await loadSession(db, result.session_id);
    if (!session) return json({ ok: false, code: "SESSION_NOT_FOUND", msg: "SESSION_NOT_FOUND" }, 503);
    try {
      const next = await createNextGateToken(db, cfg, session, result.next === "PASS2" ? 2 : result.pass_no, hashes, env, result.exclude_provider_id ? [String(result.exclude_provider_id)] : []);
      return json({ ok: true, next: result.next, session_id: result.session_id,
        out_token: nextOutToken, outbound_url: next.outboundUrl,
        min_delay_seconds: next.delay, gate_token_life_seconds: next.gateLifeSeconds }, 200);
    } catch (error) {
      await db.rpc("free_flow_burn", { p_session_id: result.session_id, p_reason: "PASS2_SHORTLINK_FAILED" });
      return json({ ok: false, code: "PASS2_SHORTLINK_FAILED", msg: "PASS2_SHORTLINK_FAILED" }, 200);
    }
  }
  if (result.next !== "CLAIM") return json({ ok: false, code: "GATE_STATE_INVALID", msg: "GATE_STATE_INVALID" }, 503);
  return json({ ok: true, next: "CLAIM", session_id: result.session_id,
    claim_token: claimToken, claim_url: "/free/claim", claim_expires_at: result.claim_expires_at }, 200);
}
