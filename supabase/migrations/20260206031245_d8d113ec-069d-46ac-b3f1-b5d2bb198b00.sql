-- Explicitly deny anonymous (role: anon) SELECT on sensitive tables (idempotent)
DO $$
DECLARE
  pol_exists boolean;
  t text;
  tables text[] := ARRAY[
    'audit_logs','licenses','license_devices','licenses_free_issues','licenses_free_sessions','blocked_ips','security_alerts',
    'verify_rate_limits','verify_ip_rate_limits','verify_new_device_rate_limits','free_ip_rate_limits',
    'licenses_free_settings','licenses_free_key_types','user_roles'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    SELECT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND policyname='deny_anon_select'
    ) INTO pol_exists;

    IF NOT pol_exists THEN
      EXECUTE format(
        'CREATE POLICY deny_anon_select ON public.%I AS RESTRICTIVE FOR SELECT TO anon USING (false)',
        t
      );
    END IF;
  END LOOP;
END$$;

-- Also FORCE RLS for user_roles (owner bypass hardening)
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;
