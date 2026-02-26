-- Previous migration failed due to cron.schedule quoting. Re-applying with corrected SQL.

-- 1) Blocked IPs table
CREATE TABLE IF NOT EXISTS public.blocked_ips (
  ip TEXT PRIMARY KEY,
  blocked_until TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL DEFAULT 'ENUMERATION',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='blocked_ips' AND policyname='Admins manage blocked IPs'
  ) THEN
    CREATE POLICY "Admins manage blocked IPs"
    ON public.blocked_ips
    FOR ALL
    USING (public.has_role(auth.uid(), 'admin'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_blocked_ips_until ON public.blocked_ips (blocked_until);

-- 2) IP-only rate limiting table + function
CREATE TABLE IF NOT EXISTS public.verify_ip_rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ux_verify_ip_rate_limits UNIQUE (ip, window_start)
);

ALTER TABLE public.verify_ip_rate_limits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='verify_ip_rate_limits' AND policyname='Admins manage IP rate limits'
  ) THEN
    CREATE POLICY "Admins manage IP rate limits"
    ON public.verify_ip_rate_limits
    FOR ALL
    USING (public.has_role(auth.uid(), 'admin'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_verify_ip_rate_limits_window ON public.verify_ip_rate_limits (window_start);
CREATE INDEX IF NOT EXISTS idx_verify_ip_rate_limits_ip ON public.verify_ip_rate_limits (ip);

CREATE OR REPLACE FUNCTION public.check_ip_rate_limit(
  p_ip text,
  p_limit integer DEFAULT 120,
  p_window_seconds integer DEFAULT 60
)
RETURNS TABLE(allowed boolean, current_count integer, window_start timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  IF p_ip IS NULL OR length(trim(p_ip)) = 0 THEN
    p_ip := 'unknown';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 THEN
    p_limit := 120;
  END IF;

  IF p_window_seconds IS NULL OR p_window_seconds < 10 THEN
    p_window_seconds := 60;
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.verify_ip_rate_limits (ip, window_start, count, updated_at)
  VALUES (trim(p_ip), v_window_start, 1, now())
  ON CONFLICT (ip, window_start)
  DO UPDATE SET
    count = public.verify_ip_rate_limits.count + 1,
    updated_at = now()
  RETURNING public.verify_ip_rate_limits.count INTO v_count;

  RETURN QUERY SELECT (v_count <= p_limit), v_count, v_window_start;
END;
$$;

-- 3) New-device throttle per key
CREATE TABLE IF NOT EXISTS public.verify_new_device_rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  license_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ux_verify_new_device_rate_limits UNIQUE (license_key, window_start)
);

ALTER TABLE public.verify_new_device_rate_limits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='verify_new_device_rate_limits' AND policyname='Admins manage new-device rate limits'
  ) THEN
    CREATE POLICY "Admins manage new-device rate limits"
    ON public.verify_new_device_rate_limits
    FOR ALL
    USING (public.has_role(auth.uid(), 'admin'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_verify_new_device_rate_limits_window ON public.verify_new_device_rate_limits (window_start);
CREATE INDEX IF NOT EXISTS idx_verify_new_device_rate_limits_key ON public.verify_new_device_rate_limits (license_key);

CREATE OR REPLACE FUNCTION public.check_new_device_rate_limit(
  p_key text,
  p_limit integer DEFAULT 10,
  p_window_seconds integer DEFAULT 3600
)
RETURNS TABLE(allowed boolean, current_count integer, window_start timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  IF p_key IS NULL OR length(trim(p_key)) = 0 THEN
    RETURN QUERY SELECT false, 0, now();
    RETURN;
  END IF;

  IF p_limit IS NULL OR p_limit < 1 THEN
    p_limit := 10;
  END IF;

  IF p_window_seconds IS NULL OR p_window_seconds < 60 THEN
    p_window_seconds := 3600;
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.verify_new_device_rate_limits (license_key, window_start, count, updated_at)
  VALUES (upper(trim(p_key)), v_window_start, 1, now())
  ON CONFLICT (license_key, window_start)
  DO UPDATE SET
    count = public.verify_new_device_rate_limits.count + 1,
    updated_at = now()
  RETURNING public.verify_new_device_rate_limits.count INTO v_count;

  RETURN QUERY SELECT (v_count <= p_limit), v_count, v_window_start;
END;
$$;

-- 4) Cleanup function + pg_cron schedule
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.cleanup_verify_tables(
  p_rate_limit_ttl_days integer DEFAULT 14
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.request_nonces
  WHERE expires_at < now();

  DELETE FROM public.verify_rate_limits
  WHERE window_start < now() - make_interval(days => greatest(coalesce(p_rate_limit_ttl_days, 14), 1));

  DELETE FROM public.verify_ip_rate_limits
  WHERE window_start < now() - make_interval(days => greatest(coalesce(p_rate_limit_ttl_days, 14), 1));

  DELETE FROM public.verify_new_device_rate_limits
  WHERE window_start < now() - make_interval(days => greatest(coalesce(p_rate_limit_ttl_days, 14), 1));

  DELETE FROM public.blocked_ips
  WHERE blocked_until < now();
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'cleanup-verify-tables-hourly'
  ) THEN
    PERFORM cron.schedule(
      'cleanup-verify-tables-hourly',
      '0 * * * *',
      'SELECT public.cleanup_verify_tables();'
    );
  END IF;
END $$;
