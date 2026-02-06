-- Fix: create RESTRICTIVE admin-only SELECT policies (idempotent)
DO $$
DECLARE
  pol_exists boolean;
BEGIN
  -- Helper macro pattern repeated per table (policies are per-table objects)

  -- audit_logs
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='audit_logs' AND policyname='restrict_select_admins'
  ) INTO pol_exists;
  IF NOT pol_exists THEN
    EXECUTE 'CREATE POLICY restrict_select_admins ON public.audit_logs AS RESTRICTIVE FOR SELECT USING (public.has_role(auth.uid(), ''admin''::public.app_role))';
  END IF;

  -- licenses
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='licenses' AND policyname='restrict_select_admins'
  ) INTO pol_exists;
  IF NOT pol_exists THEN
    EXECUTE 'CREATE POLICY restrict_select_admins ON public.licenses AS RESTRICTIVE FOR SELECT USING (public.has_role(auth.uid(), ''admin''::public.app_role))';
  END IF;

  -- license_devices
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='license_devices' AND policyname='restrict_select_admins'
  ) INTO pol_exists;
  IF NOT pol_exists THEN
    EXECUTE 'CREATE POLICY restrict_select_admins ON public.license_devices AS RESTRICTIVE FOR SELECT USING (public.has_role(auth.uid(), ''admin''::public.app_role))';
  END IF;

  -- licenses_free_issues
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='licenses_free_issues' AND policyname='restrict_select_admins'
  ) INTO pol_exists;
  IF NOT pol_exists THEN
    EXECUTE 'CREATE POLICY restrict_select_admins ON public.licenses_free_issues AS RESTRICTIVE FOR SELECT USING (public.has_role(auth.uid(), ''admin''::public.app_role))';
  END IF;

  -- licenses_free_sessions
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='licenses_free_sessions' AND policyname='restrict_select_admins'
  ) INTO pol_exists;
  IF NOT pol_exists THEN
    EXECUTE 'CREATE POLICY restrict_select_admins ON public.licenses_free_sessions AS RESTRICTIVE FOR SELECT USING (public.has_role(auth.uid(), ''admin''::public.app_role))';
  END IF;

  -- security_alerts
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='security_alerts' AND policyname='restrict_select_admins'
  ) INTO pol_exists;
  IF NOT pol_exists THEN
    EXECUTE 'CREATE POLICY restrict_select_admins ON public.security_alerts AS RESTRICTIVE FOR SELECT USING (public.has_role(auth.uid(), ''admin''::public.app_role))';
  END IF;

  -- blocked_ips
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='blocked_ips' AND policyname='restrict_select_admins'
  ) INTO pol_exists;
  IF NOT pol_exists THEN
    EXECUTE 'CREATE POLICY restrict_select_admins ON public.blocked_ips AS RESTRICTIVE FOR SELECT USING (public.has_role(auth.uid(), ''admin''::public.app_role))';
  END IF;

  -- verify_rate_limits
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='verify_rate_limits' AND policyname='restrict_select_admins'
  ) INTO pol_exists;
  IF NOT pol_exists THEN
    EXECUTE 'CREATE POLICY restrict_select_admins ON public.verify_rate_limits AS RESTRICTIVE FOR SELECT USING (public.has_role(auth.uid(), ''admin''::public.app_role))';
  END IF;

  -- verify_ip_rate_limits
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='verify_ip_rate_limits' AND policyname='restrict_select_admins'
  ) INTO pol_exists;
  IF NOT pol_exists THEN
    EXECUTE 'CREATE POLICY restrict_select_admins ON public.verify_ip_rate_limits AS RESTRICTIVE FOR SELECT USING (public.has_role(auth.uid(), ''admin''::public.app_role))';
  END IF;

  -- verify_new_device_rate_limits
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='verify_new_device_rate_limits' AND policyname='restrict_select_admins'
  ) INTO pol_exists;
  IF NOT pol_exists THEN
    EXECUTE 'CREATE POLICY restrict_select_admins ON public.verify_new_device_rate_limits AS RESTRICTIVE FOR SELECT USING (public.has_role(auth.uid(), ''admin''::public.app_role))';
  END IF;

  -- free_ip_rate_limits
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='free_ip_rate_limits' AND policyname='restrict_select_admins'
  ) INTO pol_exists;
  IF NOT pol_exists THEN
    EXECUTE 'CREATE POLICY restrict_select_admins ON public.free_ip_rate_limits AS RESTRICTIVE FOR SELECT USING (public.has_role(auth.uid(), ''admin''::public.app_role))';
  END IF;

  -- licenses_free_settings
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='licenses_free_settings' AND policyname='restrict_select_admins'
  ) INTO pol_exists;
  IF NOT pol_exists THEN
    EXECUTE 'CREATE POLICY restrict_select_admins ON public.licenses_free_settings AS RESTRICTIVE FOR SELECT USING (public.has_role(auth.uid(), ''admin''::public.app_role))';
  END IF;

  -- licenses_free_key_types
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='licenses_free_key_types' AND policyname='restrict_select_admins'
  ) INTO pol_exists;
  IF NOT pol_exists THEN
    EXECUTE 'CREATE POLICY restrict_select_admins ON public.licenses_free_key_types AS RESTRICTIVE FOR SELECT USING (public.has_role(auth.uid(), ''admin''::public.app_role))';
  END IF;
END$$;
