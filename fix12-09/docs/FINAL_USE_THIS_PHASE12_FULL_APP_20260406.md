# FINAL USE THIS

This package is the single final package to use for the current phase.

Included:
- App domain UI with Runtime / Cấu hình app / Trash
- Runtime simulator fetch fallback
- Session restore conflict fix (23505 -> SESSION_RESTORE_CONFLICT)
- Trash hard delete actions for sessions and entitlements
- Alias support for delete/purge trash actions
- Build output in dist/

Deploy order:
1. Deploy `server-app-runtime`
2. Deploy `server-app-runtime-ops`
3. Deploy frontend

Functions deploy commands:
```bash
npx supabase functions deploy server-app-runtime --project-ref ijvhlhdrncxtxosmnbtt --no-verify-jwt
npx supabase functions deploy server-app-runtime-ops --project-ref ijvhlhdrncxtxosmnbtt --no-verify-jwt
```
