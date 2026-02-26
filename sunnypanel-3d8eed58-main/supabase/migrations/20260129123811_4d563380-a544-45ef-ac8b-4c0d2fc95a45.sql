-- Make countdown licenses rely on duration_seconds (backward compatible)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname='public' AND t.relname='licenses' AND c.conname='licenses_first_use_requires_duration_days'
  ) THEN
    ALTER TABLE public.licenses DROP CONSTRAINT licenses_first_use_requires_duration_days;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname='public' AND t.relname='licenses' AND c.conname='licenses_duration_days_valid'
  ) THEN
    ALTER TABLE public.licenses DROP CONSTRAINT licenses_duration_days_valid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname='public' AND t.relname='licenses' AND c.conname='licenses_duration_days_positive'
  ) THEN
    ALTER TABLE public.licenses DROP CONSTRAINT licenses_duration_days_positive;
  END IF;
END $$;

-- Optional helper index for admin filtering/queries
CREATE INDEX IF NOT EXISTS idx_licenses_start_first_used
  ON public.licenses (start_on_first_use, first_used_at);
