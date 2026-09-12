export function vietnamDate(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(now);
    const year = parts.find((part) => part.type === "year")?.value ?? "";
    const month = parts.find((part) => part.type === "month")?.value ?? "";
    const day = parts.find((part) => part.type === "day")?.value ?? "";
    return `${year}-${month}-${day}`;
}
export function normalizeShortlinkMode(value) {
    const mode = String(value ?? "round_robin").trim().toLowerCase().slice(0, 32);
    if (mode === "random")
        return "random";
    if (mode === "priority_failover")
        return "priority_failover";
    return "round_robin";
}
export function providerDailyQuotaEnabled(provider) {
    if (typeof provider?.daily_quota_enabled === "boolean")
        return provider.daily_quota_enabled;
    const legacyLimit = Number(provider?.daily_quota_limit ?? 0);
    return Number.isFinite(legacyLimit) && legacyLimit > 0;
}
export function providerDailyQuotaLimit(provider) {
    if (!providerDailyQuotaEnabled(provider))
        return 0;
    const value = Number(provider?.daily_quota_limit ?? 0);
    if (!Number.isFinite(value))
        return 0;
    return Math.max(0, Math.floor(value));
}
export function providerDailyQuotaUsed(provider, today = vietnamDate()) {
    if (String(provider?.quota_date ?? "").trim() !== today)
        return 0;
    const value = Number(provider?.quota_used_today ?? 0);
    if (!Number.isFinite(value))
        return 0;
    return Math.max(0, Math.floor(value));
}
export function providerIsTemporarilyUnavailable(provider, now = new Date()) {
    if (String(provider?.provider ?? "").trim().toLowerCase() === "gtraffic")
        return false;
    const unavailableUntil = Date.parse(String(provider?.unavailable_until ?? ""));
    return Number.isFinite(unavailableUntil) && unavailableUntil > now.getTime();
}
export function providerIsExhaustedToday(provider, today = vietnamDate()) {
    // Switch off means always try this provider. Cached remaining=0 is only
    // informational and cannot keep GTraffic disabled across its reset cycle.
    if (!providerDailyQuotaEnabled(provider))
        return false;
    if (String(provider?.quota_date ?? "").trim() !== today)
        return false;
    const localLimit = providerDailyQuotaLimit(provider);
    if (localLimit > 0 && providerDailyQuotaUsed(provider, today) >= localLimit)
        return true;
    // quota_remaining belongs to the external provider. Legacy local-quota
    // RPCs also wrote here, so a stale zero must not disable generic providers
    // after the admin changes their local limit to 0 (unlimited).
    const providerKind = String(provider?.provider ?? "").trim().toLowerCase();
    if (providerKind !== "gtraffic")
        return false;
    if (provider?.quota_remaining === null || provider?.quota_remaining === undefined || provider?.quota_remaining === "")
        return false;
    const remaining = Number(provider?.quota_remaining);
    return Number.isFinite(remaining) && remaining <= 0;
}
export function isQuotaExhaustedError(error) {
    const message = String(error?.message ?? error ?? "").toLowerCase();
    return message.includes("provider_daily_quota_exhausted")
        || message.includes("gtraffic_daily_quota_exhausted")
        || message.includes("daily limit")
        || (message.includes("quota") && (message.includes("exhausted") || message.includes("exceeded") || message.includes("limit")))
        || message.includes("remaining: 0")
        || message.includes("remaining=0")
        || message.includes("hết lượt")
        || message.includes("hết hạn mức")
        || message.includes("sử dụng hết")
        || (message.includes("vượt quá") && message.includes("lượt"));
}
export function parseQuotaRemaining(value) {
    if (value === null || value === undefined || value === "")
        return null;
    const remaining = Number(value);
    if (!Number.isFinite(remaining))
        return null;
    return Math.max(0, Math.floor(remaining));
}
export function buildGtrafficApiUrl(apiUrl, apiToken, gateUrl) {
    const endpoint = new URL(apiUrl || "https://manager.gtraffic.io/api/cong-khai/tao-lien-ket");
    endpoint.searchParams.set("apikey", apiToken);
    endpoint.searchParams.set("url", gateUrl);
    return endpoint.toString();
}
export function buildGtrafficBrowserUrl(browserUrl, apiToken, gateUrl) {
    const endpoint = new URL(browserUrl || "https://gtraffic.io/st");
    endpoint.searchParams.set("apikey", apiToken);
    endpoint.searchParams.set("url", gateUrl);
    return endpoint.toString();
}
export function isGtrafficEdgeIpBlock(error) {
    const message = String(error?.message ?? error ?? "").trim().toUpperCase();
    return message.includes("GTRAFFIC_EDGE_IP_BLOCKED");
}
export function isGtrafficBlockedResponse(status, data) {
    return status === 403 && data?.block === true;
}
export function providerSupportsPass(provider, passNo) {
    const scope = String(provider?.pass_scope ?? "both").trim().toLowerCase();
    if (scope === "both")
        return true;
    if (passNo === 2)
        return scope === "pass2";
    return scope === "pass1";
}
export function orderedProvidersForPass(providers, passNo, channel = "primary") {
    return [...providers]
        .filter((provider) => (providerSupportsPass(provider, passNo)
        && (channel === "primary" ? provider?.enabled !== false : provider?.secondary_enabled === true)))
        .sort((left, right) => {
        const orderDiff = Number(left?.sort_order ?? 0) - Number(right?.sort_order ?? 0);
        if (orderDiff !== 0)
            return orderDiff;
        return String(left?.created_at ?? "").localeCompare(String(right?.created_at ?? ""));
    });
}
export function parseGtrafficResponse(data, shortBaseUrl = "https://gtraffic.io", today = vietnamDate()) {
    const quotaRemaining = parseQuotaRemaining(data?.remaining ?? data?.data?.remaining);
    const id = String(data?.id ?? data?.data?.id ?? "").trim().slice(0, 128);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
        if (quotaRemaining === 0)
            throw new Error("GTRAFFIC_DAILY_QUOTA_EXHAUSTED");
        const reason = String(data?.message ?? data?.error ?? "GTRAFFIC_RESPONSE_INVALID").trim().slice(0, 300);
        throw new Error(reason || "GTRAFFIC_RESPONSE_INVALID");
    }
    const base = String(shortBaseUrl || "https://gtraffic.io").trim().replace(/\/+$/, "");
    if (!/^https:\/\//i.test(base))
        throw new Error("GTRAFFIC_SHORT_BASE_INVALID");
    return {
        outboundUrl: `${base}/${encodeURIComponent(id)}`,
        quotaRemaining,
        quotaDate: today,
    };
}
