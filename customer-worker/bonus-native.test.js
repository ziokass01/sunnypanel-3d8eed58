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
      ["fake_h20", "ff_h12", "fd_3d"],
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

describe('Bonus regressions',()=>{
 const time=new Date('2026-11-14T03:00:00Z'),base={enabled:true,start_time:'00:00',end_time:'00:00'};
 it('retained hours and stale apply flag cannot enable a disabled switch',()=>{
  for(const h of [2,4]){const rt=resolveFreeBonus({...base,rules:[{key_type_code:'key',replace_same_app:false,apply_bonus:true,bonus_seconds:h*3600}]},time);assert.equal(effectiveBonusDuration(36000,rt,'key').bonus_seconds,0);}
 });
 it('both replacement keys can be enabled with independent bonus durations',()=>{
  const rules=[2,4].map((h,i)=>({key_type_code:'key'+i,app_code:'free-fire',enabled:true,replace_same_app:true,bonus_only:true,bonus_seconds:h*3600}));
  const rt=resolveFreeBonus({...base,rules},time),rows=[{code:'normal',app_code:'free-fire'},...rules.map(r=>({code:r.key_type_code,app_code:r.app_code}))];
  assert.deepEqual(sortKeyTypesForBonus(rows,rt).map(r=>r.code),['key0','key1']);
  assert.equal(effectiveBonusDuration(36000,rt,'key0').bonus_seconds,7200);assert.equal(effectiveBonusDuration(72000,rt,'key1').bonus_seconds,14400);
  assert.equal(effectiveBonusDuration(36000,resolveFreeBonus({...base,enabled:false,rules},time),'key0').bonus_seconds,0);
 });
 it('table order wins over Bonus rule order both inside and outside Bonus',()=>{
  const rows=[{code:'tool',sort_order:60},{code:'ff10',sort_order:10},{code:'ff20',sort_order:20}];
  for(const enabled of [true,false])assert.deepEqual(sortKeyTypesForBonus(rows,resolveFreeBonus({...base,enabled,rules:[{key_type_code:'tool',sort_order:1}]},time)).map(r=>r.code),['ff10','ff20','tool']);
 });
});
