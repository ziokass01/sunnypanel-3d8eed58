-- Free flow guardrails: ensure required free rate-limit schema/RPC exists for Edge Functions.

CREATE TABLE IF NOT EXISTS public.licenses_free_ip_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  route text NOT NULL DEFAULT 'free-start',
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ip_hash, route, window_start)
);

CREATE TABLE IF NOT EXISTS public.licenses_free_fp_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fp_hash text NOT NULL,
  route text NOT NULL DEFAULT 'free-start',
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fp_hash, route, window_start)
);

CREATE TABLE IF NOT EXISTS public.licenses_free_blocklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint_hash text,
  ip_hash text,
  reason text,
  enabled boolean NOT NULL DEFAULT true,
  blocked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.licenses_free_security_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  route text,
  details jsonb,
  ip_hash text,
  fingerprint_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lfirl_window_start ON public.licenses_free_ip_rate_limits (window_start DESC);
CREATE INDEX IF NOT EXISTS idx_lfirl_ip_route_window ON public.licenses_free_ip_rate_limits (ip_hash, route, window_start DESC);
CREATE INDEX IF NOT EXISTS idx_lffrl_window_start ON public.licenses_free_fp_rate_limits (window_start DESC);
CREATE INDEX IF NOT EXISTS idx_lffrl_fp_route_window ON public.licenses_free_fp_rate_limits (fp_hash, route, window_start DESC);

ALTER TABLE public.licenses_free_ip_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses_free_fp_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses_free_blocklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses_free_security_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='licenses_free_ip_rate_limits' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON public.licenses_free_ip_rate_limits FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='licenses_free_fp_rate_limits' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON public.licenses_free_fp_rate_limits FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='licenses_free_blocklist' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON public.licenses_free_blocklist FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='licenses_free_security_logs' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON public.licenses_free_security_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
-- Force drop any existing versions (any signature) before re-create
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='check_free_ip_rate_limit'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.check_free_ip_rate_limit(
  p_ip_hash text,
  p_limit integer DEFAULT 25,
  p_window_sec integer DEFAULT 60
)
RETURNS TABLE(allowed boolean, current_count integer, window_start timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_count integer;
BEGIN
  v_window_start := to_timestamp(floor(extract(epoch FROM now()) / GREATEST(p_window_sec, 1)) * GREATEST(p_window_sec, 1));

  INSERT INTO public.licenses_free_ip_rate_limits (ip_hash, route, window_start, count, updated_at)
  VALUES (p_ip_hash, 'free-start', v_window_start, 1, now())
  ON CONFLICT (ip_hash, route, window_start)
  DO UPDATE SET count = public.licenses_free_ip_rate_limits.count + 1, updated_at = now()
  RETURNING public.licenses_free_ip_rate_limits.count INTO v_count;

  RETURN QUERY SELECT v_count <= GREATEST(p_limit, 1), v_count, v_window_start;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_free_fp_rate_limit(
  p_fp_hash text,
  p_route text DEFAULT 'free-start',
  p_limit integer DEFAULT 12,
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
  v_route text;
BEGIN
  v_route := COALESCE(NULLIF(trim(p_route), ''), 'free-start');
  v_window_start := to_timestamp(floor(extract(epoch FROM now()) / GREATEST(p_window_seconds, 1)) * GREATEST(p_window_seconds, 1));

  INSERT INTO public.licenses_free_fp_rate_limits (fp_hash, route, window_start, count, updated_at)
  VALUES (p_fp_hash, v_route, v_window_start, 1, now())
  ON CONFLICT (fp_hash, route, window_start)
  DO UPDATE SET count = public.licenses_free_fp_rate_limits.count + 1, updated_at = now()
  RETURNING public.licenses_free_fp_rate_limits.count INTO v_count;

  RETURN QUERY SELECT v_count <= GREATEST(p_limit, 1), v_count, v_window_start;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_free_ip_rate_limit(text, integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_free_fp_rate_limit(text, text, integer, integer) TO anon, authenticated, service_role;
