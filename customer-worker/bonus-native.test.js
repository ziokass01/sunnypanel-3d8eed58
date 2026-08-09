import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { effectiveBonusDuration, resolveFreeBonus, sortKeyTypesForBonus } from "./free-shared/bonus.js";

describe("scheduled Free Key bonus", () => {
  const cfg = {
    enabled: true,
    start_time: "00:00",
    end_time: "12:00",
    disable_secondary: true,
    rules: [
      { key_type_code: "ff_h10", apply_bonus: true, bonus_seconds: 7200, sort_order: 10 },
      { key_type_code: "ff_h24", apply_bonus: false, bonus_seconds: 0, sort_order: 20 },
    ],
  };

  it("uses Vietnam time and stops exactly at 12:00", () => {
    assert.equal(resolveFreeBonus(cfg, new Date("2026-08-09T04:59:00Z")).active, true); // 11:59 VN
    assert.equal(resolveFreeBonus(cfg, new Date("2026-08-09T05:00:00Z")).active, false); // 12:00 VN
  });

  it("supports cross-midnight windows", () => {
    const night = { ...cfg, start_time: "22:00", end_time: "06:00" };
    assert.equal(resolveFreeBonus(night, new Date("2026-08-09T16:00:00Z")).active, true); // 23:00 VN
    assert.equal(resolveFreeBonus(night, new Date("2026-08-09T00:00:00Z")).active, false); // 07:00 VN
  });

  it("adds the configured duration only to selected key types", () => {
    const runtime = resolveFreeBonus(cfg, new Date("2026-08-09T03:00:00Z"));
    assert.deepEqual(effectiveBonusDuration(36000, runtime, "ff_h10"), {
      base_seconds: 36000,
      bonus_seconds: 7200,
      effective_seconds: 43200,
      applied: true,
    });
    assert.equal(effectiveBonusDuration(86400, runtime, "ff_h24").effective_seconds, 86400);
  });

  it("reorders key types only during the active bonus window", () => {
    const rows = [{ code: "other" }, { code: "ff_h24" }, { code: "ff_h10" }];
    const active = resolveFreeBonus(cfg, new Date("2026-08-09T03:00:00Z"));
    assert.deepEqual(sortKeyTypesForBonus(rows, active).map((r) => r.code), ["ff_h10", "ff_h24", "other"]);
    const inactive = resolveFreeBonus(cfg, new Date("2026-08-09T08:00:00Z"));
    assert.deepEqual(sortKeyTypesForBonus(rows, inactive).map((r) => r.code), ["other", "ff_h24", "ff_h10"]);
  });
});
