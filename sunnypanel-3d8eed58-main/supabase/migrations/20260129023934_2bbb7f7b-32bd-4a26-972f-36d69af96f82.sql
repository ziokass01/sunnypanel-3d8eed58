-- A) DATA MODEL: start_on_first_use (days-based) while keeping legacy columns intact

ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS start_on_first_use boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duration_days integer,
  ADD COLUMN IF NOT EXISTS first_used_at timestamptz;

DO $$
BEGIN
  -- If start_on_first_use = true => duration_days >= 1 (and not null)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'licenses_duration_days_valid') THEN
    ALTER TABLE public.licenses
      ADD CONSTRAINT licenses_duration_days_valid
      CHECK (
        start_on_first_use = false
        OR (duration_days IS NOT NULL AND duration_days >= 1)
      );
  END IF;

  -- If start_on_first_use = false => duration_days must be NULL and first_used_at must be NULL
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'licenses_first_use_fields_null_when_disabled') THEN
    ALTER TABLE public.licenses
      ADD CONSTRAINT licenses_first_use_fields_null_when_disabled
      CHECK (
        start_on_first_use = true
        OR (duration_days IS NULL AND first_used_at IS NULL)
      );
  END IF;
END $$;
