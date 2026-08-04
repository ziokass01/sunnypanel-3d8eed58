-- Harden client integrations so one rent account maps to at most one integration row.
-- Safe behavior target:
-- 1) delete account => delete integration automatically via FK cascade
-- 2) one account => one integration row
-- 3) rate limit stays in a sane range

DO $$
DECLARE
  v_rel regclass := to_regclass('rent.client_integrations');
BEGIN
  IF v_rel IS NULL THEN
    RAISE NOTICE 'skip: rent.client_integrations does not exist yet';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'client_integrations_account_id_key'
      AND conrelid = v_rel
  ) THEN
    ALTER TABLE rent.client_integrations
      ADD CONSTRAINT client_integrations_account_id_key UNIQUE (account_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'client_integrations_rate_limit_check'
      AND conrelid = v_rel
  ) THEN
    ALTER TABLE rent.client_integrations
      ADD CONSTRAINT client_integrations_rate_limit_check
      CHECK (rate_limit_per_minute BETWEEN 10 AND 100000);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'client_integrations_account_id_key'
      AND conrelid = v_rel
  ) THEN
    COMMENT ON CONSTRAINT client_integrations_account_id_key ON rent.client_integrations IS
      'Each rent account may have at most one customer integration row. This makes SQL previews and edit-form setup deterministic.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'client_integrations_rate_limit_check'
      AND conrelid = v_rel
  ) THEN
    COMMENT ON CONSTRAINT client_integrations_rate_limit_check ON rent.client_integrations IS
      'Reject obviously broken or abusive rate limit values.';
  END IF;
END
$$;
