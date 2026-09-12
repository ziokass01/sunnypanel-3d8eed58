import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  effectiveBonusDuration,
  keyTypeVisibleForBonus,
  resolveFreeBonus,
  sortKeyTypesForBonus,
} from "./free-shared/bonus.js";

describe("scheduled Free Key bonus", () => {
  const cfg = {
    enabled: true,
    start_time: "00:00",
    end_time: "12:00",
    disable_secondary: true,
    rules: [
      {
        key_type_code: "ff_h12",
        app_code: "free-fire",
        apply_bonus: true,
        bonus_seconds: 0,
        sort_order: 10,
        bonus_only: true,
        replace_same_app: true,
      },
      {
        key_type_code: "fake_h20",
        app_code: "fake-lag",
        apply_bonus: true,
        bonus_seconds: 3600,
        sort_order: 20,
        bonus_only: false,
        replace_same_app: false,
      },
    ],
  };

  const rows = [
    { code: "ff_h10", app_code: "free-fire" },
    { code: "fake_h20", app_code: "fake-lag" },
    { code: "ff_h12", app_code: "free-fire" },
    { code: "ff_h24", app_code: "free-fire" },
    { code: "fd_3d", app_code: "find-dumps" },
  ];

  it("uses Vietnam time and stops exactly at 12:00", () => {
    assert.equal(resolveFreeBonus(cfg, new Date("2026-08-09T04:59:00Z")).active, true);
    assert.equal(resolveFreeBonus(cfg, new Date("2026-08-09T05:00:00Z")).active, false);
  });

  it("supports cross-midnight windows", () => {
    const night = { ...cfg, start_time: "22:00", end_time: "06:00" };
    assert.equal(resolveFreeBonus(night, new Date("2026-08-09T16:00:00Z")).active, true);
    assert.equal(resolveFreeBonus(night, new Date("2026-08-09T00:00:00Z")).active, false);
  });

  it("shows only the configured Free Fire replacement key during Bonus", () => {
    const active = resolveFreeBonus(cfg, new Date("2026-08-09T03:00:00Z"));
    assert.deepEqual(
      sortKeyTypesForBonus(rows, active).map((row) => row.code),
      ["ff_h12", "fake_h20", "fd_3d"],
    );
    assert.equal(keyTypeVisibleForBonus({ code: "ff_h10", app_code: "free-fire" }, active), false);
    assert.equal(keyTypeVisibleForBonus({ code: "ff_h12", app_code: "free-fire" }, active), true);
  });

  it("hides the bonus-only 12H key outside Bonus and restores normal FF keys", () => {
    const inactive = resolveFreeBonus(cfg, new Date("2026-08-09T08:00:00Z"));
    assert.deepEqual(
      sortKeyTypesForBonus(rows, inactive).map((row) => row.code),
      ["ff_h10", "fake_h20", "ff_h24", "fd_3d"],
    );
    assert.equal(keyTypeVisibleForBonus({ code: "ff_h12", app_code: "free-fire" }, inactive), false);
    assert.equal(keyTypeVisibleForBonus({ code: "ff_h10", app_code: "free-fire" }, inactive), true);
  });

  it("keeps additive bonus compatibility for non-replacement keys", () => {
    const active = resolveFreeBonus(cfg, new Date("2026-08-09T03:00:00Z"));
    assert.deepEqual(effectiveBonusDuration(72000, active, "fake_h20"), {
      base_seconds: 72000,
      bonus_seconds: 3600,
      effective_seconds: 75600,
      applied: true,
    });
    assert.equal(effectiveBonusDuration(43200, active, "ff_h12").effective_seconds, 43200);
  });

  it("keeps other apps visible while replacing only the selected app", () => {
    const active = resolveFreeBonus(cfg, new Date("2026-08-09T03:00:00Z"));
    assert.equal(keyTypeVisibleForBonus({ code: "fd_3d", app_code: "find-dumps" }, active), true);
    assert.equal(keyTypeVisibleForBonus({ code: "fake_h20", app_code: "fake-lag" }, active), true);
  });
});
