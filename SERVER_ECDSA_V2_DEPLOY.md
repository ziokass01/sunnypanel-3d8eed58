# Sunny verify-key ECDSA P-256 V2

## What changed

- Successful `verify-key` responses are now signed with ECDSA P-256/SHA-256.
- The response private key exists only in Supabase secrets. The JNI contains only the public key.
- The signature binds the request nonce/body hash, key hash, device hash, build ID, expiry, server time and a short-lived session.
- `x-build-id` is forwarded by the Cloudflare customer worker and must match `build_id` in the JSON body.
- IP, key and new-device rate-limit RPC failures now fail closed.
- The old admin-JWT bypass was removed from the public `verify-key` endpoint.

## Required secret setup

Use the PKCS#8 file from the separate offline key package:

```bash
supabase secrets set \
  VERIFY_RESPONSE_ECDSA_PRIVATE_KEY_PEM="$(cat sunny_server_private_p256_pkcs8.pem)" \
  VERIFY_SESSION_TTL_SECONDS="900" \
  VERIFY_REQUIRED_BUILD_ID="sunny-v31-ac-20260616"
```

The current JNI still signs requests with the existing request HMAC. Keep the current value available under `VERIFY_HMAC_SECRET`, or copy it to the clearer transitional name:

```bash
supabase secrets set VERIFY_REQUEST_HMAC_SECRET="YOUR_CURRENT_REQUEST_HMAC_SECRET"
```

The function reads `VERIFY_REQUEST_HMAC_SECRET` first and falls back to `VERIFY_HMAC_SECRET`, so deployment does not require an immediate client-secret rotation.

## Deploy order

1. Set the ECDSA private-key secret first.
2. Deploy `verify-key`.
3. Deploy the customer worker because it now forwards `x-build-id`.
4. Test one real login with the JNI Anti-Crack/EXP V1 build.
5. Confirm the response contains:
   - `server_sig_alg: ECDSA-P256-SHA256-V2`
   - `server_key_id: sunny-p256-2026-07-a`
   - `session_id`, `session_expires_at`, `feature_seed`
6. Let the menu run beyond 12 minutes to confirm signed-session renewal works.
7. Only after successful testing, make ECDSA mandatory in the JNI by setting `SUNNY_ALLOW_LEGACY_HMAC_V1` to `0` and rotate the request HMAC secret in both client and server.

## Important

- Never upload the private PEM to the web source, APK, GitHub, Cloudflare Worker variables visible to clients, or public downloads.
- Do not rename the key ID without rebuilding the JNI. The client currently expects `sunny-p256-2026-07-a`.
- A session TTL shorter than the JNI poll interval will log users out. Default is 900 seconds; the JNI polls at about 12 minutes.
- The server deliberately returns `503 SERVER_ERROR` instead of an unsigned `ok=true` when signing or security RPCs fail.
