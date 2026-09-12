-- 1) verify_rate_limits: ensure schema supports atomic rate limiting
ALTER TABLE public.verify_rate_limits
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Ensure unique constraint/index exists for (license_key, ip, window_start)
CREATE UNIQUE INDEX IF NOT EXISTS verify_rate_limits_unique
ON public.verify_rate_limits (license_key, ip, window_start);

CREATE INDEX IF NOT EXISTS verify_rate_limits_window_idx
ON public.verify_rate_limits (window_start);

-- 2) Atomic rate limit function (single-statement upsert+increment)
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT,
  p_ip TEXT,
  p_limit INTEGER DEFAULT 30,
  p_window_seconds INTEGER DEFAULT 300
)
RETURNS TABLE (
  allowed BOOLEAN,
  current_count INTEGER,
  window_start TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  IF p_key IS NULL OR length(trim(p_key)) = 0 THEN
    RETURN QUERY SELECT false, 0, now();
    RETURN;
  END IF;

  IF p_ip IS NULL OR length(trim(p_ip)) = 0 THEN
    p_ip := 'unknown';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 THEN
    p_limit := 30;
  END IF;

  IF p_window_seconds IS NULL OR p_window_seconds < 10 THEN
    p_window_seconds := 300;
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.verify_rate_limits (license_key, ip, window_start, count, updated_at)
  VALUES (upper(trim(p_key)), trim(p_ip), v_window_start, 1, now())
  ON CONFLICT (license_key, ip, window_start)
  DO UPDATE SET
    count = public.verify_rate_limits.count + 1,
    updated_at = now()
  RETURNING public.verify_rate_limits.count INTO v_count;

  RETURN QUERY SELECT (v_count <= p_limit), v_count, v_window_start;
END;
$$;

-- 3) Audit logging RPC (admin-only)
CREATE OR REPLACE FUNCTION public.log_audit(
  p_action TEXT,
  p_license_key TEXT,
  p_detail JSONB DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Enforce admin-only writes even though this is SECURITY DEFINER
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO public.audit_logs(action, license_key, detail)
  VALUES (
    coalesce(p_action, 'UNKNOWN'),
    coalesce(p_license_key, ''),
    coalesce(p_detail, '{}'::jsonb)
  );
END;
$$;

-- 4) Dashboard helper: verifies per day (admin-only)
CREATE OR REPLACE FUNCTION public.verify_counts_per_day(p_days INTEGER DEFAULT 14)
RETURNS TABLE (
  day DATE,
  count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (date_trunc('day', created_at))::date AS day,
    count(*)::int AS count
  FROM public.audit_logs
  WHERE action = 'VERIFY'
    AND created_at >= now() - make_interval(days => greatest(coalesce(p_days, 14), 1))
  GROUP BY 1
  ORDER BY 1;
$$;