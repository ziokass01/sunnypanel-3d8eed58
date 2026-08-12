import { beforeEach, describe, expect, it } from "vitest";
import { getFreeSuccessTodayForApp } from "@/features/free/quota-display";
import { markFreeSuccess, readFreeDeviceHistory } from "@/features/free/flow-ux";

function vietnamTodayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

describe("free quota history migration", () => {
  beforeEach(() => localStorage.clear());

  it("preserves v1 Free Fire successes when recording the next success", () => {
    localStorage.setItem("sunny_free_device_history_v1", JSON.stringify({
      day: vietnamTodayKey(),
      attemptsToday: 5,
      successToday: 4,
    }));

    markFreeSuccess({ appCode: "free-fire", keyLabel: "Key Free Fire" });
    const history = readFreeDeviceHistory();
    expect(history.successToday).toBe(5);
    expect(getFreeSuccessTodayForApp(history, "free-fire")).toBe(5);
  });

  it("migrates old successes to Free Fire without mixing a new app success", () => {
    localStorage.setItem("sunny_free_device_history_v1", JSON.stringify({
      day: vietnamTodayKey(),
      attemptsToday: 5,
      successToday: 4,
    }));

    markFreeSuccess({ appCode: "find-dumps", keyLabel: "Find Dumps" });
    const history = readFreeDeviceHistory();
    expect(getFreeSuccessTodayForApp(history, "free-fire")).toBe(4);
    expect(getFreeSuccessTodayForApp(history, "find-dumps")).toBe(1);
  });
});
