-- Add server-side master signature to rent.keys for anti-fake-key (master stays only on server)
ALTER TABLE IF EXISTS rent.keys
ADD COLUMN IF NOT EXISTS master_sig TEXT NULL;
