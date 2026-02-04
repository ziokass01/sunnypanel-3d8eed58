-- Free Keys: ensure licenses_free_sessions has required columns used by free-start/free-gate/free-reveal/admin UI
ALTER TABLE public.licenses_free_sessions
  ADD COLUMN IF NOT EXISTS started_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS gate_ok_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS revealed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS out_token_hash text NULL,
  ADD COLUMN IF NOT EXISTS out_expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS claim_token_hash text NULL,
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS key_type_code text NULL,
  ADD COLUMN IF NOT EXISTS duration_seconds integer NULL;

-- Ensure singleton settings row exists (safe, idempotent)
INSERT INTO public.licenses_free_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Reload PostgREST schema cache so the frontend stops seeing "schema cache" errors
SELECT pg_notify('pgrst', 'reload schema');
