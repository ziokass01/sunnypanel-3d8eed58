-- Ensure canonical FREE rate-limit objects and admin operation logs exist

CREATE TABLE IF NOT EXISTS public.licenses_free_rate_limits (
  ip_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ip_hash, window_start)
);

CREATE INDEX IF NOT EXISTS idx_lfrl_window_start ON public.licenses_free_rate_limits (window_start DESC);

ALTER TABLE public.licenses_free_blocklist
  ADD COLUMN IF NOT EXISTS blocked_until timestamptz NULL;

CREATE TABLE IF NOT EXISTS public.licenses_free_admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  admin_uid uuid NULL
);

CREATE INDEX IF NOT EXISTS idx_lfal_created_at ON public.licenses_free_admin_logs (created_at DESC);

ALTER TABLE public.licenses_free_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses_free_admin_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='licenses_free_rate_limits' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY service_role_all
    ON public.licenses_free_rate_limits
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='licenses_free_admin_logs' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY service_role_all
    ON public.licenses_free_admin_logs
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.check_free_ip_rate_limit(
  p_ip_hash text,
  p_limit integer DEFAULT 25,
  p_window_sec integer DEFAULT 60
)
RETURNS TABLE(allowed boolean, current_count integer, reset_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_count integer;
  v_ip text;
  v_limit integer;
  v_window integer;
BEGIN
  v_ip := coalesce(nullif(trim(p_ip_hash), ''), 'unknown');
  v_limit := greatest(coalesce(p_limit, 25), 1);
  v_window := greatest(coalesce(p_window_sec, 60), 10);

  v_window_start := to_timestamp(floor(extract(epoch FROM now()) / v_window) * v_window);

  INSERT INTO public.licenses_free_rate_limits(ip_hash, window_start, count, updated_at)
  VALUES (v_ip, v_window_start, 1, now())
  ON CONFLICT (ip_hash, window_start)
  DO UPDATE SET count = public.licenses_free_rate_limits.count + 1, updated_at = now()
  RETURNING public.licenses_free_rate_limits.count INTO v_count;

  RETURN QUERY SELECT (v_count <= v_limit), v_count, (v_window_start + make_interval(secs => v_window));
END;
$$;

CREATE OR REPLACE FUNCTION public.check_free_ip_rate_limit(
  p_ip_hash text,
  p_route text,
  p_limit integer DEFAULT 60,
  p_window_seconds integer DEFAULT 60
)
RETURNS TABLE(allowed boolean, current_count integer, window_start timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT x.allowed, x.current_count, x.reset_at AS window_start
  FROM public.check_free_ip_rate_limit(p_ip_hash, p_limit, p_window_seconds) x;
$$;

GRANT EXECUTE ON FUNCTION public.check_free_ip_rate_limit(text, integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_free_ip_rate_limit(text, text, integer, integer) TO anon, authenticated, service_role;
