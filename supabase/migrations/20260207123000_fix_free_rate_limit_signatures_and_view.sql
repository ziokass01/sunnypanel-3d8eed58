-- Ensure free rate-limit RPC signatures are compatible and normalize compat view.

DO $$
DECLARE
  v_res text;
BEGIN
  BEGIN
    SELECT pg_get_function_result('public.check_free_ip_rate_limit(text, integer, integer)'::regprocedure)
      INTO v_res;
    IF v_res IS NOT NULL
      AND v_res <> 'TABLE(allowed boolean, current_count integer, window_start timestamp with time zone)' THEN
      EXECUTE 'DROP FUNCTION public.check_free_ip_rate_limit(text, integer, integer) CASCADE';
    END IF;
  EXCEPTION WHEN undefined_function THEN
    -- function does not exist yet
  END;

  BEGIN
    SELECT pg_get_function_result('public.check_free_ip_rate_limit(text, text, integer, integer)'::regprocedure)
      INTO v_res;
    IF v_res IS NOT NULL
      AND v_res <> 'TABLE(allowed boolean, current_count integer, window_start timestamp with time zone)' THEN
      EXECUTE 'DROP FUNCTION public.check_free_ip_rate_limit(text, text, integer, integer) CASCADE';
    END IF;
  EXCEPTION WHEN undefined_function THEN
    -- function does not exist yet
  END;

  BEGIN
    SELECT pg_get_function_result('public.check_free_fp_rate_limit(text, text, integer, integer)'::regprocedure)
      INTO v_res;
    IF v_res IS NOT NULL
      AND v_res <> 'TABLE(allowed boolean, current_count integer, window_start timestamp with time zone)' THEN
      EXECUTE 'DROP FUNCTION public.check_free_fp_rate_limit(text, text, integer, integer) CASCADE';
    END IF;
  EXCEPTION WHEN undefined_function THEN
    -- function does not exist yet
  END;
END $$;

CREATE OR REPLACE FUNCTION public.check_free_ip_rate_limit(
  p_ip_hash text,
  p_route text DEFAULT 'free-start',
  p_limit integer DEFAULT 25,
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
  v_ip text;
BEGIN
  v_route := COALESCE(NULLIF(trim(p_route), ''), 'free-start');
  v_ip := COALESCE(NULLIF(trim(p_ip_hash), ''), 'unknown');
  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / GREATEST(p_window_seconds, 1)) * GREATEST(p_window_seconds, 1)
  );

  INSERT INTO public.licenses_free_ip_rate_limits (ip_hash, route, window_start, count, updated_at)
  VALUES (v_ip, v_route, v_window_start, 1, now())
  ON CONFLICT (ip_hash, route, window_start)
  DO UPDATE SET count = public.licenses_free_ip_rate_limits.count + 1, updated_at = now()
  RETURNING public.licenses_free_ip_rate_limits.count INTO v_count;

  RETURN QUERY SELECT (v_count <= GREATEST(p_limit, 1)), v_count, v_window_start;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_free_ip_rate_limit(
  p_ip_hash text,
  p_limit integer DEFAULT 25,
  p_window_sec integer DEFAULT 60
)
RETURNS TABLE(allowed boolean, current_count integer, window_start timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT x.allowed, x.current_count, x.window_start
  FROM public.check_free_ip_rate_limit(p_ip_hash, 'free-start', p_limit, p_window_sec) x;
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
  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / GREATEST(p_window_seconds, 1)) * GREATEST(p_window_seconds, 1)
  );

  INSERT INTO public.licenses_free_fp_rate_limits (fp_hash, route, window_start, count, updated_at)
  VALUES (COALESCE(NULLIF(trim(p_fp_hash), ''), 'unknown'), v_route, v_window_start, 1, now())
  ON CONFLICT (fp_hash, route, window_start)
  DO UPDATE SET count = public.licenses_free_fp_rate_limits.count + 1, updated_at = now()
  RETURNING public.licenses_free_fp_rate_limits.count INTO v_count;

  RETURN QUERY SELECT (v_count <= GREATEST(p_limit, 1)), v_count, v_window_start;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_free_ip_rate_limit(text, integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_free_ip_rate_limit(text, text, integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_free_fp_rate_limit(text, text, integer, integer) TO anon, authenticated, service_role;

-- Normalize compat object: always be a VIEW on top of licenses_free_ip_rate_limits.
DROP VIEW IF EXISTS public.free_ip_rate_limits CASCADE;
DROP TABLE IF EXISTS public.free_ip_rate_limits CASCADE;

CREATE OR REPLACE VIEW public.free_ip_rate_limits AS
SELECT ip_hash, route, window_start, count, updated_at
FROM public.licenses_free_ip_rate_limits;

GRANT SELECT ON public.free_ip_rate_limits TO anon, authenticated, service_role;
