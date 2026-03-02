-- FINAL SAFETY NET: FREE rate-limit tables + RPCs (idempotent)
-- Ensures production cannot hit SERVER_RATE_LIMIT_MISCONFIG due to missing objects.

-- 1) Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1.5) Drop legacy views that used these table names (from older migrations)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'licenses_free_ip_rate_limits',
        'licenses_free_fp_rate_limits',
        'free_ip_rate_limits',
        'free_fp_rate_limits'
      )
      AND c.relkind IN ('v','m')
  LOOP
    IF r.relkind = 'm' THEN
      EXECUTE format('DROP MATERIALIZED VIEW IF EXISTS public.%I CASCADE', r.relname);
    ELSE
      EXECUTE format('DROP VIEW IF EXISTS public.%I CASCADE', r.relname);
    END IF;
  END LOOP;
END $$;


-- 2) Tables (preferred names requested)
CREATE TABLE IF NOT EXISTS public.licenses_free_ip_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  route text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_licenses_free_ip_rate_limits
  ON public.licenses_free_ip_rate_limits (ip_hash, route, window_start);

CREATE TABLE IF NOT EXISTS public.licenses_free_fp_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fp_hash text NOT NULL,
  route text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_licenses_free_fp_rate_limits
  ON public.licenses_free_fp_rate_limits (fp_hash, route, window_start);

-- Keep compatibility with existing installations that already have free_ip_rate_limits/free_fp_rate_limits
-- by creating them if missing.
-- LEGACY VIEW GUARD: drop legacy views before creating TABLEs / indexes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'free_ip_rate_limits' AND c.relkind IN ('v','m')
  ) THEN
    EXECUTE 'DROP VIEW public.free_ip_rate_limits CASCADE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'free_fp_rate_limits' AND c.relkind IN ('v','m')
  ) THEN
    EXECUTE 'DROP VIEW public.free_fp_rate_limits CASCADE';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.free_ip_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  route text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='free_ip_rate_limits' AND c.relkind IN ('r','p')
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS ux_free_ip_rate_limits ON public.free_ip_rate_limits (ip_hash, route, window_start)';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.free_fp_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fp_hash text NOT NULL,
  route text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='free_fp_rate_limits' AND c.relkind IN ('r','p')
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS ux_free_fp_rate_limits ON public.free_fp_rate_limits (fp_hash, route, window_start)';
  END IF;
END $$;

-- 3) RLS (deny-by-default; RPCs are SECURITY DEFINER)
ALTER TABLE public.licenses_free_ip_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licenses_free_fp_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_ip_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_fp_rate_limits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- ip
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='licenses_free_ip_rate_limits' AND policyname='deny_all_select'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all_select ON public.licenses_free_ip_rate_limits FOR SELECT USING (false)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='licenses_free_ip_rate_limits' AND policyname='deny_all_insert'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all_insert ON public.licenses_free_ip_rate_limits FOR INSERT WITH CHECK (false)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='licenses_free_ip_rate_limits' AND policyname='deny_all_update'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all_update ON public.licenses_free_ip_rate_limits FOR UPDATE USING (false)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='licenses_free_ip_rate_limits' AND policyname='deny_all_delete'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all_delete ON public.licenses_free_ip_rate_limits FOR DELETE USING (false)';
  END IF;

  -- fp
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='licenses_free_fp_rate_limits' AND policyname='deny_all_select'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all_select ON public.licenses_free_fp_rate_limits FOR SELECT USING (false)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='licenses_free_fp_rate_limits' AND policyname='deny_all_insert'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all_insert ON public.licenses_free_fp_rate_limits FOR INSERT WITH CHECK (false)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='licenses_free_fp_rate_limits' AND policyname='deny_all_update'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all_update ON public.licenses_free_fp_rate_limits FOR UPDATE USING (false)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='licenses_free_fp_rate_limits' AND policyname='deny_all_delete'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all_delete ON public.licenses_free_fp_rate_limits FOR DELETE USING (false)';
  END IF;

  -- existing tables too (same deny)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='free_ip_rate_limits' AND policyname='deny_all_select'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all_select ON public.free_ip_rate_limits FOR SELECT USING (false)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='free_ip_rate_limits' AND policyname='deny_all_insert'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all_insert ON public.free_ip_rate_limits FOR INSERT WITH CHECK (false)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='free_ip_rate_limits' AND policyname='deny_all_update'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all_update ON public.free_ip_rate_limits FOR UPDATE USING (false)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='free_ip_rate_limits' AND policyname='deny_all_delete'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all_delete ON public.free_ip_rate_limits FOR DELETE USING (false)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='free_fp_rate_limits' AND policyname='deny_all_select'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all_select ON public.free_fp_rate_limits FOR SELECT USING (false)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='free_fp_rate_limits' AND policyname='deny_all_insert'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all_insert ON public.free_fp_rate_limits FOR INSERT WITH CHECK (false)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='free_fp_rate_limits' AND policyname='deny_all_update'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all_update ON public.free_fp_rate_limits FOR UPDATE USING (false)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='free_fp_rate_limits' AND policyname='deny_all_delete'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all_delete ON public.free_fp_rate_limits FOR DELETE USING (false)';
  END IF;
