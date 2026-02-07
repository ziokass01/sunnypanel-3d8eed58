-- Force RLS on sensitive tables (idempotent)
-- NOTE: Some objects (e.g. free_*_rate_limits) may be implemented as views for compatibility.
-- FORCE RLS only applies to real tables, so we guard by relkind.

DO $$
DECLARE
  tbl text;
  is_table boolean;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'audit_logs',
    'licenses',
    'license_devices',
    'licenses_free_issues',
    'licenses_free_sessions',
    'security_alerts',
    'blocked_ips',
    'verify_rate_limits',
    'verify_ip_rate_limits',
    'verify_new_device_rate_limits',
    'free_ip_rate_limits',
    'free_fp_rate_limits',
    'licenses_free_settings',
    'licenses_free_key_types'
  ] LOOP
    SELECT (c.relkind IN ('r','p'))
      INTO is_table
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = tbl;

    IF NOT FOUND OR NOT is_table THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;
