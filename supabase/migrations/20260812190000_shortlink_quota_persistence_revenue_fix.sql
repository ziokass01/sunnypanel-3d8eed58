-- Keep the admin provider limit stable and separate it from provider-reported
-- remaining quota. Safe/idempotent; FREE shortlink only. Verify-key untouched.

-- Repair stale local counters for unlimited generic providers. Only GTraffic
-- currently returns an authoritative external `remaining` counter.
UPDATE public.licenses_free_shortlink_providers
SET
  quota_used_today = 0,
  quota_remaining = NULL,
  quota_date = NULL,
  unavailable_until = NULL
WHERE COALESCE(daily_quota_limit, 0) = 0
  AND lower(COALESCE(provider, '')) <> 'gtraffic';

-- Old releases also wrote the local counter into GTraffic's external remaining
-- field. Clear every stale zero once. If GTraffic is truly exhausted it will
-- return remaining=0 again on the next attempt and the corrected runtime will
-- persist that authoritative response.
UPDATE public.licenses_free_shortlink_providers
SET
  quota_remaining = NULL,
  quota_date = NULL,
  unavailable_until = NULL
WHERE lower(COALESCE(provider, '')) = 'gtraffic'
  AND COALESCE(quota_remaining, 0) <= 0;

CREATE OR REPLACE FUNCTION public.reserve_free_shortlink_provider_quota(
  p_provider_id uuid,
  p_today date
)
RETURNS TABLE (
  allowed boolean,
  quota_limit integer,
  quota_used integer,
  quota_left integer,
  quota_day date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_used integer;
  v_day date;
BEGIN
  SELECT
    GREATEST(0, COALESCE(p.daily_quota_limit, 0)),
    GREATEST(0, COALESCE(p.quota_used_today, 0)),
    p.quota_date
  INTO v_limit, v_used, v_day
  FROM public.licenses_free_shortlink_providers AS p
  WHERE p.id = p_provider_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 0, NULL::integer, p_today;
    RETURN;
  END IF;

  IF v_limit <= 0 THEN
    -- 0 is unlimited. Never write the local counter into quota_remaining.
    IF v_used <> 0 THEN
      UPDATE public.licenses_free_shortlink_providers
      SET quota_used_today = 0
      WHERE id = p_provider_id;
    END IF;
    RETURN QUERY SELECT true, 0, 0, NULL::integer, v_day;
    RETURN;
  END IF;

  IF v_day IS DISTINCT FROM p_today THEN
    v_used := 0;
  END IF;

  IF v_used >= v_limit THEN
    UPDATE public.licenses_free_shortlink_providers
    SET
      quota_date = p_today,
      quota_used_today = v_used
    WHERE id = p_provider_id;

    RETURN QUERY SELECT false, v_limit, v_used, 0, p_today;
    RETURN;
  END IF;

  v_used := v_used + 1;

  UPDATE public.licenses_free_shortlink_providers
  SET
    quota_date = p_today,
    quota_used_today = v_used
  WHERE id = p_provider_id;

  RETURN QUERY
  SELECT true, v_limit, v_used, GREATEST(v_limit - v_used, 0), p_today;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_free_shortlink_provider_quota(
  p_provider_id uuid,
  p_today date
)
RETURNS TABLE (
  released boolean,
  quota_limit integer,
  quota_used integer,
  quota_left integer,
  quota_day date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_used integer;
  v_day date;
BEGIN
  SELECT
    GREATEST(0, COALESCE(p.daily_quota_limit, 0)),
    GREATEST(0, COALESCE(p.quota_used_today, 0)),
    p.quota_date
  INTO v_limit, v_used, v_day
  FROM public.licenses_free_shortlink_providers AS p
  WHERE p.id = p_provider_id
  FOR UPDATE;

  IF NOT FOUND OR v_limit <= 0 OR v_day IS DISTINCT FROM p_today OR v_used <= 0 THEN
    RETURN QUERY
    SELECT false, COALESCE(v_limit, 0), COALESCE(v_used, 0),
      CASE WHEN COALESCE(v_limit, 0) > 0 THEN GREATEST(COALESCE(v_limit, 0) - COALESCE(v_used, 0), 0) ELSE NULL END,
      v_day;
    RETURN;
  END IF;

  v_used := v_used - 1;

  UPDATE public.licenses_free_shortlink_providers
  SET quota_used_today = v_used
  WHERE id = p_provider_id;

  RETURN QUERY
  SELECT true, v_limit, v_used, GREATEST(v_limit - v_used, 0), p_today;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_free_shortlink_provider_quota(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_free_shortlink_provider_quota(uuid, date) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_free_shortlink_provider_quota(uuid, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_free_shortlink_provider_quota(uuid, date) TO service_role;

REVOKE ALL ON FUNCTION public.release_free_shortlink_provider_quota(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_free_shortlink_provider_quota(uuid, date) FROM anon;
REVOKE ALL ON FUNCTION public.release_free_shortlink_provider_quota(uuid, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_free_shortlink_provider_quota(uuid, date) TO service_role;

COMMENT ON COLUMN public.licenses_free_shortlink_providers.quota_remaining IS
  'External provider-reported remaining quota only; never the local daily counter.';
COMMENT ON FUNCTION public.reserve_free_shortlink_provider_quota(uuid, date) IS
  'Atomically reserves the local daily provider counter without overwriting external remaining quota.';

NOTIFY pgrst, 'reload schema';
