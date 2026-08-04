# SunnyPanel running-server safe update — 2026-08-05

## Base and compatibility

This release is based on the original `dumperx.zip` security/update branch, plus the confirmed Sunny V10.1 request-auth compatibility fix.

The currently working `verify-key` protocol is intentionally preserved:

- endpoint: `https://mityangho.id.vn/api/verify-key`
- build: `sunny-v34-ac-20260721`
- product: `sunny-free-fire`
- response signature: `ECDSA-P256-SHA256-V3`
- response key id: `sunny-p256-2026-07-b`
- request headers: `x-ts`, `x-nonce`, `x-sig`, `x-build-id`
- request canonical: `x-ts + "." + x-nonce + "." + sha256(raw_body)`
- retired `VERIFY_HMAC_SECRET` is not read

Do not replace `supabase/functions/verify-key/index.ts` with an older copy.

## Additional fixes after the dumperx audit

1. Fake Lag quota RPC now fails closed.
   - Removed the stale read + plain update fallback in `fake-lag-auth`.
   - On RPC/database failure, a newly-created device row is removed and the request returns `503 SERVER_ERROR`.
   - This prevents concurrent requests from exceeding or rolling back `verify_count`.

2. Cloudflare rate-limit bindings now fail closed.
   - Missing `API_RATE_LIMITER` or `VERIFY_RATE_LIMITER` no longer silently disables DDoS protection.
   - `ALLOW_UNBOUND_RATE_LIMITS=1` exists only for local Worker testing and must not be enabled in production.

3. Safe deployment guards were added.
   - Contract validator for the released V10.1 menu.
   - Static release validator and SHA-256 manifest.
   - Deployment order and rollback notes.

## Database migrations included from dumperx

Run in timestamp order:

1. `20260804120000_verify_ddos_hardening.sql`
2. `20260804160000_license_consistency_reset_fix.sql`

The second migration contains the atomic reset RPC and the duration/device/IP/verify consistency repairs. Deploying the new `reset-key` function before this migration can cause reset failures.

## Storage + migration-history hotfix

- `db push` now fetches remote migration history inside the runner before validation.
- Pending migration files are SHA-256 protected before/after fetch.
- Added emergency cleanup migration `20260805020000_storage_emergency_cleanup_and_disable_rent.sql`.
- High-churn logs, nonce/rate buckets and regenerable caches are cleared without touching licenses/users/devices/business records.
- Rent is closed in frontend, Worker and Edge Functions with `RENT_FEATURE_ENABLED=0`.
- `verify-key/index.ts` remains byte-for-byte unchanged.
