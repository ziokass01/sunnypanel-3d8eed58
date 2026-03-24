-- Add RESTRICTIVE SELECT policies that explicitly block anonymous reads (idempotent)
DO $$
DECLARE
  pol_exists boolean;
  is_table boolean;
  t text;
  tables text[] := ARRAY[
    'audit_logs','licenses','license_devices','licenses_free_issues','licenses_free_sessions','blocked_ips','security_alerts',
    'verify_rate_limits','verify_ip_rate_limits','verify_new_device_rate_limits','free_ip_rate_limits',
    'licenses_free_settings','licenses_free_key_types'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Policies only apply to real tables (not views). Skip if missing or not a table.
    SELECT (c.relkind IN ('r','p'))
      INTO is_table
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = t;
    IF NOT FOUND OR NOT is_table THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND policyname='restrict_select_authenticated'
    ) INTO pol_exists;

    IF NOT pol_exists THEN
      EXECUTE format(
        'CREATE POLICY restrict_select_authenticated ON public.%I AS RESTRICTIVE FOR SELECT USING (auth.uid() IS NOT NULL)',
        t
      );
    END IF;
  END LOOP;
END$$;
