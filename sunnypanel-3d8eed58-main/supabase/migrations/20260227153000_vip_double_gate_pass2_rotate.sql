-- Add VIP double-gate + Pass2 config + Link4M rotate bucket (admin-managed)

-- Settings columns
ALTER TABLE public.licenses_free_settings
  ADD COLUMN IF NOT EXISTS free_outbound_url_pass2 text NULL,
  ADD COLUMN IF NOT EXISTS free_min_delay_seconds_pass2 integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS free_link4m_rotate_days integer NOT NULL DEFAULT 7;

-- Key type flag: VIP requires 2 passes
ALTER TABLE public.licenses_free_key_types
  ADD COLUMN IF NOT EXISTS requires_double_gate boolean NOT NULL DEFAULT false;

-- Session tracking columns
ALTER TABLE public.licenses_free_sessions
  ADD COLUMN IF NOT EXISTS passes_required integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS passes_completed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_pass integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rotate_bucket text NULL,
  ADD COLUMN IF NOT EXISTS out_token_hash_pass2 text NULL,
  ADD COLUMN IF NOT EXISTS pass1_ok_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS pass2_started_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS pass2_ok_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_lfs_out_token_hash_pass2 ON public.licenses_free_sessions(out_token_hash_pass2);
CREATE INDEX IF NOT EXISTS idx_lfs_rotate_bucket ON public.licenses_free_sessions(rotate_bucket);
