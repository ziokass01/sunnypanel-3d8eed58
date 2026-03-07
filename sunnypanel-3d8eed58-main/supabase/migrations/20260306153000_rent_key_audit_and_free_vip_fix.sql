-- Rent key audit logs + free VIP pass2 robustness

CREATE TABLE IF NOT EXISTS rent.key_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NULL REFERENCES rent.accounts(id) ON DELETE SET NULL,
  key_id UUID NULL REFERENCES rent.keys(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  result TEXT NULL,
  device_id TEXT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rent_key_audit_logs_account_id_created_at_idx
  ON rent.key_audit_logs (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS rent_key_audit_logs_key_id_created_at_idx
  ON rent.key_audit_logs (key_id, created_at DESC);

ALTER TABLE rent.key_audit_logs ENABLE ROW LEVEL SECURITY;
