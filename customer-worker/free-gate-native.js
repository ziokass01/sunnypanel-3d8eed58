// @ts-nocheck
import { createServiceClient } from "./supabase-rest.js";
import { buildGtrafficApiUrl, buildGtrafficBrowserUrl, isGtrafficBlockedResponse, isGtrafficEdgeIpBlock, isQuotaExhaustedError, normalizeShortlinkMode, orderedProvidersForPass, parseGtrafficResponse, providerIsExhaustedToday, providerIsTemporarilyUnavailable, vietnamDate, } from "./free-shared/gtraffic.js";
const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-fp, x-admin-key",
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-max-age": "86400",
    "vary": "origin",
};
function json(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function text(value, max = 4096) {
    return String(value ?? "").trim().slice(0, max);
}
function getIp(req) {
    return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ?? "0.0.0.0";
}
async function sha256Hex(input) {
    const data = new TextEncoder().encode(String(input ?? ""));
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function clampSeconds(value, fallback, min, max) {
    const n = Math.floor(Number(value ?? fallback));
    const safe = Number.isFinite(n) && n > 0 ? n : fallback;
    return Math.min(max, Math.max(min, safe));
}
function secondsUntil(iso) {
    const ms = Date.parse(String(iso ?? ""));
    if (!Number.isFinite(ms))
        return -1;
    return Math.ceil((ms - Date.now()) / 1000);
}
function minIsoDeadline(...items) {
    const times = items
        .map((item) => item instanceof Date ? item.getTime() : typeof item === "number" ? item : Date.parse(String(item ?? "")))
        .filter((n) => Number.isFinite(n) && n > 0);
    if (!times.length)
        return new Date().toISOString();
    return new Date(Math.min(...times)).toISOString();
}
function publicBase(env) {
    return String(env?.FREE_PUBLIC_BASE_URL || env?.PUBLIC_BASE_URL || "https://mityangho.id.vn").replace(/\/+$/, "");
}
function randomToken(prefix) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const body = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    return `${prefix}_${body}`;
}
function gateUrlFromToken(gateToken, passNo, env) {
    const url = new URL(`${publicBase(env)}/free/gate`);
    url.searchParams.set("t", gateToken);
    url.searchParams.set("p", String(passNo));
    return url.toString();
}
async function claimTokenForGate(gateToken, sessionId, env) {
    const secret = env?.FREE_CLAIM_SECRET || env?.SUPABASE_SERVICE_ROLE_KEY || env?.UPSTREAM_SERVICE_ROLE_KEY || "sunny-free-claim-v1";
    const digest = await sha256Hex(`claim-v1:${secret}:${sessionId}:${gateToken}`);
    return `clm_${digest}`;
}
function normalizeTemplate(template) {
    return String(template || "")
        .trim()
        .replace(/\{\s*gate_url_enc\s*\}/gi, "{url_enc}")
        .replace(/\{\s*gate_url\s*\}/gi, "{url}")
        .replace(/\{\s*GATE_URL_ENC\s*\}/g, "{url_enc}")
        .replace(/\{\s*GATE_URL\s*\}/g, "{url}")
        .replace(/\{\s*api_token\s*\}/gi, "{token}");
}
function renderTemplate(templateRaw, gateUrl, apiToken) {
    const template = normalizeTemplate(templateRaw);
    if (!template)
        return "";
    return template
        .replaceAll("{url_enc}", encodeURIComponent(gateUrl))
        .replaceAll("{url}", gateUrl)
        .replaceAll("{token}", encodeURIComponent(apiToken));
}
function normalizeProviderApiBase(kind, rawApi) {
    let api = String(rawApi || "").trim();
    if (!api)
        return "";
    if (kind !== "link4m")
        return api;
    // Link4M currently documents /api-shorten/v2. Older admin rows often contain
    // /api-shorten or /api-shorten/; normalize those without touching token/url templates.
    api = api.replace(/(https?:\/\/[^/?#]*link4m\.(?:co|com)\/api-shorten)\/?(?=([?#]|$))/i, "$1/v2");
    api = api.replace(/(\/api-shorten\/v2)\/+([?#]|$)/i, "$1$2");
    return api;
}
function isCloudflareChallenge(raw) {
    const value = String(raw || "").toLowerCase();
    return value.includes("<title>just a moment")
        || value.includes("challenge-platform")
        || value.includes("cf-chl-")
        || value.includes("cloudflare ray id")
        || value.includes("enable javascript and cookies to continue");
}
function isHtmlResponse(raw, contentType = "") {
    const value = String(raw || "").trim().toLowerCase();
    const type = String(contentType || "").toLowerCase();
    return type.includes("text/html") || value.startsWith("<!doctype html") || value.startsWith("<html");
}
function providerErrorPrefix(providerKind) {
    const normalized = String(providerKind || "provider").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    return normalized || "PROVIDER";
}
function safeProviderError(error) {
    const raw = String(error?.message ?? error ?? "SHORTLINK_FAILED");
    const trimmed = raw.trim();
    if (/^[A-Z0-9_]+_CLOUDFLARE_CHALLENGE$/.test(trimmed))
        return trimmed;
    if (isCloudflareChallenge(raw))
        return "SHORTLINK_PROVIDER_CLOUDFLARE_CHALLENGE";
    if (isHtmlResponse(raw))
        return "SHORTLINK_PROVIDER_HTML_RESPONSE";
    return raw
        .replace(/([?&](?:apikey|api|token|tokenUser)=)[^&\s]+/gi, "$1***")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 300);
}
async function fetchProviderResponse(url, headers) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
        const res = await fetch(url, { headers, redirect: "follow", signal: controller.signal });
        const raw = await res.text();
        let data = null;
        try {
            data = JSON.parse(raw);
        }
        catch {
            data = null;
        }
        return { res, data, raw };
    }
    catch (error) {
        if (error?.name === "AbortError")
            throw new Error("SHORTLINK_TIMEOUT");
        throw new Error(`SHORTLINK_FETCH_FAILED: ${String(error?.message ?? error)}`);
    }
    finally {
        clearTimeout(timeout);
    }
}
async function readJsonOrText(url, providerKind = "custom") {
    const common = {
        "accept": "application/json,text/plain,*/*",
        "cache-control": "no-cache",
        "pragma": "no-cache",
    };
    const normalizedProviderKind = String(providerKind || "custom").trim().toLowerCase();
    let profiles;
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
    }
    else if (normalizedProviderKind === "layma") {
        profiles = [
            { "accept": "application/json" },
            { ...common },
        ];
    }
    else {
        profiles = [{ ...common, "user-agent": "SunnyPanel-FreeKey/1.3" }];
    }
    let lastError = null;
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
            const reason = String(data?.message || data?.error || `HTTP_${res.status}`).trim();
            throw new Error(reason || `HTTP_${res.status}`);
        }
        return { data, raw };
    }
    throw lastError ?? new Error("SHORTLINK_RESPONSE_INVALID");
}
function extractShortUrl(data, raw) {
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
        if (/^https?:\/\//i.test(v))
            return v;
    }
    return "";
}
async function shortenWithProvider(provider, gateUrl, env) {
    const kind = text(provider?.provider || "custom", 32).toLowerCase() || "custom";
    const token = text(provider?.api_token_secret, 4096);
    const rawApiUrl = text(provider?.api_url_template, 4096);
    const apiUrl = normalizeProviderApiBase(kind, rawApiUrl);
    if (kind === "none")
        return { outboundUrl: gateUrl };
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
        if (!token)
            throw new Error("SHORTLINK_TOKEN_MISSING");
        // Several legacy Link4M rows were saved under another provider kind.
        // Detect them by all row metadata before traffic68/custom handling so
        // round-robin cannot alternate between a working /st row and an old
        // server-side api-shorten row that Cloudflare challenges.
        const outbound = new URL("https://link4m.co/st");
        outbound.searchParams.set("api", token);
        outbound.searchParams.set("url", gateUrl);
        return { outboundUrl: outbound.toString() };
    }
    if (kind === "gtraffic") {
        if (!token)
            throw new Error("SHORTLINK_TOKEN_MISSING");
        const endpoint = buildGtrafficApiUrl(apiUrl, token, gateUrl);
        try {
            const { data } = await readJsonOrText(endpoint, kind);
            const shortBaseUrl = env?.GTRAFFIC_SHORT_BASE_URL || "https://gtraffic.io";
            return parseGtrafficResponse(data, shortBaseUrl);
        }
        catch (error) {
            if (!isGtrafficEdgeIpBlock(error))
                throw error;
            const browserBaseUrl = env?.GTRAFFIC_BROWSER_BASE_URL || "https://gtraffic.io/st";
            return {
                outboundUrl: buildGtrafficBrowserUrl(browserBaseUrl, token, gateUrl),
                quotaDate: vietnamDate(),
                browserBridge: true,
            };
        }
    }
    if (kind === "traffic68") {
        const base = apiUrl || "https://traffic68.com/api/quicklink/st";
        return {
            outboundUrl: `${base}${base.includes("?") ? "&" : "?"}api=${encodeURIComponent(token)}&url=${encodeURIComponent(gateUrl)}`,
        };
    }
    if (kind === "nhapma") {
        const base = apiUrl || "https://service.nhapma.com/api";
        requestUrl = renderTemplate(base.includes("{url") || base.includes("{token") ? base : `${base}${base.includes("?") ? "&" : "?"}token={token}&url={url_enc}`, gateUrl, token);
    }
    else if (kind === "layma") {
        const base = apiUrl || "https://api.layma.net/api/admin/shortlink/quicklink";
        requestUrl = renderTemplate(base.includes("{url") || base.includes("{token") ? base : `${base}${base.includes("?") ? "&" : "?"}tokenUser={token}&format=json&url={url_enc}`, gateUrl, token);
    }
    else {
        requestUrl = renderTemplate(apiUrl, gateUrl, token);
    }
    if (!requestUrl)
        throw new Error("SHORTLINK_TEMPLATE_INVALID");
    if (/\/st\?/i.test(requestUrl) && !/api-shorten|\/api(\/|\?|$)|format=json/i.test(requestUrl))
        return { outboundUrl: requestUrl };
    if (kind === "custom" && /^https?:\/\//i.test(requestUrl) && !/[?&](apikey|api|token|tokenUser|url|u|link|target)=/i.test(requestUrl)) {
        return { outboundUrl: requestUrl };
    }
    const { data, raw } = await readJsonOrText(requestUrl, kind);
    if (kind === "layma" && data?.success === false) {
        throw new Error("LAYMA_API_REJECTED");
    }
    const shortUrl = extractShortUrl(data, raw);
    if (!shortUrl)
        throw new Error(String(data?.message || data?.error || "SHORTLINK_RESPONSE_INVALID"));
    return { outboundUrl: shortUrl };
}
async function logGate(db, row) {
    try {
        await db.from("licenses_free_gate_logs").insert(row);
    }
    catch { /* ignore */ }
}
async function updateSession(db, sessionId, patch) {
    const { error } = await db.from("licenses_free_sessions").update(patch).eq("session_id", sessionId);
    return !error;
}
async function loadProviders(db, passNo, channel, excludeIds = []) {
    const res = await db.from("licenses_free_shortlink_providers")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
    if (res.error)
        throw res.error;
    const excluded = new Set(excludeIds.map(String));
    return orderedProvidersForPass((res.data ?? []), passNo, channel)
        .filter((provider) => !providerIsExhaustedToday(provider) && !providerIsTemporarilyUnavailable(provider) && !excluded.has(String(provider?.id ?? "")));
}
function fallbackProviderFromSettings(cfg, passNo) {
    const template = text(passNo === 2 ? (cfg.free_outbound_url_pass2 || cfg.free_outbound_url) : cfg.free_outbound_url, 4096);
    if (!template)
        return null;
    if (/api-shorten|manager\.gtraffic\.io|\{token\}|[?&](?:apikey|api|token|tokenUser)=/i.test(template))
        return null;
    return { id: null, name: passNo === 2 ? "Legacy Pass2" : "Legacy Pass1", provider: "custom", api_url_template: template, api_token_secret: "", pass_scope: passNo === 2 ? "pass2" : "pass1", sort_order: 9999, source: "settings_legacy" };
}
async function chooseProvider(db, cfg, passNo, channel, excludeIds = []) {
    let providers = [];
    try {
        providers = await loadProviders(db, passNo, channel, excludeIds);
    }
    catch {
        providers = [];
    }
    if (!providers.length) {
        if (channel === "secondary")
            throw new Error("SECONDARY_SHORTLINK_NOT_READY");
        const fb = fallbackProviderFromSettings(cfg, passNo);
        if (fb)
            return fb;
        throw new Error("SHORTLINK_PROVIDER_MISSING");
    }
    const mode = normalizeShortlinkMode(channel === "secondary" ? cfg.free_secondary_shortlink_mode : cfg.free_shortlink_mode);
    const lastId = text(channel === "secondary"
        ? (passNo === 2 ? cfg.free_secondary_last_provider_id_pass2 : cfg.free_secondary_last_provider_id_pass1)
        : (passNo === 2 ? cfg.free_shortlink_last_provider_id_pass2 : cfg.free_shortlink_last_provider_id_pass1), 64);
    let selected;
    if (mode === "priority_failover") {
        selected = providers[0];
        if (!selected) {
            const fallback = fallbackProviderFromSettings(cfg, passNo);
            if (fallback)
                return fallback;
            throw new Error("ALL_SHORTLINK_PROVIDERS_EXHAUSTED_TODAY");
        }
    }
    else if (mode === "random") {
        let pool = providers;
        if (lastId && providers.length > 1)
            pool = providers.filter((p) => String(p.id) !== lastId);
        selected = pool[Math.floor(Math.random() * pool.length)] ?? providers[0];
    }
    else {
        const idxRaw = Number(channel === "secondary"
            ? (passNo === 2 ? cfg.free_secondary_next_index_pass2 : cfg.free_secondary_next_index_pass1)
            : (passNo === 2 ? cfg.free_shortlink_next_index_pass2 : cfg.free_shortlink_next_index_pass1));
        const idx = Number.isFinite(idxRaw) ? Math.max(0, Math.floor(idxRaw)) : 0;
        selected = providers[idx % providers.length] ?? providers[0];
        const next = (idx + 1) % providers.length;
        const patch = channel === "secondary"
            ? (passNo === 2 ? { free_secondary_next_index_pass2: next } : { free_secondary_next_index_pass1: next })
            : (passNo === 2 ? { free_shortlink_next_index_pass2: next } : { free_shortlink_next_index_pass1: next });
        try {
            await db.from("licenses_free_settings").update(patch).eq("id", 1);
        }
        catch { /* ignore */ }
    }
    if (selected?.id) {
        const patch = channel === "secondary"
            ? (passNo === 2 ? { free_secondary_last_provider_id_pass2: selected.id } : { free_secondary_last_provider_id_pass1: selected.id })
            : (passNo === 2 ? { free_shortlink_last_provider_id_pass2: selected.id } : { free_shortlink_last_provider_id_pass1: selected.id });
        try {
            await db.from("licenses_free_settings").update(patch).eq("id", 1);
        }
        catch { /* ignore */ }
    }
    return selected;
}
async function providerCandidates(db, cfg, passNo, selected, channel, excludeIds = []) {
    let providers = [];
    try {
        providers = await loadProviders(db, passNo, channel, excludeIds);
    }
    catch {
        providers = [];
    }
    const mode = normalizeShortlinkMode(channel === "secondary" ? cfg.free_secondary_shortlink_mode : cfg.free_shortlink_mode);
    const out = [];
    const seen = new Set();
    const push = (provider) => {
        if (!provider)
            return;
        if (mode === "priority_failover" && providerIsExhaustedToday(provider))
            return;
        const key = provider?.id
            ? `id:${String(provider.id)}`
            : `cfg:${text(provider?.provider, 32)}:${text(provider?.api_url_template, 512)}:${text(provider?.api_token_secret, 64)}`;
        if (seen.has(key))
            return;
        seen.add(key);
        out.push(provider);
    };
    push(selected);
    for (const provider of providers)
        push(provider);
    return out;
}
async function configuredProviderDailyQuota(provider) {
    const value = Number(provider?.daily_quota_limit ?? 0);
    if (!Number.isFinite(value))
        return 0;
    return Math.max(0, Math.floor(value));
}
async function reserveProviderQuota(db, provider) {
    const limit = await configuredProviderDailyQuota(provider);
    if (!provider?.id || limit <= 0)
        return { allowed: true, reserved: false };
    const result = await db.rpc("reserve_free_shortlink_provider_quota", {
        p_provider_id: provider.id,
        p_today: vietnamDate(),
    });
    if (result.error)
        throw new Error("PROVIDER_QUOTA_RESERVE_FAILED");
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    return {
        allowed: row?.allowed === true,
        reserved: row?.allowed === true,
    };
}
async function releaseProviderQuota(db, provider) {
    const limit = await configuredProviderDailyQuota(provider);
    if (!provider?.id || limit <= 0)
        return;
    try {
        await db.rpc("release_free_shortlink_provider_quota", {
            p_provider_id: provider.id,
            p_today: vietnamDate(),
        });
    }
    catch {
        // Conservative failure: at most one local quota slot stays reserved.
    }
}
function shouldTemporarilyCoolDownProvider(provider, error) {
    if (text(provider?.provider, 32).toLowerCase() === "gtraffic")
        return false;
    const message = safeProviderError(error).toUpperCase();
    return message.includes("CLOUDFLARE_CHALLENGE")
        || message.includes("SHORTLINK_TIMEOUT")
        || message.includes("SHORTLINK_FETCH_FAILED")
        || message.includes("LAYMA_API_REJECTED");
}
async function markProviderFailure(db, provider, error) {
    if (!provider?.id)
        return;
    const patch = {
        last_error: safeProviderError(error),
        fail_count: Math.max(0, Number(provider?.fail_count ?? 0)) + 1,
    };
    if (isQuotaExhaustedError(error)) {
        patch.quota_remaining = 0;
        patch.quota_date = vietnamDate();
        const localLimit = Math.max(0, Math.floor(Number(provider?.daily_quota_limit ?? 0) || 0));
        if (localLimit > 0)
            patch.quota_used_today = localLimit;
    }
    if (shouldTemporarilyCoolDownProvider(provider, error)) {
        patch.unavailable_until = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    }
    try {
        await db.from("licenses_free_shortlink_providers").update(patch).eq("id", provider.id);
    }
    catch { /* ignore */ }
}
async function markProviderSuccess(db, provider, passNo, result, channel) {
    if (!provider?.id)
        return;
    const providerPatch = {
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
    }
    catch { /* ignore */ }
    const patch = channel === "secondary"
        ? (passNo === 2 ? { free_secondary_last_provider_id_pass2: provider.id } : { free_secondary_last_provider_id_pass1: provider.id })
        : (passNo === 2 ? { free_shortlink_last_provider_id_pass2: provider.id } : { free_shortlink_last_provider_id_pass1: provider.id });
    try {
        await db.from("licenses_free_settings").update(patch).eq("id", 1);
    }
    catch { /* ignore */ }
}
async function shortenWithFailover(db, cfg, passNo, gateUrl, channel, env, excludeIds = []) {
    const failures = [];
    let selected = null;
    let candidates = [];
    try {
        selected = await chooseProvider(db, cfg, passNo, channel, excludeIds);
        candidates = await providerCandidates(db, cfg, passNo, selected, channel, excludeIds);
    }
    catch (error) {
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
            if (!outboundUrl)
                throw new Error("SHORTLINK_RESPONSE_EMPTY");
            await markProviderSuccess(db, provider, passNo, result, channel);
            return { provider, outboundUrl, degraded: false, failures: [] };
        }
        catch (error) {
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
async function createNextGateToken(db, cfg, session, passNo, hashes, env) {
    const gateToken = randomToken("gt");
    const gateHash = await sha256Hex(gateToken);
    const configuredDelay = Math.max(0, Number(cfg.free_min_delay_enabled === false ? 0 : (passNo === 2 ? cfg.free_min_delay_seconds_pass2 : cfg.free_min_delay_seconds) ?? 0) || 0);
    const gateLifeSeconds = clampSeconds(cfg.free_gate_token_life_seconds ?? session?.gate_token_life_seconds, 600, 60, 1800);
    const nowMs = Date.now();
    const channel = String(session?.shortlink_channel ?? "primary") === "secondary" ? "secondary" : "primary";
    const gateUrl = gateUrlFromToken(gateToken, passNo, env);
    const shortened = await shortenWithFailover(db, cfg, passNo, gateUrl, channel, env);
    const provider = shortened.provider;
    const outboundUrl = shortened.outboundUrl;
    const degraded = Boolean(shortened.degraded);
    const failures = Array.isArray(shortened.failures) ? shortened.failures : [];
    const delay = degraded ? 0 : configuredDelay;
    const activateAfterAt = new Date(nowMs + delay * 1000).toISOString();
    const gateExpiresAt = new Date(nowMs + (delay + gateLifeSeconds) * 1000).toISOString();
    const ins = await db.from("licenses_free_gate_tokens").insert({
        session_id: session.session_id,
        pass_no: passNo,
        token_hash: gateHash,
        status: "pending",
        activate_after_at: activateAfterAt,
        expires_at: gateExpiresAt,
        provider_id: provider?.id ?? null,
        shortlink_channel: channel,
        short_url: outboundUrl,
        ip_hash: hashes.ipHash,
        ua_hash: hashes.uaHash,
        fingerprint_hash: hashes.fpHash || hashes.ipHash,
    });
    if (ins.error)
        throw ins.error;
    return { gateToken, gateUrl, outboundUrl, provider, delay, gateLifeSeconds, gateExpiresAt, activateAfterAt, degraded, failures };
}
async function loadSession(db, sessionId) {
    const { data, error } = await db.from("licenses_free_sessions").select("*").eq("session_id", sessionId).maybeSingle();
    if (error)
        throw error;
    return data;
}
export async function handleFreeGate(req, env) {
    if (req.method === "OPTIONS")
        return new Response(null, { status: 204, headers: corsHeaders });
    if (req.method !== "POST")
        return json({ ok: false, code: "METHOD_NOT_ALLOWED", msg: "METHOD_NOT_ALLOWED" }, 405);
    const db = createServiceClient(env);
    if (!db)
        return json({ ok: false, code: "SERVER_NOT_READY", msg: "SERVER_NOT_READY" }, 503);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object")
        return json({ ok: false, code: "BAD_JSON", msg: "BAD_JSON" }, 200);
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
    const cfg = (settings ?? {});
    let baseLog = {
        session_id: sessionIdFromBody || null,
        pass_no: passNoFromBody,
        ip_hash: ipHash,
        ua_hash: uaHash,
        fingerprint_hash: fpHash || null,
        detail: { route: "free-gate", current_url: currentUrl || null, referrer: referrer || null, tokenized: Boolean(gateToken) },
    };
    async function deny(code, extra = {}) {
        const sid = text(baseLog.session_id, 128);
        if (sid)
            await updateSession(db, sid, { last_error: code });
        await logGate(db, { ...baseLog, event_code: code, detail: { ...baseLog.detail, ...extra } });
        return json({ ok: false, code, msg: code, ...extra }, 200);
    }
    // Tokenized gate flow: gate token comes from the URL; the matching start
    // token must still be supplied from the same browser's protected flow state.
    if (gateToken) {
        const gateHash = await sha256Hex(gateToken);
        const tokenRes = await db.from("licenses_free_gate_tokens").select("*").eq("token_hash", gateHash).maybeSingle();
        if (tokenRes.error)
            return await deny("GATE_TOKEN_LOAD_FAILED", { detail: tokenRes.error.message });
        const gateRow = tokenRes.data;
        if (!gateRow)
            return await deny("GATE_TOKEN_INVALID");
        const session = await loadSession(db, String(gateRow.session_id));
        if (!session)
            return await deny("SESSION_NOT_FOUND");
        session.shortlink_channel = String(gateRow.shortlink_channel ?? session.shortlink_channel ?? "primary") === "secondary" ? "secondary" : "primary";
        baseLog = { ...baseLog, session_id: session.session_id, pass_no: Number(gateRow.pass_no ?? passNoFromBody), key_type_code: session.key_type_code ?? null };
        if (session.closed_at || String(session.status ?? "").toLowerCase() === "closed")
            return await deny("SESSION_CLOSED");
        if (secondsUntil(session.expires_at) <= 0)
            return await deny("SESSION_EXPIRED");
        // Both start token and single-use gate token must belong to this session.
        if (!outToken)
            return await deny("OUT_TOKEN_REQUIRED");
        const outHash = await sha256Hex(outToken);
        const acceptedOutHashes = [text(session.out_token_hash, 128), text(session.out_token_hash_pass2, 128)].filter(Boolean);
        if (!acceptedOutHashes.length || !acceptedOutHashes.includes(outHash))
            return await deny("OUT_TOKEN_MISMATCH");
        const passNo = Number(gateRow.pass_no ?? passNoFromBody) === 2 ? 2 : 1;
        let requiresDoubleGate = Number(session.passes_required ?? 1) >= 2;
        if (!requiresDoubleGate && session.key_type_code) {
            try {
                const { data: keyType } = await db.from("licenses_free_key_types").select("requires_double_gate").eq("code", session.key_type_code).maybeSingle();
                requiresDoubleGate = Boolean(keyType?.requires_double_gate ?? false);
            }
            catch { /* ignore */ }
        }
        const status = String(gateRow.status ?? "").toLowerCase();
        if (status !== "pending") {
            if (status === "used" && String(gateRow.fail_reason ?? "") === "GTRAFFIC_EARLY_RETURN_FALLBACK") {
                return json({
                    ok: false,
                    code: "GTRAFFIC_ROTATION_IN_PROGRESS",
                    msg: "GTRAFFIC_ROTATION_IN_PROGRESS",
                    retry_after_ms: 800,
                }, 200);
            }
            return await deny(status === "burned_early" ? "GATE_TOKEN_BURNED" : status === "expired" ? "GATE_TOKEN_EXPIRED" : "GATE_TOKEN_ALREADY_USED", { token_status: status });
        }
        if (session.revealed_at || String(session.status ?? "").toLowerCase() === "revealed")
            return await deny("ALREADY_REVEALED");
        const requireIp = Boolean(cfg.free_gate_require_ip_match ?? false);
        const requireUa = Boolean(cfg.free_gate_require_ua_match ?? false);
        if (requireIp && text(gateRow.ip_hash || session.ip_hash, 128) && text(gateRow.ip_hash || session.ip_hash, 128) !== ipHash)
            return await deny("DEVICE_MISMATCH", { field: "ip" });
        if (requireUa && text(gateRow.ua_hash || session.ua_hash, 128) && text(gateRow.ua_hash || session.ua_hash, 128) !== uaHash)
            return await deny("DEVICE_MISMATCH", { field: "ua" });
        if (fpHash && text(gateRow.fingerprint_hash || session.fingerprint_hash, 128) && text(gateRow.fingerprint_hash || session.fingerprint_hash, 128) !== fpHash)
            return await deny("DEVICE_MISMATCH", { field: "fingerprint" });
        const activateMs = Date.parse(String(gateRow.activate_after_at ?? ""));
        const expiresMs = Date.parse(String(gateRow.expires_at ?? ""));
        const nowMs = Date.now();
        if (Number.isFinite(activateMs) && nowMs < activateMs) {
            const providerRes = gateRow.provider_id
                ? await db.from("licenses_free_shortlink_providers").select("*").eq("id", gateRow.provider_id).maybeSingle()
                : { data: null };
            const currentProvider = providerRes.data;
            const isGtrafficEarlyReturn = String(currentProvider?.provider ?? "").trim().toLowerCase() === "gtraffic";
            // GTraffic can be configured to "Đi tới liên kết gốc" when a short code
            // expires. That returns to this gate immediately. It is still too early
            // to receive a key, but it is a reliable signal to move to the next
            // configured shortener instead of killing the session.
            if (isGtrafficEarlyReturn) {
                const lock = await db.from("licenses_free_gate_tokens")
                    .update({ status: "used", fail_reason: "GTRAFFIC_EARLY_RETURN_FALLBACK" })
                    .eq("id", gateRow.id)
                    .eq("status", "pending")
                    .select("id")
                    .maybeSingle();
                if (lock.data) {
                    const channel = String(gateRow.shortlink_channel ?? session.shortlink_channel ?? "primary") === "secondary" ? "secondary" : "primary";
                    const gateUrl = gateUrlFromToken(gateToken, passNo, env);
                    try {
                        const replacement = await shortenWithFailover(db, cfg, passNo, gateUrl, channel, env, [String(currentProvider.id)]);
                        const replacementDelay = Math.max(0, Number(cfg.free_min_delay_enabled === false ? 0 : (passNo === 2 ? cfg.free_min_delay_seconds_pass2 : cfg.free_min_delay_seconds) ?? 0) || 0);
                        const gateLifeSeconds = clampSeconds(cfg.free_gate_token_life_seconds ?? session?.gate_token_life_seconds, 600, 60, 1800);
                        const replacementNow = Date.now();
                        const replacementActivateAt = new Date(replacementNow + replacementDelay * 1000).toISOString();
                        const replacementExpiresAt = new Date(replacementNow + (replacementDelay + gateLifeSeconds) * 1000).toISOString();
                        await db.from("licenses_free_gate_tokens").update({
                            status: "pending",
                            provider_id: replacement.provider?.id ?? null,
                            short_url: replacement.outboundUrl,
                            shortlink_channel: channel,
                            activate_after_at: replacementActivateAt,
                            expires_at: replacementExpiresAt,
                            fail_reason: null,
                            burned_at: null,
                        }).eq("id", gateRow.id);
                        await updateSession(db, session.session_id, {
                            status: passNo === 2 ? "waiting_pass2" : "waiting",
                            shortlink_channel: channel,
                            ...(passNo === 2 ? { provider_id_pass2: replacement.provider?.id ?? null } : { provider_id_pass1: replacement.provider?.id ?? null }),
                            last_error: null,
                        });
                        await logGate(db, {
                            ...baseLog,
                            event_code: "gtraffic_expired_fallback",
                            detail: {
                                ...baseLog.detail,
                                scope: "session_only",
                                from_provider_id: currentProvider.id,
                                to_provider_id: replacement.provider?.id ?? null,
                                to_provider_name: replacement.provider?.name ?? null,
                                channel,
                            },
                        });
                        return json({
                            ok: true,
                            next: "SHORTLINK_FALLBACK",
                            outbound_url: replacement.outboundUrl,
                            gate_url: gateUrl,
                            min_delay_seconds: replacementDelay,
                            gate_token_life_seconds: gateLifeSeconds,
                        }, 200);
                    }
                    catch (error) {
                        await db.from("licenses_free_gate_tokens").update({ status: "burned_early", burned_at: new Date().toISOString(), fail_reason: "GTRAFFIC_FALLBACK_FAILED" }).eq("id", gateRow.id);
                        await updateSession(db, session.session_id, { status: "closed", closed_at: new Date().toISOString(), last_error: "GTRAFFIC_FALLBACK_FAILED" });
                        return await deny("GTRAFFIC_FALLBACK_FAILED", { detail: safeProviderError(error) });
                    }
                }
                // A duplicate browser request may arrive while the first request is
                // replacing this session's link. Never burn or close the session from
                // the losing request; ask the same browser to poll briefly instead.
                return json({
                    ok: false,
                    code: "GTRAFFIC_ROTATION_IN_PROGRESS",
                    msg: "GTRAFFIC_ROTATION_IN_PROGRESS",
                    retry_after_ms: 800,
                }, 200);
            }
            await db.from("licenses_free_gate_tokens").update({ status: "burned_early", burned_at: new Date().toISOString(), fail_reason: "GATE_TOO_EARLY" }).eq("id", gateRow.id).eq("status", "pending");
            await updateSession(db, session.session_id, { status: "closed", closed_at: new Date().toISOString(), out_expires_at: new Date().toISOString(), last_error: "GATE_TOO_EARLY" });
            await logGate(db, { ...baseLog, event_code: "GATE_TOO_EARLY", detail: { ...baseLog.detail, activate_after_at: gateRow.activate_after_at, wait_seconds: Math.ceil((activateMs - nowMs) / 1000) }, fingerprint_hash: fpHash || null, ip_hash: ipHash, ua_hash: uaHash });
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
            if (!lock.data)
                return await deny("GATE_TOKEN_ALREADY_USED");
            let next;
            try {
                next = await createNextGateToken(db, cfg, session, 2, { ipHash, uaHash, fpHash }, env);
            }
            catch (error) {
                await updateSession(db, session.session_id, { status: "closed", closed_at: new Date().toISOString(), last_error: "PASS2_SHORTLINK_FAILED" });
                return await deny("PASS2_SHORTLINK_FAILED", { detail: String(error?.message ?? error) });
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
            await logGate(db, {
                ...baseLog,
                event_code: next.degraded ? "pass1_ok_tokenized_degraded" : "pass1_ok_tokenized",
                detail: {
                    ...baseLog.detail,
                    next: "PASS2",
                    provider_id: next.provider?.id ?? null,
                    provider_name: next.provider?.name ?? null,
                    shortlink_degraded: Boolean(next.degraded),
                    shortlink_failures: next.failures?.length ? next.failures : undefined,
                },
            });
            return json({
                ok: true,
                next: "PASS2",
                outbound_url: next.outboundUrl,
                gate_url: next.gateUrl,
                min_delay_seconds: next.delay,
                gate_token_life_seconds: next.gateLifeSeconds,
                shortlink_degraded: Boolean(next.degraded),
                shortlink_failures: next.failures?.length ? next.failures : undefined,
            }, 200);
        }
        const lock = await db.from("licenses_free_gate_tokens")
            .update({ status: "used", used_at: new Date().toISOString() })
            .eq("id", gateRow.id)
            .eq("status", "pending")
            .select("id")
            .maybeSingle();
        if (!lock.data)
            return await deny("GATE_TOKEN_ALREADY_USED");
        const claimToken = await claimTokenForGate(gateToken, session.session_id, env);
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
        await logGate(db, { ...baseLog, event_code: "gate_ok_tokenized", detail: { ...baseLog.detail, next: "CLAIM" } });
        return json({ ok: true, next: "CLAIM", session_id: session.session_id, claim_token: claimToken, claim_url: "/free/claim", claim_expires_at: claimExpiresAt }, 200);
    }
    // Fail closed: out_token alone can never replace the single-use gate token.
    return await deny("TOKENIZED_GATE_REQUIRED");
}
