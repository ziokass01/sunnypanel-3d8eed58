# Production setup checklist

## 1) Supabase database migrations (required for FREE flow)
Production must have **all** FREE tables + RPC rate-limit functions before `/free` and `/free/gate` work correctly.

**Do this one time on production** (either method is OK):
- **SQL Editor**: paste the SQL from these migration files in order (oldest → newest), then run.
- **CLI**: `supabase db push` against the production project.

Recommended minimum set to fix `SERVER_RATE_LIMIT_MISCONFIG`:
- `supabase/migrations/20260205140000_free_rate_limit_idempotent.sql`
- `supabase/migrations/20260206150000_free_schema_runtime_fix.sql`

If your production schema might be behind, run **all** FREE migrations (any file name containing `free`):
- `supabase/migrations/*free*.sql`

**Quick sanity checks (SQL Editor):**
```sql
select to_regclass('public.licenses_free_ip_rate_limits') as licenses_free_ip_rate_limits;
select to_regclass('public.licenses_free_fp_rate_limits') as licenses_free_fp_rate_limits;
select proname from pg_proc where proname in ('check_free_ip_rate_limit','check_free_fp_rate_limit');
```

## 2) Supabase Edge Functions (FREE + admin)
Deploy/redeploy the following functions after migrations are in place:
- `free-config`, `free-start`, `free-gate`, `free-reveal`, `free-close`
- `admin-free-test`, `admin-free-block`, `admin-free-delete-session`, `admin-free-delete-issued`

**Ensure** in `supabase/config.toml`:
- `verify_jwt = true` for admin functions.
- `PUBLIC_BASE_URL` is set to `https://mityangho.id.vn`.

## 3) Supabase secrets
These env vars must exist on the Supabase project:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` (or `SUPABASE_PUBLISHABLE_KEY`)
- `PUBLIC_BASE_URL` = `https://mityangho.id.vn`
- Optional (only if Turnstile is enabled): `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`

## 4) Admin access
- Ensure admin users have role `admin` in `public.has_role` (or are in `ADMIN_EMAILS`).
- `/admin/free-keys` calls `admin-free-test` and requires `Authorization: Bearer <JWT>` from an admin session.
