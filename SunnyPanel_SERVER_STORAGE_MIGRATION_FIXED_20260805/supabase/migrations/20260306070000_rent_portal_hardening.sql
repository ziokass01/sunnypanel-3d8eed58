-- Rent hardening for portal/admin split requirements.

ALTER TABLE IF EXISTS rent.accounts
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ NULL;

ALTER TABLE IF EXISTS rent.activation_keys
  ADD COLUMN IF NOT EXISTS target_account_id UUID NULL REFERENCES rent.accounts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS server_tag TEXT NULL;

ALTER TABLE IF EXISTS rent.keys
  ADD COLUMN IF NOT EXISTS server_tag TEXT NULL;

-- Backfill from legacy master_sig if it exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'rent' AND table_name = 'keys' AND column_name = 'master_sig'
  ) THEN
    EXECUTE 'UPDATE rent.keys SET server_tag = COALESCE(server_tag, master_sig) WHERE server_tag IS NULL';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS activation_keys_target_account_id_idx ON rent.activation_keys (target_account_id, created_at DESC);

-- Seed default download items shown in user portal Info tab.
INSERT INTO rent.download_links (title, url, note, enabled)
SELECT 'CA pack (fix SSL 60)', '/downloads/sunny_login_ca_pack.zip', 'Tải gói CA để sửa lỗi SSL 60 cho C++/libcurl.', true
WHERE NOT EXISTS (
  SELECT 1 FROM rent.download_links WHERE title = 'CA pack (fix SSL 60)' AND url = '/downloads/sunny_login_ca_pack.zip'
);

INSERT INTO rent.download_links (title, url, note, enabled)
SELECT 'SunnyCABundle.h', '/downloads/SunnyCABundle.h', 'Header bundle để ghi ra file rồi set CURLOPT_CAINFO.', true
WHERE NOT EXISTS (
  SELECT 1 FROM rent.download_links WHERE title = 'SunnyCABundle.h' AND url = '/downloads/SunnyCABundle.h'
);
