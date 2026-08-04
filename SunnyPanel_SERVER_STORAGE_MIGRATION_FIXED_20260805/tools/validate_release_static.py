#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERIFY = ROOT / "supabase/functions/verify-key/index.ts"
WORKER = ROOT / "customer-worker/index.js"
FAKE_LAG = ROOT / "supabase/functions/fake-lag-auth/index.ts"
WRANGLER = ROOT / "customer-worker/wrangler.jsonc"

checks: list[tuple[str, bool]] = []

def check(name: str, value: bool) -> None:
    checks.append((name, bool(value)))

verify = VERIFY.read_text(encoding="utf-8")
worker = WORKER.read_text(encoding="utf-8")
fake_lag = FAKE_LAG.read_text(encoding="utf-8")
wrangler = WRANGLER.read_text(encoding="utf-8")

check("verify build", '"sunny-v34-ac-20260721"' in verify)
check("verify product", '"sunny-free-fire"' in verify)
check("verify ECDSA V3", '"ECDSA-P256-SHA256-V3"' in verify)
check("verify key id", '"sunny-p256-2026-07-b"' in verify)
check("released V10.1 request key retained", "RELEASED_MENU_V10_1_REQUEST_HMAC_KEY" in verify)
check("retired VERIFY_HMAC_SECRET not read", 'Deno.env.get("VERIFY_HMAC_SECRET")' not in verify)
check("request canonical unchanged", '`${ts}.${nonce}.${requestBodyHash}`' in verify)
check("success response remains signed", "okBody.server_sig = await ecdsaP256SignDerBase64(responseCanonical)" in verify)
check("gateway required by default", 'Deno.env.get("VERIFY_REQUIRE_GATEWAY") ?? "1"' in verify)
check("worker strips client gateway headers", "Never forward client-controlled gateway identity headers" in worker)
check("worker signs verify gateway request", 'headers.set("x-gateway-signature", signature)' in worker)
check("worker rate limit missing binding fails closed", "ALLOW_UNBOUND_RATE_LIMITS" in worker and "unavailable: !allowUnbound" in worker)
check("workers.dev disabled", '"workers_dev": false' in wrangler)
check("preview URLs disabled", '"preview_urls": false' in wrangler)
check("verify limiter configured", '"VERIFY_RATE_LIMITER"' in wrangler)
check("fake lag stale quota fallback removed", "FAKE_LAG_QUOTA_RPC_FAILED" in fake_lag and "fallback: true" not in fake_lag)
check("fake lag quota error returns 503", 'return json({ ok: false, msg: "SERVER_ERROR" }, 503);' in fake_lag)

# JavaScript syntax.
node = subprocess.run(["node", "--check", str(WORKER)], capture_output=True, text=True)
check("worker JavaScript syntax", node.returncode == 0)

# JSONC is intentionally JSON-compatible in this repository (no comments).
try:
    json.loads(wrangler)
    check("wrangler JSON syntax", True)
except Exception:
    check("wrangler JSON syntax", False)

# Migration order and required RPC presence.
m1 = ROOT / "supabase/migrations/20260804120000_verify_ddos_hardening.sql"
m2 = ROOT / "supabase/migrations/20260804160000_license_consistency_reset_fix.sql"
m3 = ROOT / "supabase/migrations/20260805020000_storage_emergency_cleanup_and_disable_rent.sql"
check("DDoS migration exists", m1.is_file())
check("license consistency migration exists", m2.is_file())
check("storage cleanup migration exists", m3.is_file())
if m2.is_file():
    sql = m2.read_text(encoding="utf-8")
    check("atomic reset RPC present", "reset_license_key_atomic" in sql)
    check("Fake Lag quota RPC locked to service role", "revoke all on function public.increment_fake_lag_license_use" in sql)

if m3.is_file():
    cleanup_sql = m3.read_text(encoding="utf-8").lower()
    forbidden_cleanup_targets = [
        "truncate table public.licenses",
        "truncate public.licenses",
        "delete from public.licenses ",
        "truncate table public.license_devices",
        "delete from public.license_devices",
        "truncate table public.license_ip_bindings",
        "delete from public.license_ip_bindings",
        "delete from auth.users",
        "truncate table auth.users",
    ]
    check("cleanup avoids license/user business tables", not any(item in cleanup_sql for item in forbidden_cleanup_targets))
    check("cleanup creates bounded retention function", "sunny_storage_cleanup" in cleanup_sql)
    check("cleanup does not enable pg_cron", "create extension" not in cleanup_sql)

check("rent route disabled in worker", "rentFunctions" in worker and "FEATURE_DISABLED" in worker)
check("rent disabled in workflow secrets", all(
    '"RENT_FEATURE_ENABLED=0"' in (ROOT / path).read_text(encoding="utf-8")
    for path in [".github/workflows/supabase-functions.yml", ".github/workflows/supabase-deploy.yml"]
))
check("db push fetches remote history safely", "supabase migration fetch --linked" in (ROOT / "tools/db_push_password_auth.sh").read_text(encoding="utf-8"))

for name, ok in checks:
    print(f"{'PASS' if ok else 'FAIL'}: {name}")
failed = [name for name, ok in checks if not ok]
if failed:
    raise SystemExit("Static release validation failed: " + ", ".join(failed))

print(f"PASS: {len(checks)}/{len(checks)} static checks")
print("verify_sha256=" + hashlib.sha256(VERIFY.read_bytes()).hexdigest())
