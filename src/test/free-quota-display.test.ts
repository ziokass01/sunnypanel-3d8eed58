import { describe, expect, it } from "vitest";
import { getFreeSuccessTodayForApp, resolveFreeRemainingToday } from "@/features/free/quota-display";

describe("free quota display", () => {
  it("uses the authoritative remaining value when the backend returns one", () => {
    expect(resolveFreeRemainingToday({
      appCode: "free-fire",
      serverRemaining: 7,
      fingerprintLimit: 51,
      ipLimit: 51,
      localSuccessToday: 20,
    })).toEqual({ remaining: 7, estimated: false, unlimited: false });
  });

  it("shows a safe device estimate when the shared DDoS cache removes personal counts", () => {
    expect(resolveFreeRemainingToday({
      appCode: "free-fire",
      serverRemaining: null,
      fingerprintLimit: 51,
      ipLimit: 51,
      localSuccessToday: 2,
    })).toEqual({ remaining: 49, estimated: true, unlimited: false });
  });

  it("uses the tighter app quota and never renders a negative number", () => {
    expect(resolveFreeRemainingToday({
      appCode: "find-dumps",
      serverRemaining: null,
      fingerprintLimit: 5,
      ipLimit: 3,
      localSuccessToday: 9,
    })).toEqual({ remaining: 0, estimated: true, unlimited: false });
  });

  it("marks quota as unlimited when both configured limits are disabled", () => {
    expect(resolveFreeRemainingToday({
      appCode: "free-fire",
      serverRemaining: null,
      fingerprintLimit: 0,
      ipLimit: 0,
      localSuccessToday: 3,
    })).toEqual({ remaining: null, estimated: false, unlimited: true });
  });

  it("keeps success counters isolated per app and migrates v1 only to free-fire", () => {
    expect(getFreeSuccessTodayForApp({ successToday: 4 }, "free-fire")).toBe(4);
    expect(getFreeSuccessTodayForApp({ successToday: 4 }, "find-dumps")).toBe(0);
    expect(getFreeSuccessTodayForApp({
      successToday: 9,
      successTodayByApp: { "free-fire": 2, "find-dumps": 3 },
    }, "find-dumps")).toBe(3);
  });
});
