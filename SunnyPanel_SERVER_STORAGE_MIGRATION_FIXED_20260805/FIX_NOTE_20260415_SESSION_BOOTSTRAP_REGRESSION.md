FIX SESSION_BOOTSTRAP REGRESSION 2026-04-15

Root cause
- A later runtime patch reintroduced strict session-token requirements in server-app-runtime/index.ts for consume and unlock_feature.
- The same patch also dropped safer account/device bootstrap behavior from _shared/server_app_runtime.ts.
- Result: when local session token expired or mismatched, batch file and unlock both fell back to SESSION_NOT_FOUND instead of silently reopening a session.

What was restored
1. server-app-runtime/index.ts
   - consume now tries bootstrap by account_ref + device_id if token is missing or stale
   - unlock_feature now does the same and retries on SESSION_NOT_FOUND / SESSION_INACTIVE / entitlement errors
   - both responses return session_token again after successful retry

2. _shared/server_app_runtime.ts
   - normalized account/device helpers restored
   - reusable session lookup restored across aliases
   - active entitlement lookup restored with alias + device-aware ranking
   - bootstrapRuntimeState rotates/rebuilds session again when needed
   - buildRuntimeState can promote stale session entitlement to the best active entitlement

3. Android app
   - removed client-side hard stop that demanded an already-valid session before paid feature consume
   - access screen refresh now always pulls catalog, which is safer than heartbeat when token is stale
   - runtime center consume path now lets the client/bootstrap reopen session instead of blocking early

When this bug shows up again
- Symptom: batch file or unlock shows SESSION_NOT_FOUND / "Phiên cũ trên máy..." right after server request
- Check first:
  1) server-app-runtime/index.ts still has bootstrap+retry in consume and unlock_feature
  2) _shared/server_app_runtime.ts still has normalizeAccountRef/getAccountRefAliases/normalizeDeviceId
  3) bootstrapRuntimeState still recreates a session from account_ref + device_id
  4) app code is not blocking on missing session before RuntimeApiClient can retry

Safe fix order
1. restore server bootstrap+retry
2. deploy server-app-runtime
3. rebuild app
4. test with expired session, batch file, and unlock_feature
