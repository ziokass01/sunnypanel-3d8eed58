ALTER TABLE public.licenses_free_settings
  ADD COLUMN IF NOT EXISTS free_session_waiting_limit integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS free_link4m_rotate_nonce_pass1 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_link4m_rotate_nonce_pass2 integer NOT NULL DEFAULT 0;

ALTER TABLE public.licenses_free_sessions
  ADD COLUMN IF NOT EXISTS rotate_bucket_pass2 text NULL;

UPDATE public.licenses_free_settings
SET
  free_session_waiting_limit = GREATEST(1, COALESCE(free_session_waiting_limit, 2)),
  free_link4m_rotate_nonce_pass1 = COALESCE(free_link4m_rotate_nonce_pass1, 0),
  free_link4m_rotate_nonce_pass2 = COALESCE(free_link4m_rotate_nonce_pass2, 0);
