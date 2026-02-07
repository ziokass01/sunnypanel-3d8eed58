-- Final hardening for FREE license flow (idempotent)
-- Covers DB objects expected by free-start/free-gate/free-reveal and admin-free-* functions.

-- 1) Core rate-limit and security tables
CREATE TABLE IF NOT EXISTS public.licenses_free_ip_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  route text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ip_hash, route, window_start)
);

CREATE TABLE IF NOT EXISTS public.licenses_free_fp_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fp_hash text NOT NULL,
  route text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(fp_hash, route, window_start)
);

CREATE TABLE IF NOT EXISTS public.licenses_free_blocklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  enabled boolean NOT NULL DEFAULT true,
  reason text NULL,
  fingerprint_hash text NULL,
  ip_hash text NULL,
  created_by uuid NULL,
  blocked_until timestamptz NULL,
  CONSTRAINT ck_lfb_target CHECK (fingerprint_hash IS NOT NULL OR ip_hash IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.licenses_free_security_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  route text NOT NULL DEFAULT 'free-start',
  ip_hash text NULL,
  fingerprint_hash text NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.licenses_free_admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  admin_uid uuid NULL
);

ALTER TABLE public.licenses_free_blocklist
  ADD COLUMN IF NOT EXISTS blocked_until timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_lfirl_window_start ON public.licenses_free_ip_rate_limits (window_start DESC);
CREATE INDEX IF NOT EXISTS idx_lfirl_ip_route_window ON public.licenses_free_ip_rate_limits (ip_hash, route, window_start DESC);
CREATE INDEX IF NOT EXISTS idx_lffrl_window_start ON public.licenses_free_fp_rate_limits (window_start DESC);
CREATE INDEX IF NOT EXISTS idx_lffrl_fp_route_window ON public.licenses_free_fp_rate_limits (fp_hash, route, window_start DESC);
CREATE INDEX IF NOT EXISTS idx_lfb_fp ON public.licenses_free_blocklist (fingerprint_hash) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_lfb_ip ON public.licenses_free_blocklist (ip_hash) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_lfb_blocked_until ON public.licenses_free_blocklist (blocked_until);
CREATE INDEX IF NOT EXISTS idx_lfsl_created_at ON public.licenses_free_security_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lfal_created_at ON public.licenses_free_admin_logs (created_at DESC);

-- 2) RLS and service_role policies used by Edge Functions
ALTER TABLE public.licenses_free_ip_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses_free_fp_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses_free_blocklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses_free_security_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses_free_admin_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='licenses_free_ip_rate_limits' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON public.licenses_free_ip_rate_limits
    FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='licenses_free_fp_rate_limits' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON public.licenses_free_fp_rate_limits
    FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='licenses_free_blocklist' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON public.licenses_free_blocklist
    FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='licenses_free_security_logs' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON public.licenses_free_security_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='licenses_free_admin_logs' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON public.licenses_free_admin_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 3) Keep session schema compatible with free flow
ALTER TABLE public.licenses_free_sessions
  ADD COLUMN IF NOT EXISTS last_error text NULL,
  ADD COLUMN IF NOT EXISTS claim_token_hash text NULL,
  ADD COLUMN IF NOT EXISTS claim_token_plain text NULL,
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS out_token_hash text NULL,
  ADD COLUMN IF NOT EXISTS out_expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS revealed_license_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_lfs_revealed_license_id
  ON public.licenses_free_sessions (revealed_license_id);

-- 4) Canonical RPC expected by free-start (params: p_ip_hash/p_limit/p_window_sec)
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

  INSERT INTO public.licenses_free_ip_rate_limits (ip_hash, route, window_start, count, updated_at)
  VALUES (v_ip, 'none', v_window_start, 1, now())
  ON CONFLICT (ip_hash, route, window_start)
  DO UPDATE SET
    count = public.licenses_free_ip_rate_limits.count + 1,
    updated_at = now()
  RETURNING public.licenses_free_ip_rate_limits.count INTO v_count;

  RETURN QUERY
    SELECT (v_count <= v_limit), v_count, (v_window_start + make_interval(secs => v_window));
END;
$$;

-- Compatibility overload used by older callers with p_route / p_window_seconds.
CREATE OR REPLACE FUNCTION public.check_free_ip_rate_limit(
  p_ip_hash text,
  p_route text,
  p_limit integer DEFAULT 60,
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
  v_ip text;
  v_route text;
  v_limit integer;
  v_window integer;
BEGIN
  v_ip := coalesce(nullif(trim(p_ip_hash), ''), 'unknown');
  v_route := coalesce(nullif(trim(p_route), ''), 'unknown');
  v_limit := greatest(coalesce(p_limit, 60), 1);
  v_window := greatest(coalesce(p_window_seconds, 60), 10);

  v_window_start := to_timestamp(floor(extract(epoch FROM now()) / v_window) * v_window);

  INSERT INTO public.licenses_free_ip_rate_limits (ip_hash, route, window_start, count, updated_at)
  VALUES (v_ip, v_route, v_window_start, 1, now())
  ON CONFLICT (ip_hash, route, window_start)
  DO UPDATE SET
    count = public.licenses_free_ip_rate_limits.count + 1,
    updated_at = now()
  RETURNING public.licenses_free_ip_rate_limits.count INTO v_count;

  RETURN QUERY SELECT (v_count <= v_limit), v_count, v_window_start;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_free_fp_rate_limit(
  p_fp_hash text,
  p_route text,
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
  v_fp text;
  v_route text;
  v_limit integer;
  v_window integer;
BEGIN
  v_fp := coalesce(nullif(trim(p_fp_hash), ''), 'unknown');
  v_route := coalesce(nullif(trim(p_route), ''), 'unknown');
  v_limit := greatest(coalesce(p_limit, 12), 1);
  v_window := greatest(coalesce(p_window_seconds, 60), 10);

  v_window_start := to_timestamp(floor(extract(epoch FROM now()) / v_window) * v_window);

  INSERT INTO public.licenses_free_fp_rate_limits (fp_hash, route, window_start, count, updated_at)
  VALUES (v_fp, v_route, v_window_start, 1, now())
  ON CONFLICT (fp_hash, route, window_start)
  DO UPDATE SET
    count = public.licenses_free_fp_rate_limits.count + 1,
    updated_at = now()
  RETURNING public.licenses_free_fp_rate_limits.count INTO v_count;

  RETURN QUERY SELECT (v_count <= v_limit), v_count, v_window_start;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_free_ip_rate_limit(text, integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_free_ip_rate_limit(text, text, integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_free_fp_rate_limit(text, text, integer, integer) TO anon, authenticated, service_role;

-- 5) Compatibility view for runbooks/queries
CREATE OR REPLACE VIEW public.free_ip_rate_limits AS
SELECT
  ip_hash,
  window_start,
  count,
  updated_at
FROM public.licenses_free_ip_rate_limits;

GRANT SELECT ON public.free_ip_rate_limits TO anon, authenticated, service_role;
