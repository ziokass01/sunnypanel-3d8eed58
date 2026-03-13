-- Rent (website rental) subsystem - separate schema to avoid mixing with licenses/free.
CREATE SCHEMA IF NOT EXISTS rent;

-- Accounts created/managed by admin (NOT auth.users)
CREATE TABLE IF NOT EXISTS rent.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  hmac_secret TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_disabled BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NULL,
  max_devices INT NOT NULL DEFAULT 1,
  note TEXT NULL
);

-- Activation keys issued by admin (separate from licenses/free)
CREATE TABLE IF NOT EXISTS rent.activation_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  duration_seconds INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_by UUID NULL REFERENCES rent.accounts(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  note TEXT NULL
);

-- One-time password reset codes created by admin
CREATE TABLE IF NOT EXISTS rent.reset_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES rent.accounts(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Sessions for renter portal (custom JWT references session id)
CREATE TABLE IF NOT EXISTS rent.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES rent.accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL
);

-- Keys managed by renters (different format from SUNNY-)
CREATE TABLE IF NOT EXISTS rent.keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES rent.accounts(id) ON DELETE CASCADE,
  key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  note TEXT NULL
);

-- Device binding per rent key
CREATE TABLE IF NOT EXISTS rent.key_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID NOT NULL REFERENCES rent.keys(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (key_id, device_id)
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION rent.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS rent_accounts_set_updated_at ON rent.accounts;
CREATE TRIGGER rent_accounts_set_updated_at
BEFORE UPDATE ON rent.accounts
FOR EACH ROW
EXECUTE FUNCTION rent.set_updated_at();

-- Helper: subscription active?
CREATE OR REPLACE FUNCTION rent.is_active(_account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = rent
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM rent.accounts a
    WHERE a.id = _account_id
      AND a.is_disabled = false
      AND a.expires_at IS NOT NULL
      AND a.expires_at > now()
  )
$$;

-- RLS: deny by default (Edge Functions use service role)
ALTER TABLE rent.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent.activation_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent.reset_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent.keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent.key_devices ENABLE ROW LEVEL SECURITY;

-- No policies => anonymous/users cannot read/write these tables directly.
