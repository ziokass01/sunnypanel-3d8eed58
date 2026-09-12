-- Idempotent schema additions for stricter free-claim anti-abuse flow
-- Adds server-side close deadline and "copied" marker to prevent infinite reveal loops / tab-stalling abuse.

BEGIN;

ALTER TABLE IF EXISTS public.licenses_free_sessions
  ADD COLUMN IF NOT EXISTS close_deadline_at timestamptz NULL;

ALTER TABLE IF EXISTS public.licenses_free_sessions
  ADD COLUMN IF NOT EXISTS copied_at timestamptz NULL;

-- Helpful index for cleanup/monitoring
CREATE INDEX IF NOT EXISTS licenses_free_sessions_close_deadline_idx
  ON public.licenses_free_sessions (close_deadline_at);

COMMIT;
