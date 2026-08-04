-- GTraffic blocks server/datacenter requests with HTTP 403 {"block":true}.
-- The Edge Functions then return the documented browser bridge /st URL.
-- Reserve its 1,000 daily uses atomically so ordered failover remains reliable.

CREATE OR REPLACE FUNCTION public.licenses_reserve_gtraffic_quota(
  p_provider_id uuid,
  p_quota_date date,
  p_daily_limit integer DEFAULT 1000
)
RETURNS TABLE(allowed boolean, remaining integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider public.licenses_free_shortlink_providers%ROWTYPE;
  v_before integer;
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_daily_limit, 1000), 100000));
BEGIN
  SELECT *
  INTO v_provider
  FROM public.licenses_free_shortlink_providers
  WHERE id = p_provider_id
  FOR UPDATE;

  IF NOT FOUND OR v_provider.enabled IS NOT TRUE OR lower(v_provider.provider) <> 'gtraffic' THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  IF v_provider.quota_date IS DISTINCT FROM p_quota_date OR v_provider.quota_remaining IS NULL THEN
    v_before := v_limit;
  ELSE
    v_before := GREATEST(0, v_provider.quota_remaining);
  END IF;

  IF v_before <= 0 THEN
    UPDATE public.licenses_free_shortlink_providers
    SET quota_date = p_quota_date, quota_remaining = 0
    WHERE id = p_provider_id;
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  UPDATE public.licenses_free_shortlink_providers
  SET
    quota_date = p_quota_date,
    quota_remaining = v_before - 1,
    last_used_at = now(),
    last_error = NULL,
    fail_count = 0
  WHERE id = p_provider_id;

  RETURN QUERY SELECT true, v_before - 1;
END;
$$;

REVOKE ALL ON FUNCTION public.licenses_reserve_gtraffic_quota(uuid, date, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.licenses_reserve_gtraffic_quota(uuid, date, integer) TO service_role;

COMMENT ON FUNCTION public.licenses_reserve_gtraffic_quota(uuid, date, integer) IS
  'Atomically reserves one GTraffic browser-bridge use for a Vietnam calendar date.';
