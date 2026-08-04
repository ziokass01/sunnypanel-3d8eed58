ALTER TABLE IF EXISTS rent.accounts
  ADD COLUMN IF NOT EXISTS hmac_view_password_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS hmac_view_failed_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hmac_view_locked_until TIMESTAMPTZ NULL;

ALTER TABLE IF EXISTS rent.keys
  ADD COLUMN IF NOT EXISTS duration_value INTEGER NULL,
  ADD COLUMN IF NOT EXISTS duration_unit TEXT NULL;

UPDATE rent.keys
SET duration_value = COALESCE(duration_value, duration_days),
    duration_unit = COALESCE(duration_unit, CASE WHEN duration_days IS NOT NULL THEN 'day' ELSE NULL END)
WHERE duration_value IS NULL OR duration_unit IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rent_keys_duration_unit_valid'
  ) THEN
    ALTER TABLE rent.keys
      ADD CONSTRAINT rent_keys_duration_unit_valid
      CHECK (duration_unit IS NULL OR duration_unit IN ('hour', 'day'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rent_keys_duration_value_positive'
  ) THEN
    ALTER TABLE rent.keys
      ADD CONSTRAINT rent_keys_duration_value_positive
      CHECK (duration_value IS NULL OR duration_value >= 1);
  END IF;
END $$;
