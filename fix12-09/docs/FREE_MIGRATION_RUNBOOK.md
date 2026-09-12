# FREE migration runbook (production)

## 1) Apply migration in Supabase SQL Editor
Run the latest migration file:

- `supabase/migrations/20260206150000_free_schema_runtime_fix.sql`

This migration is idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`), safe to run again.

## 2) Quick verification queries

```sql
-- tables
select to_regclass('public.licenses_free_sessions') as licenses_free_sessions;
select to_regclass('public.licenses_free_ip_rate_limits') as licenses_free_ip_rate_limits;
select to_regclass('public.licenses_free_fp_rate_limits') as licenses_free_fp_rate_limits;
select to_regclass('public.licenses_free_blocklist') as licenses_free_blocklist;
select to_regclass('public.licenses_free_security_logs') as licenses_free_security_logs;
select to_regclass('public.licenses_free_admin_logs') as licenses_free_admin_logs;

-- RPC
select proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public'
  and proname in ('check_free_ip_rate_limit','check_free_fp_rate_limit')
order by proname, args;
```

## 3) Required secrets
- `PUBLIC_BASE_URL=https://mityangho.id.vn`
- `ADMIN_EMAILS=<comma-separated admin emails>`
- Keep `SUPABASE_SERVICE_ROLE_KEY` only in Edge Functions (never frontend).

## 4) Deploy free/admin functions
Deploy at least:
- `free-config`, `free-start`, `free-gate`, `free-reveal`, `free-close`
- `admin-free-test` (and/or `free-admin-test`), `admin-free-block`, `admin-free-delete-issued`, `admin-free-delete-session`

## 5) Production constants
- Outbound Link4M: `https://link4m.com/PkY7X`
- Callback: `https://mityangho.id.vn/free/gate`
- Claim page: `https://mityangho.id.vn/free/claim`
