# V34 server security model

- Request HMAC is retained only to rate-limit simple fake clients and key enumeration. Its secret exists in the client and is not treated as a trusted identity.
- Cloudflare-to-Supabase requests use a separate server-only HMAC secret.
- Direct Supabase-origin requests are rejected when gateway mode is enabled.
- Device possession can be proven with a non-exportable AndroidKeyStore P-256 key.
- Every successful lease increments a server-side per-device session generation.
- Build expiry and EXP generation are stored in the database and included in the ECDSA response.
- `max_devices`, `started`, device-key status and all lease fields are covered by ECDSA V3.
- A patched client can ignore local checks, but it cannot create a fresh valid signature, generation or unexpired build lease without the server private key and database authority.
