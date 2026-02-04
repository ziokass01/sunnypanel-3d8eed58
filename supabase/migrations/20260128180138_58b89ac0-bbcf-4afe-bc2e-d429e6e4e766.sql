-- Add new columns for "Start on first use (duration days)" (backward compatible)
ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS start_on_first_use boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duration_days integer,
  ADD COLUMN IF NOT EXISTS first_used_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'licenses_duration_days_positive') THEN
    ALTER TABLE public.licenses
      ADD CONSTRAINT licenses_duration_days_positive
      CHECK (duration_days IS NULL OR duration_days > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'licenses_first_use_requires_duration_days') THEN
    ALTER TABLE public.licenses
      ADD CONSTRAINT licenses_first_use_requires_duration_days
      CHECK (start_on_first_use = false OR duration_days IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'licenses_expires_at_required_for_standard_v2') THEN
    ALTER TABLE public.licenses
      ADD CONSTRAINT licenses_expires_at_required_for_standard_v2
      CHECK (start_on_first_use = true OR expires_at IS NOT NULL);
  END IF;
END $$;