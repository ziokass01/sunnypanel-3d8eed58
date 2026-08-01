import { describe, expect, it } from "vitest";
import {
  buildGtrafficApiUrl,
  isQuotaExhaustedError,
  normalizeShortlinkMode,
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
});
