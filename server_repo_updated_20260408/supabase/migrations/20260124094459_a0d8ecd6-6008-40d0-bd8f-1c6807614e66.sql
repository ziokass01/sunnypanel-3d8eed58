-- Secure verify_counts_per_day: enforce admin authorization even under SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.verify_counts_per_day(p_days integer DEFAULT 14)
RETURNS TABLE(day date, count integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Enforce admin-only access
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT
    (date_trunc('day', created_at))::date AS day,
    count(*)::int AS count
  FROM public.audit_logs
  WHERE action = 'VERIFY'
    AND created_at >= now() - make_interval(days => greatest(coalesce(p_days, 14), 1))
  GROUP BY 1
  ORDER BY 1;
END;
$$;