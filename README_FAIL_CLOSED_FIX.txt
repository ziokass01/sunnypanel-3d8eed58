FAIL-CLOSED LOGIN FIX

Files changed:
1) supabase/functions/verify-key/index.ts
   - Adds no-store/no-cache headers.
   - Rejects expired licenses even when start_on_first_use=true and first_used_at is NULL.
   - Invalid/expired expires_at now returns { ok:false, msg:"KEY_EXPIRED" }.

2) customer-worker/index.js
   - Adds no-store/no-cache headers to JSON and proxied upstream responses.

3) SunnyLoginModule_FIXED.hpp
   - Poll interval reduced to 60s.
   - Local auth lease capped to 120s.
   - Poll failure logs out instead of keeping old auth.
   - ok=true must include positive remaining_seconds unless lifetime keys are explicitly allowed.
   - HTTP non-2xx returns failure and cannot be parsed as success.
   - Adds no-cache request headers.

After replacing files:
- Deploy supabase function verify-key again.
- Deploy Cloudflare customer-worker again if you use it.
- Replace app login header with SunnyLoginModule_FIXED.hpp, then rebuild APK.
- Rotate VERIFY_HMAC_SECRET on server and in the new app build so old APK builds stop working.
- Test expired, blocked, and offline/server-down cases. They must fail closed.
