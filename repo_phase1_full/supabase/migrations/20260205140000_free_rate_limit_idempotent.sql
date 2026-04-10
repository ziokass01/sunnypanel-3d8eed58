-- Idempotent fix for FREE rate-limit objects used by free-start

CREATE TABLE IF NOT EXISTS public.licenses_free_ip_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  route text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ip_hash, route, window_start)
);

CREATE INDEX IF NOT EXISTS idx_lfirl_window_start ON public.licenses_free_ip_rate_limits (window_start DESC);
CREATE INDEX IF NOT EXISTS idx_lfirl_ip_route_window ON public.licenses_free_ip_rate_limits (ip_hash, route, window_start DESC);

CREATE TABLE IF NOT EXISTS public.licenses_free_fp_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fp_hash text NOT NULL,
  route text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(fp_hash, route, window_start)
);

CREATE INDEX IF NOT EXISTS idx_lffrl_window_start ON public.licenses_free_fp_rate_limits (window_start DESC);
CREATE INDEX IF NOT EXISTS idx_lffrl_fp_route_window ON public.licenses_free_fp_rate_limits (fp_hash, route, window_start DESC);

CREATE TABLE IF NOT EXISTS public.licenses_free_security_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  route text NOT NULL DEFAULT 'free-start',
  ip_hash text NULL,
  fingerprint_hash text NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_lfsl_created_at ON public.licenses_free_security_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lfsl_event_type ON public.licenses_free_security_logs (event_type);

ALTER TABLE public.licenses_free_ip_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses_free_fp_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses_free_security_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='licenses_free_ip_rate_limits' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY service_role_all
    ON public.licenses_free_ip_rate_limits
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='licenses_free_fp_rate_limits' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY service_role_all
    ON public.licenses_free_fp_rate_limits
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='licenses_free_security_logs' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY service_role_all
    ON public.licenses_free_security_logs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.check_free_ip_rate_limit(
  p_ip_hash text,
  p_route text,
  p_limit integer DEFAULT 60,
  p_window_seconds integer DEFAULT 60
)
RETURNS TABLE(allowed boolean, current_count integer, window_start timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_count integer;
  v_ip text;
  v_route text;
BEGIN
  v_ip := coalesce(nullif(trim(p_ip_hash), ''), 'unknown');
  v_route := coalesce(nullif(trim(p_route), ''), 'unknown');

  IF p_limit IS NULL OR p_limit < 1 THEN p_limit := 60; END IF;
  IF p_window_seconds IS NULL OR p_window_seconds < 10 THEN p_window_seconds := 60; END IF;

  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  INSERT INTO public.licenses_free_ip_rate_limits (ip_hash, route, window_start, count, updated_at)
  VALUES (v_ip, v_route, v_window_start, 1, now())
  ON CONFLICT (ip_hash, route, window_start)
  DO UPDATE SET
    count = public.licenses_free_ip_rate_limits.count + 1,
    updated_at = now()
  RETURNING public.licenses_free_ip_rate_limits.count INTO v_count;

  RETURN QUERY SELECT (v_count <= p_limit), v_count, v_window_start;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_free_fp_rate_limit(
  p_fp_hash text,
  p_route text,
  p_limit integer DEFAULT 30,
  p_window_seconds integer DEFAULT 60
)
RETURNS TABLE(allowed boolean, current_count integer, window_start timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_count integer;
  v_fp text;
  v_route text;
BEGIN
  v_fp := coalesce(nullif(trim(p_fp_hash), ''), 'unknown');
  v_route := coalesce(nullif(trim(p_route), ''), 'unknown');

  IF p_limit IS NULL OR p_limit < 1 THEN p_limit := 30; END IF;
  IF p_window_seconds IS NULL OR p_window_seconds < 10 THEN p_window_seconds := 60; END IF;

  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  INSERT INTO public.licenses_free_fp_rate_limits (fp_hash, route, window_start, count, updated_at)
  VALUES (v_fp, v_route, v_window_start, 1, now())
  ON CONFLICT (fp_hash, route, window_start)
  DO UPDATE SET
    count = public.licenses_free_fp_rate_limits.count + 1,
    updated_at = now()
  RETURNING public.licenses_free_fp_rate_limits.count INTO v_count;

  RETURN QUERY SELECT (v_count <= p_limit), v_count, v_window_start;
END;
$$;
