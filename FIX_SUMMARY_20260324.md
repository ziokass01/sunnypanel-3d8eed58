# Fix summary

## Files changed
- `src/lib/functions.ts`
  - fixed `postFunction()` to pass both `(path, authToken)` into `buildAuthHeader()`
  - skipped anon JWT fallback for public free/reset functions: `/free-start`, `/free-gate`, `/free-reveal`, `/free-close`, `/free-config`, `/reset-key`
- `src/shell/AdminShell.tsx`
  - user-like accounts now see and can access `Trash` and `Audit logs`
  - remaining sensitive sections stay admin-only
- `src/test/functions-auth-header.test.ts`
  - added regression test for `/free-start` public function auth header behavior

## Files added
- `supabase/migrations/20260324194500_user_audit_trash_and_public_free_fix.sql`
  - drops legacy restrictive admin-only select policies on `audit_logs`, `licenses`, `license_devices`
  - adds scoped read policy for own audit logs
  - updates `public.log_audit()` to allow `RESTORE` and `HARD_DELETE` for owned licenses
- `USER_AUDIT_TRASH_SETUP.sql`
  - helper SQL to assign panel role `user` to a helper account
- `FIX_SUMMARY_20260324.md`

## Next steps
1. Apply the new migration.
2. Run `USER_AUDIT_TRASH_SETUP.sql` after replacing `HELPER_EMAIL`.
3. Redeploy frontend.
