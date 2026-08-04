import { describe, expect, it } from "vitest";
import { buildDashboardStats, keyDurationLabel, mapAuditResult, normalizeKeyInput } from "../pages/RentPortal";

describe("rent portal helpers", () => {
  it("normalizes key input", () => {
    expect(normalizeKeyInput("  abcd-efgh-1234-zzzz ")).toBe("ABCD-EFGH-1234-ZZZZ");
  });

  it("renders duration labels", () => {
    expect(keyDurationLabel({ duration_value: 30, duration_unit: "day", duration_days: null })).toBe("30 ngày");
    expect(keyDurationLabel({ duration_value: 12, duration_unit: "hour", duration_days: null })).toBe("12 giờ");
    expect(keyDurationLabel({ duration_value: 0, duration_unit: "day", duration_days: null })).toBe("-");
  });

  it("maps audit results", () => {
    expect(mapAuditResult("VALID")).toBe("Hợp lệ");
    expect(mapAuditResult("KEY_EXPIRED")).toBe("Key đã hết hạn");
    expect(mapAuditResult(null)).toBe("-");
  });

  it("builds dashboard stats", () => {
    const stats = buildDashboardStats([
      {
        id: "1",
        key: "A",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        is_active: true,
        note: null,
        starts_on_first_use: false,
        duration_days: 1,
        duration_value: 1,
        duration_unit: "day",
        max_devices: 1,
        first_used_at: new Date().toISOString(),
      },
      {
        id: "2",
        key: "B",
        created_at: new Date().toISOString(),
        expires_at: null,
        is_active: false,
        note: null,
        starts_on_first_use: true,
        duration_days: 7,
        duration_value: 7,
        duration_unit: "day",
        max_devices: 1,
        first_used_at: null,
      },
    ]);

    expect(stats.total).toBe(2);
    expect(stats.enabled).toBe(1);
    expect(stats.disabled).toBe(1);
    expect(stats.firstUse).toBe(1);
    expect(stats.soonExpired).toBe(1);
  });
});
