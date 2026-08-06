-- LayMa / generic provider daily quota + atomic failover.
-- Scope: Free Key shortlink providers only. Does not touch verify-key or menu V10.1.

ALTER TABLE public.licenses_free_shortlink_providers
  ADD COLUMN IF NOT EXISTS daily_quota_limit integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quota_used_today integer NOT NULL DEFAULT 0;

UPDATE public.licenses_free_shortlink_providers
SET
  daily_quota_limit = GREATEST(0, COALESCE(daily_quota_limit, 0)),
  quota_used_today = GREATEST(0, COALESCE(quota_used_today, 0));

ALTER TABLE public.licenses_free_shortlink_providers
  DROP CONSTRAINT IF EXISTS licenses_free_shortlink_providers_daily_quota_limit_check;
ALTER TABLE public.licenses_free_shortlink_providers
  ADD CONSTRAINT licenses_free_shortlink_providers_daily_quota_limit_check
  CHECK (daily_quota_limit >= 0);

ALTER TABLE public.licenses_free_shortlink_providers
  DROP CONSTRAINT IF EXISTS licenses_free_shortlink_providers_quota_used_today_check;
ALTER TABLE public.licenses_free_shortlink_providers
  ADD CONSTRAINT licenses_free_shortlink_providers_quota_used_today_check
  CHECK (quota_used_today >= 0);

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
      quota_used_today = v_used,
      quota_remaining = 0
    WHERE id = p_provider_id;

    RETURN QUERY SELECT false, v_limit, v_used, 0, p_today;
    RETURN;
  END IF;

  v_used := v_used + 1;

  UPDATE public.licenses_free_shortlink_providers
  SET
    quota_date = p_today,
    quota_used_today = v_used,
    quota_remaining = GREATEST(v_limit - v_used, 0)
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
  SET
    quota_used_today = v_used,
    quota_remaining = GREATEST(v_limit - v_used, 0)
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

COMMENT ON COLUMN public.licenses_free_shortlink_providers.daily_quota_limit IS
  'Local daily successful-shortlink limit. 0 means unlimited/provider-reported only.';
COMMENT ON COLUMN public.licenses_free_shortlink_providers.quota_used_today IS
  'Atomically reserved successful-shortlink count for quota_date (Asia/Ho_Chi_Minh).';
COMMENT ON FUNCTION public.reserve_free_shortlink_provider_quota(uuid, date) IS
  'Atomically reserves one local provider quota slot before calling the external shortener.';
COMMENT ON FUNCTION public.release_free_shortlink_provider_quota(uuid, date) IS
  'Releases a reserved slot when the external shortener call fails before producing a link.';

NOTIFY pgrst, 'reload schema';
