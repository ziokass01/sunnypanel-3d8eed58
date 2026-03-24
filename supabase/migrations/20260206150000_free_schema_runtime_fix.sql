-- Free flow runtime fix: normalize FREE schema objects + rate-limit RPC signatures used by Edge Functions.

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

CREATE TABLE IF NOT EXISTS public.licenses_free_admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.licenses_free_sessions ADD COLUMN IF NOT EXISTS out_token_hash text;
ALTER TABLE public.licenses_free_sessions ADD COLUMN IF NOT EXISTS out_expires_at timestamptz;
ALTER TABLE public.licenses_free_sessions ADD COLUMN IF NOT EXISTS claim_token_hash text;
ALTER TABLE public.licenses_free_sessions ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz;
ALTER TABLE public.licenses_free_sessions ADD COLUMN IF NOT EXISTS key_type_code text;
ALTER TABLE public.licenses_free_sessions ADD COLUMN IF NOT EXISTS duration_seconds integer;
ALTER TABLE public.licenses_free_sessions ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE public.licenses_free_sessions ADD COLUMN IF NOT EXISTS revealed_license_id uuid;
ALTER TABLE public.licenses_free_sessions ADD COLUMN IF NOT EXISTS gate_ok_at timestamptz;
ALTER TABLE public.licenses_free_sessions ADD COLUMN IF NOT EXISTS revealed_at timestamptz;

ALTER TABLE public.licenses_free_issues ADD COLUMN IF NOT EXISTS ua_hash text;

CREATE INDEX IF NOT EXISTS idx_lfs_out_token_hash ON public.licenses_free_sessions (out_token_hash);
CREATE INDEX IF NOT EXISTS idx_lfs_claim_token_hash ON public.licenses_free_sessions (claim_token_hash);
CREATE INDEX IF NOT EXISTS idx_lfirl_route_hash_window ON public.licenses_free_ip_rate_limits (route, ip_hash, window_start DESC);
CREATE INDEX IF NOT EXISTS idx_lffrl_route_hash_window ON public.licenses_free_fp_rate_limits (route, fp_hash, window_start DESC);

ALTER TABLE public.licenses_free_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses_free_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses_free_ip_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses_free_fp_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses_free_blocklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses_free_security_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses_free_admin_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'licenses_free_sessions',
    'licenses_free_issues',
    'licenses_free_ip_rate_limits',
    'licenses_free_fp_rate_limits',
    'licenses_free_blocklist',
    'licenses_free_security_logs',
    'licenses_free_admin_logs'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='service_role_all'
    ) THEN
      EXECUTE format('CREATE POLICY service_role_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t);
    END IF;
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
  VALUES (COALESCE(NULLIF(trim(p_ip_hash), ''), 'unknown'), 'free-start', v_window_start, 1, now())
  ON CONFLICT (ip_hash, route, window_start)
  DO UPDATE SET count = public.licenses_free_ip_rate_limits.count + 1, updated_at = now()
  RETURNING public.licenses_free_ip_rate_limits.count INTO v_count;

  RETURN QUERY SELECT (v_count <= GREATEST(p_limit, 1)), v_count, v_window_start;
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
  VALUES (COALESCE(NULLIF(trim(p_fp_hash), ''), 'unknown'), v_route, v_window_start, 1, now())
  ON CONFLICT (fp_hash, route, window_start)
  DO UPDATE SET count = public.licenses_free_fp_rate_limits.count + 1, updated_at = now()
  RETURNING public.licenses_free_fp_rate_limits.count INTO v_count;

  RETURN QUERY SELECT (v_count <= GREATEST(p_limit, 1)), v_count, v_window_start;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_free_ip_rate_limit(text, integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_free_fp_rate_limit(text, text, integer, integer) TO anon, authenticated, service_role;

INSERT INTO public.licenses_free_settings (
  id,
  free_outbound_url,
  free_require_link4m_referrer,
  free_enabled,
  free_disabled_message,
  free_min_delay_seconds,
  free_return_seconds,
  free_daily_limit_per_fingerprint
)
VALUES (
  1,
  'https://link4m.com/PkY7X',
  true,
  true,
  'Trang GetKey đang tạm đóng.',
  25,
  10,
  1
)
ON CONFLICT (id) DO UPDATE SET
  free_outbound_url = EXCLUDED.free_outbound_url,
  free_require_link4m_referrer = EXCLUDED.free_require_link4m_referrer;
