-- Add an explicit per-provider local quota switch. Turning it off means the
-- row is always attempted: neither the local daily counter nor a cached
-- GTraffic remaining=0 can keep it disabled. FREE shortlink only.

ALTER TABLE public.licenses_free_shortlink_providers
  ADD COLUMN IF NOT EXISTS daily_quota_enabled boolean;

-- Preserve configured limits on generic providers. GTraffic is intentionally
-- migrated to unlimited so its provider reset cycle cannot require a manual
-- admin reset/check anymore.
UPDATE public.licenses_free_shortlink_providers
SET daily_quota_enabled = false
WHERE lower(COALESCE(provider, '')) = 'gtraffic';

UPDATE public.licenses_free_shortlink_providers
SET daily_quota_enabled = COALESCE(daily_quota_limit, 0) > 0
WHERE daily_quota_enabled IS NULL;

-- Heal a partially deployed/invalid row before enforcing the constraint.
UPDATE public.licenses_free_shortlink_providers
SET daily_quota_enabled = false
WHERE daily_quota_enabled = true
  AND COALESCE(daily_quota_limit, 0) <= 0;

ALTER TABLE public.licenses_free_shortlink_providers
  ALTER COLUMN daily_quota_enabled SET DEFAULT false;

ALTER TABLE public.licenses_free_shortlink_providers
  ALTER COLUMN daily_quota_enabled SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.licenses_free_shortlink_providers'::regclass
      AND conname = 'licenses_free_shortlink_quota_enabled_limit_check'
  ) THEN
    ALTER TABLE public.licenses_free_shortlink_providers
      ADD CONSTRAINT licenses_free_shortlink_quota_enabled_limit_check
      CHECK (NOT daily_quota_enabled OR COALESCE(daily_quota_limit, 0) > 0);
  END IF;
END
$$;

-- Clear stale runtime state once for every unlimited row. The next successful
-- GTraffic response may still store remaining for display, but runtime ignores
-- that cached number while daily_quota_enabled=false.
UPDATE public.licenses_free_shortlink_providers
SET
  quota_used_today = 0,
  quota_remaining = NULL,
  quota_date = NULL,
  unavailable_until = NULL,
  last_error = NULL,
  fail_count = 0
WHERE daily_quota_enabled = false;

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
  v_enabled boolean;
  v_limit integer;
  v_used integer;
  v_day date;
BEGIN
  SELECT
    COALESCE(p.daily_quota_enabled, false),
    GREATEST(0, COALESCE(p.daily_quota_limit, 0)),
    GREATEST(0, COALESCE(p.quota_used_today, 0)),
    p.quota_date
  INTO v_enabled, v_limit, v_used, v_day
  FROM public.licenses_free_shortlink_providers AS p
  WHERE p.id = p_provider_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 0, NULL::integer, p_today;
    RETURN;
  END IF;

  IF NOT v_enabled THEN
    IF v_used <> 0 THEN
      UPDATE public.licenses_free_shortlink_providers
      SET quota_used_today = 0
      WHERE id = p_provider_id;
    END IF;
    RETURN QUERY SELECT true, 0, 0, NULL::integer, v_day;
    RETURN;
  END IF;

  IF v_limit <= 0 THEN
    RETURN QUERY SELECT false, 0, v_used, 0, COALESCE(v_day, p_today);
    RETURN;
  END IF;

  IF v_day IS DISTINCT FROM p_today THEN
    v_used := 0;
  END IF;

  IF v_used >= v_limit THEN
    UPDATE public.licenses_free_shortlink_providers
    SET quota_date = p_today, quota_used_today = v_used
    WHERE id = p_provider_id;

    RETURN QUERY SELECT false, v_limit, v_used, 0, p_today;
    RETURN;
  END IF;

  v_used := v_used + 1;

  UPDATE public.licenses_free_shortlink_providers
  SET quota_date = p_today, quota_used_today = v_used
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
  v_enabled boolean;
  v_limit integer;
  v_used integer;
  v_day date;
BEGIN
  SELECT
    COALESCE(p.daily_quota_enabled, false),
    GREATEST(0, COALESCE(p.daily_quota_limit, 0)),
    GREATEST(0, COALESCE(p.quota_used_today, 0)),
    p.quota_date
  INTO v_enabled, v_limit, v_used, v_day
  FROM public.licenses_free_shortlink_providers AS p
  WHERE p.id = p_provider_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_enabled OR v_limit <= 0 OR v_day IS DISTINCT FROM p_today OR v_used <= 0 THEN
    RETURN QUERY
    SELECT false,
      CASE WHEN COALESCE(v_enabled, false) THEN COALESCE(v_limit, 0) ELSE 0 END,
      COALESCE(v_used, 0),
      CASE
        WHEN COALESCE(v_enabled, false) AND COALESCE(v_limit, 0) > 0
          THEN GREATEST(COALESCE(v_limit, 0) - COALESCE(v_used, 0), 0)
        ELSE NULL
      END,
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

COMMENT ON COLUMN public.licenses_free_shortlink_providers.daily_quota_enabled IS
  'Explicit local daily quota switch. False means unlimited and cached provider remaining never disables the row.';
COMMENT ON FUNCTION public.reserve_free_shortlink_provider_quota(uuid, date) IS
  'Atomically reserves local daily quota only when the per-provider switch is enabled.';

NOTIFY pgrst, 'reload schema';
