-- Add revealed license id for idempotent reveal flow

ALTER TABLE public.licenses_free_sessions
  ADD COLUMN IF NOT EXISTS revealed_license_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_lfs_revealed_license_id
  ON public.licenses_free_sessions (revealed_license_id);
