# Sunny V34 server-authority deployment

V34 changes the response protocol to `ECDSA-P256-SHA256-V3`. Build the V34 client first. The final `verify-key` deployment will make V33 clients incompatible.

## 1. Apply the database migration

Open Supabase SQL Editor and run:

```text
supabase/migrations/20260721_sunny_v34_server_authority.sql
```

This creates:

- server-controlled build validity and EXP generation;
- per-device monotonically increasing session generation;
- optional device public-key binding columns;
- the service-role-only `issue_sunny_v34_lease` RPC.

The initial V34 build expires seven days after the migration is run. This is the independent server-controlled build expiry.

## 2. Create a gateway secret

Run locally:

```bash
openssl rand -hex 32
```

Use the same generated value in exactly two server locations:

- Cloudflare Worker secret: `GATEWAY_SHARED_SECRET`
- Supabase secret: `VERIFY_GATEWAY_SHARED_SECRET`

Never place this gateway secret in JNI, the web frontend, GitHub or screenshots.

## 3. Deploy Cloudflare Worker first

Replace the active Worker code with:

```text
customer-worker/index.js
```

Set `GATEWAY_SHARED_SECRET`, then deploy. The Worker now:

- ignores client-supplied gateway identity headers;
- reads the real IP from `CF-Connecting-IP`;
- hashes the exact request body;
- signs method, function, timestamp, nonce, IP and body hash;
- forwards the authenticated gateway envelope to Supabase.

The V33 server ignores these additional headers, so this step does not interrupt V33.

Health check:

```bash
curl -sS https://mityangho.id.vn/api/health
```

Expected fields include `fixed-api-gateway-v34` and `gateway_auth:true`. The upstream Supabase URL is no longer exposed.

## 4. Set Supabase secrets

```bash
supabase secrets set \
  "VERIFY_GATEWAY_SHARED_SECRET=PASTE_THE_SAME_GATEWAY_SECRET" \
  "VERIFY_REQUIRE_GATEWAY=1" \
  "VERIFY_REQUIRED_BUILD_ID=sunny-v34-ac-20260721" \
  "VERIFY_PRODUCT_ID=sunny-free-fire" \
  "VERIFY_RESPONSE_ECDSA_KEY_ID=sunny-p256-2026-07-b" \
  "VERIFY_REQUIRE_DEVICE_KEY=0"
```

Keep the existing values for:

- `VERIFY_RESPONSE_ECDSA_PRIVATE_KEY_PEM`
- `VERIFY_REQUEST_HMAC_SECRET`
- `VERIFY_SESSION_TTL_SECONDS`

There is no fallback to the removed legacy `VERIFY_HMAC_SECRET`.

Start with `VERIFY_REQUIRE_DEVICE_KEY=0` because some virtual spaces do not expose AndroidKeyStore correctly. When audit logs show stable `device_key_bound:true` for supported environments, strict mode can be enabled:

```bash
supabase secrets set "VERIFY_REQUIRE_DEVICE_KEY=1"
```

Once a device has successfully bound a public key, subsequent requests for that device require the matching private-key proof even while global strict mode is off.

## 5. Deploy verify-key

Copy:

```text
supabase/functions/verify-key/index.ts
```

Then deploy:

```bash
supabase functions deploy verify-key --no-verify-jwt
```

## 6. Negative tests

Direct origin must fail because it lacks the Worker signature:

```bash
curl -i https://YOUR_PROJECT.supabase.co/functions/v1/verify-key \
  -H 'content-type: application/json' \
  --data '{}'
```

Expected: HTTP 403 with `GATEWAY_REQUIRED`.

The normal domain must reach the function through Cloudflare. A valid V34 client must receive:

```text
server_sig_alg      ECDSA-P256-SHA256-V3
build_id            sunny-v34-ac-20260721
product_id          sunny-free-fire
session_generation  increasing positive integer
exp_generation      positive integer
```

Tampering with `started`, `max_devices`, generation, build expiry or device-key status must produce `SERVER_SIG_BAD` in the client.

## 7. Build expiry / release rotation

To extend or rotate a legitimate release, do it server-side and increment the EXP generation:

```sql
update public.security_client_builds
set expires_at = now() + interval '7 days',
    exp_generation = exp_generation + 1,
    updated_at = now()
where build_id = 'sunny-v34-ac-20260721';
```

To revoke V34 immediately:

```sql
update public.security_client_builds
set is_active = false,
    exp_generation = exp_generation + 1,
    updated_at = now()
where build_id = 'sunny-v34-ac-20260721';
```

## Emergency rollback

If the Worker envelope is misconfigured, temporarily disable only the gateway requirement:

```bash
supabase secrets set "VERIFY_REQUIRE_GATEWAY=0"
```

Do not remove ECDSA V3 verification, build expiry or session generations. Restore gateway mode after correcting the shared secret.
