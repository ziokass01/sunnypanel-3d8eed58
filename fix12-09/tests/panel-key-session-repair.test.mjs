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

  insert(key, device) {
    const id = `${key}:${device}`;
    const floor = this.highWater.get(id) ?? 0;
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

  resetActivation(key) {
    for (const row of this.devices.values()) {
      if (row.key !== key) continue;
      row.generation += 1;
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

  assert.equal(recreated.generation, 7);
  assert.equal(ledger.issue(key, device), 8);
});

test("reset activation invalidates old leases by increasing, never lowering, the floor", () => {
  const ledger = new SessionLedger();
  const key = "SUNNY-AAAA-BBBB-CCCC";
  ledger.issue(key, "device-a");
  ledger.issue(key, "device-b");
  ledger.resetActivation(key);

  assert.equal(ledger.highWater.get(`${key}:device-a`), 2);
  assert.equal(ledger.highWater.get(`${key}:device-b`), 2);
  assert.equal(ledger.issue(key, "device-a"), 3);
});

test("one-time repair only moves a generation floor forward", () => {
  const ledger = new SessionLedger();
  const key = "SUNNY-AAAA-BBBB-CCCC";
  const device = "device-a";
  ledger.issue(key, device);

  assert.equal(ledger.repair(key, device, 1000), 1000);
  assert.equal(ledger.repair(key, device, 2), 1000);
  ledger.deleteDevice(key, device);
  assert.equal(ledger.insert(key, device).generation, 1000);
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