END $$;

-- 4) RPCs (signature = p_* + p_route + p_window_seconds)
-- Uses free_* tables if they exist; otherwise falls back to licenses_free_* tables.

CREATE OR REPLACE FUNCTION public.check_free_ip_rate_limit(
  p_ip_hash text,
  p_route text DEFAULT 'free-start',
  p_limit integer DEFAULT 60,
  p_window_seconds integer DEFAULT 60
)
RETURNS TABLE(allowed boolean, current_count integer, window_start timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_window_start timestamptz;
  v_count integer;
  v_ip text;
  v_route text;
  v_table regclass;
BEGIN
  v_ip := coalesce(nullif(trim(p_ip_hash), ''), 'unknown');
  v_route := coalesce(nullif(trim(p_route), ''), 'unknown');

  IF p_limit IS NULL OR p_limit < 1 THEN p_limit := 60; END IF;
  IF p_window_seconds IS NULL OR p_window_seconds < 10 THEN p_window_seconds := 60; END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  v_table := to_regclass('public.free_ip_rate_limits');
  IF v_table IS NULL THEN
    v_table := to_regclass('public.licenses_free_ip_rate_limits');
  END IF;

  EXECUTE format(
    'INSERT INTO %s (ip_hash, route, window_start, count, updated_at) VALUES ($1,$2,$3,1,now())
     ON CONFLICT (ip_hash, route, window_start)
     DO UPDATE SET count = %s.count + 1, updated_at = now()
     RETURNING count',
    v_table,
    v_table
  )
  INTO v_count
  USING v_ip, v_route, v_window_start;

  RETURN QUERY SELECT (v_count <= p_limit), v_count, v_window_start;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_free_fp_rate_limit(
  p_fp_hash text,
  p_route text DEFAULT 'free-start',
  p_limit integer DEFAULT 60,
  p_window_seconds integer DEFAULT 60
)
RETURNS TABLE(allowed boolean, current_count integer, window_start timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_window_start timestamptz;
  v_count integer;
  v_fp text;
  v_route text;
  v_table regclass;
BEGIN
  v_fp := coalesce(nullif(trim(p_fp_hash), ''), 'unknown');
  v_route := coalesce(nullif(trim(p_route), ''), 'unknown');

  IF p_limit IS NULL OR p_limit < 1 THEN p_limit := 60; END IF;
  IF p_window_seconds IS NULL OR p_window_seconds < 10 THEN p_window_seconds := 60; END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  v_table := to_regclass('public.free_fp_rate_limits');
  IF v_table IS NULL THEN
    v_table := to_regclass('public.licenses_free_fp_rate_limits');
  END IF;

  EXECUTE format(
    'INSERT INTO %s (fp_hash, route, window_start, count, updated_at) VALUES ($1,$2,$3,1,now())
     ON CONFLICT (fp_hash, route, window_start)
     DO UPDATE SET count = %s.count + 1, updated_at = now()
     RETURNING count',
    v_table,
    v_table
  )
  INTO v_count
  USING v_fp, v_route, v_window_start;

  RETURN QUERY SELECT (v_count <= p_limit), v_count, v_window_start;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_free_ip_rate_limit(text, text, integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_free_fp_rate_limit(text, text, integer, integer) TO anon, authenticated, service_role;

-- Refresh schema cache for API layer
SELECT pg_notify('pgrst', 'reload schema');
