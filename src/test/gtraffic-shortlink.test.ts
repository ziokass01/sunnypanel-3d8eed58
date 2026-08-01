import { describe, expect, it } from "vitest";
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
  vietnamDate,
} from "../../supabase/functions/_shared/gtraffic";

describe("GTraffic shortlink provider", () => {
  it("builds the documented GET request without losing the nested gate URL", () => {
    const gateUrl = "https://mityangho.id.vn/free/gate?t=abc&p=1";
    const requestUrl = new URL(buildGtrafficApiUrl(
      "https://manager.gtraffic.io/api/cong-khai/tao-lien-ket",
      "test-token",
      gateUrl,
    ));

    expect(requestUrl.searchParams.get("apikey")).toBe("test-token");
    expect(requestUrl.searchParams.get("url")).toBe(gateUrl);
  });

  it("turns the JSON id into a short URL and preserves remaining quota", () => {
    expect(parseGtrafficResponse(
      { id: "DHS3DCM", url: "https://yourlink.com", remaining: 999 },
      "https://gtraffic.io",
      "2026-08-01",
    )).toEqual({
      outboundUrl: "https://gtraffic.io/DHS3DCM",
      quotaRemaining: 999,
      quotaDate: "2026-08-01",
    });
  });

  it("builds the browser bridge used when GTraffic blocks the Edge server IP", () => {
    const gateUrl = "https://mityangho.id.vn/free/gate?t=abc&p=2";
    const requestUrl = new URL(buildGtrafficBrowserUrl("https://gtraffic.io/st", "test-token", gateUrl));
    expect(requestUrl.origin + requestUrl.pathname).toBe("https://gtraffic.io/st");
    expect(requestUrl.searchParams.get("apikey")).toBe("test-token");
    expect(requestUrl.searchParams.get("url")).toBe(gateUrl);
    expect(isGtrafficEdgeIpBlock(new Error("GTRAFFIC_EDGE_IP_BLOCKED"))).toBe(true);
    expect(isGtrafficEdgeIpBlock(new Error("HTTP_403"))).toBe(false);
    expect(isGtrafficBlockedResponse(403, { block: true })).toBe(true);
    expect(isGtrafficBlockedResponse(403, { message: "invalid token" })).toBe(false);
  });

  it("rejects a response without a valid short id", () => {
    expect(() => parseGtrafficResponse({ message: "invalid token" })).toThrow("invalid token");
  });

  it("marks a zero-quota response as exhausted", () => {
    expect(() => parseGtrafficResponse({ remaining: 0 })).toThrow("GTRAFFIC_DAILY_QUOTA_EXHAUSTED");
    expect(isQuotaExhaustedError(new Error("GTRAFFIC_DAILY_QUOTA_EXHAUSTED"))).toBe(true);
    expect(isQuotaExhaustedError(new Error("HTTP_429"))).toBe(true);
  });

  it("skips quota zero only for the same Vietnam date", () => {
    const provider = { provider: "gtraffic", quota_remaining: 0, quota_date: "2026-08-01" };
    expect(providerIsExhaustedToday(provider, "2026-08-01")).toBe(true);
    expect(providerIsExhaustedToday(provider, "2026-08-02")).toBe(false);
  });

  it("does not globally skip GTraffic because another session returned early", () => {
    const provider = {
      provider: "gtraffic",
      quota_remaining: 993,
      quota_date: "2026-08-01",
      unavailable_until: "2099-01-01T00:00:00.000Z",
    };
    expect(providerIsExhaustedToday(provider, "2026-08-01")).toBe(false);
  });

  it("uses the Vietnam calendar date around UTC midnight", () => {
    expect(vietnamDate(new Date("2026-08-01T16:59:59Z"))).toBe("2026-08-01");
    expect(vietnamDate(new Date("2026-08-01T17:00:00Z"))).toBe("2026-08-02");
  });

  it("keeps existing modes and recognizes ordered failover", () => {
    expect(normalizeShortlinkMode("round_robin")).toBe("round_robin");
    expect(normalizeShortlinkMode("random")).toBe("random");
    expect(normalizeShortlinkMode("priority_failover")).toBe("priority_failover");
    expect(normalizeShortlinkMode("unknown")).toBe("round_robin");
  });

  it("uses the absolute admin row order independently for Pass1 and Pass2", () => {
    const rows = [
      { id: "top", enabled: true, pass_scope: "both", sort_order: 10, created_at: "2026-08-01T00:00:00Z" },
      { id: "pass1-lower", enabled: true, pass_scope: "pass1", sort_order: 20, created_at: "2026-08-01T00:00:01Z" },
      { id: "pass2-lower", enabled: true, pass_scope: "pass2", sort_order: 30, created_at: "2026-08-01T00:00:02Z" },
    ];
    expect(orderedProvidersForPass(rows, 1).map((row) => row.id)).toEqual(["top", "pass1-lower"]);
    expect(orderedProvidersForPass(rows, 2).map((row) => row.id)).toEqual(["top", "pass2-lower"]);
  });

  it("maps separate Pass1 and Pass2 rows exactly as arranged", () => {
    const rows = [
      { id: "link4m-pass1", enabled: true, pass_scope: "pass1", sort_order: 10 },
      { id: "gtraffic-pass2", enabled: true, pass_scope: "pass2", sort_order: 20 },
      { id: "fallback-both", enabled: true, pass_scope: "both", sort_order: 30 },
    ];
    expect(orderedProvidersForPass(rows, 1).map((row) => row.id)).toEqual(["link4m-pass1", "fallback-both"]);
    expect(orderedProvidersForPass(rows, 2).map((row) => row.id)).toEqual(["gtraffic-pass2", "fallback-both"]);
  });

  it("keeps Get Key phụ in its own explicitly enabled provider pool", () => {
    const rows = [
      { id: "gtraffic-main", enabled: true, secondary_enabled: false, pass_scope: "both", sort_order: 10 },
      { id: "link4m-secondary", enabled: true, secondary_enabled: true, pass_scope: "both", sort_order: 20 },
      { id: "disabled-secondary", enabled: false, secondary_enabled: true, pass_scope: "both", sort_order: 30 },
    ];
    expect(orderedProvidersForPass(rows, 1, "primary").map((row) => row.id)).toEqual(["gtraffic-main", "link4m-secondary"]);
    expect(orderedProvidersForPass(rows, 1, "secondary").map((row) => row.id)).toEqual(["link4m-secondary", "disabled-secondary"]);
  });
});
