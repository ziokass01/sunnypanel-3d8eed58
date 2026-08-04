# Safe update procedure for the running server

## 0. Do not change these production values

- `GATEWAY_SHARED_SECRET` in Cloudflare must equal `VERIFY_GATEWAY_SHARED_SECRET` in Supabase.
- `VERIFY_RESPONSE_ECDSA_PRIVATE_KEY_PEM` must remain the private key matching the public key embedded in Sunny V10.1.
- Do not set or restore `VERIFY_HMAC_SECRET`; it is retired.

## 1. Make a backup

Create a fresh Supabase database backup before migrations. Keep the current Worker deployment and current Git commit/ZIP available for rollback.

## 2. Validate the source before deployment

```bash
python3 tools/validate_release_static.py
python3 tools/validate_menu_server_contract.py /path/to/extracted/SRC-V10.1
```

Both commands must end in `PASS`.

## 3. Apply database migrations first

```bash
supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"
supabase db push --include-all
```

If CLI reports the broken `cli_login_postgres` membership error, run `SQL_REPAIR_CLI_LOGIN_ROLE.sql` once in Supabase SQL Editor, then retry `db push`.

Do not deploy `reset-key` until both 20260804 migrations are applied.

## 4. Deploy Edge Functions

Deploy the affected functions after migrations:

```bash
for fn in verify-key reset-key free-start free-admin-test admin-free-test \
  fake-lag-auth fake-lag-check admin-free-block server-app-runtime-ops; do
  supabase functions deploy "$fn" --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt
done
```

`verify-key` is included because this package contains the confirmed V10.1-compatible working version. Its public response contract has not been changed by the additional audit fixes.

## 5. Deploy Cloudflare Worker

Confirm both rate-limit bindings exist in `customer-worker/wrangler.jsonc`, then:

```bash
cd customer-worker
npx wrangler deploy
cd ..
```

Never set `ALLOW_UNBOUND_RATE_LIMITS=1` in production.

## 6. Smoke test before announcing completion

```bash
python3 tools/check_released_menu_v10_1.py
```

For the built-in fake key, `KEY_NOT_FOUND` or `INVALID_KEY` means request authentication passed. `UNAUTHORIZED` or `GATEWAY_REQUIRED` means stop and roll back.

Then test one real key and verify:

- menu logs in normally;
- response algorithm/key id are unchanged;
- expiration/remaining time is correct;
- device limit and reset display are correct;
- reset removes device/IP and clears Fake Lag verify count;
- repeated same-device login does not consume another Fake Lag use.

## Rollback

If the V10.1 smoke test returns `UNAUTHORIZED` after function deployment, immediately redeploy the previous known-working `verify-key` source from `dumperx_FIXED_MENU_V10_1_20260805.zip`. Worker and non-verify functions can be rolled back independently.
