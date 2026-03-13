-- Ensure countdown-license columns exist (idempotent)
ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS start_on_first_use boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duration_seconds integer NULL,
  ADD COLUMN IF NOT EXISTS first_used_at timestamptz NULL;

-- Data integrity constraints (avoid dirty mixed-mode rows)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'licenses_first_use_requires_duration_seconds'
  ) THEN
    ALTER TABLE public.licenses
      ADD CONSTRAINT licenses_first_use_requires_duration_seconds
      CHECK (
        (start_on_first_use = false) OR (duration_seconds IS NOT NULL AND duration_seconds > 0)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'licenses_fixed_must_not_have_duration_seconds'
  ) THEN
    ALTER TABLE public.licenses
      ADD CONSTRAINT licenses_fixed_must_not_have_duration_seconds
      CHECK (
        (start_on_first_use = true) OR (duration_seconds IS NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'licenses_fixed_must_not_have_first_used_at'
  ) THEN
    ALTER TABLE public.licenses
      ADD CONSTRAINT licenses_fixed_must_not_have_first_used_at
      CHECK (
        (start_on_first_use = true) OR (first_used_at IS NULL)
      );
  END IF;
END $$;

-- Optional index to speed up admin filtering
CREATE INDEX IF NOT EXISTS idx_licenses_start_first_used
  ON public.licenses (start_on_first_use, first_used_at);