ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS starts_on_first_use boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'licenses_duration_seconds_positive') THEN
    ALTER TABLE public.licenses
      ADD CONSTRAINT licenses_duration_seconds_positive
      CHECK (duration_seconds IS NULL OR duration_seconds > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'licenses_first_use_requires_duration') THEN
    ALTER TABLE public.licenses
      ADD CONSTRAINT licenses_first_use_requires_duration
      CHECK (starts_on_first_use = false OR duration_seconds IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'licenses_expires_at_required_for_standard') THEN
    ALTER TABLE public.licenses
      ADD CONSTRAINT licenses_expires_at_required_for_standard
      CHECK (starts_on_first_use = true OR expires_at IS NOT NULL);
  END IF;
END $$;