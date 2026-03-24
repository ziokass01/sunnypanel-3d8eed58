-- Rent user keys: custom duration days + start immediately / start on first use

ALTER TABLE IF EXISTS rent.keys
  ADD COLUMN IF NOT EXISTS starts_on_first_use BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duration_days INTEGER NULL,
  ADD COLUMN IF NOT EXISTS first_used_at TIMESTAMPTZ NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rent_keys_duration_days_positive'
  ) THEN
    ALTER TABLE rent.keys
      ADD CONSTRAINT rent_keys_duration_days_positive
      CHECK (duration_days IS NULL OR duration_days >= 1);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rent_keys_first_use_requires_duration_days'
  ) THEN
    ALTER TABLE rent.keys
      ADD CONSTRAINT rent_keys_first_use_requires_duration_days
      CHECK (starts_on_first_use = false OR duration_days IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS rent_keys_account_id_created_at_idx
  ON rent.keys (account_id, created_at DESC);

ALTER TABLE IF EXISTS rent.activation_keys
  ADD COLUMN IF NOT EXISTS duration_days INTEGER NULL;

ALTER TABLE IF EXISTS rent.activation_keys
  ALTER COLUMN duration_seconds DROP NOT NULL;

UPDATE rent.activation_keys
SET duration_days = COALESCE(duration_days, GREATEST(1, ROUND(duration_seconds::numeric / 86400.0)::int))
WHERE duration_seconds IS NOT NULL;
