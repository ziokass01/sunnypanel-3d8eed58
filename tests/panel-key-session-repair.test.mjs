import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

class SessionLedger {
  constructor() {
    this.highWater = new Map();
    this.devices = new Map();
  }

  insert(key, device, recoveryFloor = 1_800_000_000_000) {
    const id = `${key}:${device}`;
    const floor = Math.max(this.highWater.get(id) ?? 0, recoveryFloor);
    const row = { key, device, generation: floor };
    this.devices.set(id, row);
    return row;
  }

  issue(key, device) {
    const id = `${key}:${device}`;
    const row = this.devices.get(id) ?? this.insert(key, device);
    row.generation += 1;
    this.highWater.set(id, row.generation);
    return row.generation;
  }

  deleteDevice(key, device) {
    this.devices.delete(`${key}:${device}`);
  }

  resetActivation(key, recoveryFloor = 1_800_000_000_000) {
    for (const row of this.devices.values()) {
      if (row.key !== key) continue;
      row.generation = Math.max(row.generation + 1, recoveryFloor);
      this.highWater.set(`${row.key}:${row.device}`, row.generation);
    }
  }

  repair(key, device, candidate) {
    const id = `${key}:${device}`;
    const floor = Math.max(this.highWater.get(id) ?? 0, candidate);
    this.highWater.set(id, floor);
    const row = this.devices.get(id);
    if (row) row.generation = Math.max(row.generation, floor);
    return floor;
  }
}

test("device deletion and recreation cannot restart the signed lease generation", () => {
  const ledger = new SessionLedger();
  const key = "SUNNY-AAAA-BBBB-CCCC";
  const device = "device-a";

  for (let i = 0; i < 7; i += 1) ledger.issue(key, device);
  ledger.deleteDevice(key, device);
  const recreated = ledger.insert(key, device);
  const recreatedFloor = recreated.generation;

  assert.ok(recreatedFloor >= 1_800_000_000_000);
  assert.equal(ledger.issue(key, device), recreatedFloor + 1);
});

test("reset activation invalidates old leases by increasing, never lowering, the floor", () => {
  const ledger = new SessionLedger();
  const key = "SUNNY-AAAA-BBBB-CCCC";
  ledger.issue(key, "device-a");
  ledger.issue(key, "device-b");
  ledger.resetActivation(key);

  assert.ok(ledger.highWater.get(`${key}:device-a`) >= 1_800_000_000_000);
  assert.ok(ledger.highWater.get(`${key}:device-b`) >= 1_800_000_000_000);
  const floor = ledger.highWater.get(`${key}:device-a`);
  assert.equal(ledger.issue(key, "device-a"), floor + 1);
});

test("one-time repair only moves a generation floor forward", () => {
  const ledger = new SessionLedger();
  const key = "SUNNY-AAAA-BBBB-CCCC";
  const device = "device-a";
  ledger.issue(key, device);
  const currentFloor = ledger.highWater.get(`${key}:${device}`);

  assert.equal(ledger.repair(key, device, 1000), currentFloor);
  assert.equal(ledger.repair(key, device, 2), currentFloor);
  ledger.deleteDevice(key, device);
  assert.equal(ledger.insert(key, device).generation, currentFloor);
});

test("migration contains the database safeguards required by the client anchor", async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const migration = await readFile(resolve(here, "../supabase/migrations/20260912100000_session_high_water_repair.sql"), "utf8");

  for (const required of [
    "license_session_high_water",
    "trg_guard_license_session_generation",
    "SESSION_GENERATION_ROLLBACK",
    "bump_license_sessions_on_activation_reset",
    "admin_repair_license_session",
    "greatest(v_previous, floor(extract(epoch from clock_timestamp()) * 1000)::bigint)",
  ]) {
    assert.match(migration, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("lifecycle migration exposes atomic panel operations", async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const migration = await readFile(resolve(here, "../supabase/migrations/20260912101000_panel_license_lifecycle.sql"), "utf8");

  for (const required of [
    "panel_mutate_license",
    "reset_activation",
    "CANNOT_CLEAR_EXPIRES",
    "panel_remove_license_device",
    "panel_reset_license_devices",
    "delete from public.license_ip_bindings",
  ]) {
    assert.match(migration, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});


test("follow-up migration automatically recovers legacy-low generations", async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const migration = await readFile(resolve(here, "../supabase/migrations/20260912104000_session_generation_and_edit_followup.sql"), "utf8");
  assert.match(migration, /pg_catalog, public, extensions/);
  assert.match(migration, /extract\(epoch from clock_timestamp\(\)\) \* 1000/);
  assert.match(migration, /REMAINING_FROM_SAVE_TIME/);
  assert.match(migration, /update public\.license_devices/);
});
