# Restore note

This package restores the server-app related frontend/auth files from the initial uploaded repo snapshot,
and keeps the current migration file that avoids duplicate-constraint deploy failure.

Restored from initial snapshot:
- `src/App.tsx`
- `src/auth/AuthGate.tsx`
- `src/pages/Login.tsx`
- `src/pages/AdminServerAppRuntime.tsx`
- `src/pages/AdminServerAppTrash.tsx`

Kept from current snapshot:
- `supabase/migrations/20260406150000_server_app_runtime_phase8_antibuse_and_quota.sql`
