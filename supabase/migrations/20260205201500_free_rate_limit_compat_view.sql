-- Compatibility objects for operators/runbooks expecting free_ip_rate_limits naming
--
-- Some DBs may already have `public.free_ip_rate_limits` as a TABLE.
-- `CREATE OR REPLACE VIEW` can't replace a table, so we defensively rename/drop.

DO $$
BEGIN
  -- If a TABLE exists with this name, rename it to preserve data instead of dropping it.
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'free_ip_rate_limits'
      AND c.relkind = 'r'
  ) THEN
    ALTER TABLE public.free_ip_rate_limits RENAME TO free_ip_rate_limits_legacy;
  END IF;

  -- If a materialized view exists, drop it.
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'free_ip_rate_limits'
      AND c.relkind = 'm'
  ) THEN
    DROP MATERIALIZED VIEW public.free_ip_rate_limits;
  END IF;

  -- If a view exists, drop it so we can recreate cleanly.
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'free_ip_rate_limits'
      AND c.relkind = 'v'
  ) THEN
    DROP VIEW public.free_ip_rate_limits;
  END IF;
END $$;

CREATE VIEW public.free_ip_rate_limits AS
SELECT
  ip_hash,
  window_start,
  count,
  updated_at
FROM public.licenses_free_rate_limits;

