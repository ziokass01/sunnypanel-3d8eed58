# Sunny V10.1 / V34 verify deployment

## Current released protocol

- Request headers: `x-ts`, `x-nonce`, `x-sig`, `x-build-id`.
- Request canonical: `x-ts + "." + x-nonce + "." + sha256(raw_body)`.
- The V10.1 request key embedded in the released menu is accepted directly by `verify-key`.
- `VERIFY_HMAC_SECRET` is retired and is not read.
- `VERIFY_REQUEST_HMAC_SECRET` and `VERIFY_REQUEST_HMAC_SECRETS` are optional rotation/additional-key inputs only.
- Successful responses still require `ECDSA-P256-SHA256-V3`; request HMAC never replaces ECDSA.

## Required runtime secrets

- `VERIFY_GATEWAY_SHARED_SECRET` must match Cloudflare Worker `GATEWAY_SHARED_SECRET`.
- `VERIFY_RESPONSE_ECDSA_PRIVATE_KEY_PEM` must match the public key embedded in the released menu.

## Deploy

```bash
supabase functions deploy verify-key --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt
python3 tools/check_released_menu_v10_1.py
```

A successful request-auth smoke test must return anything other than `UNAUTHORIZED` for the built-in fake key. `KEY_NOT_FOUND`/`INVALID_KEY` means the V10.1 request signature passed and the function reached license validation.
