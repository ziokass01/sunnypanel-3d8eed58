ALTER TABLE rent.keys
  ADD COLUMN IF NOT EXISTS max_devices INTEGER NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rent_keys_max_devices_range'
  ) THEN
    ALTER TABLE rent.keys
      ADD CONSTRAINT rent_keys_max_devices_range
      CHECK (max_devices IS NULL OR (max_devices >= 1 AND max_devices <= 999999));
  END IF;
END $$;
