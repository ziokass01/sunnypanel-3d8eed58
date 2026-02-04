-- Ensure licenses_free_settings has required columns for Free flow
ALTER TABLE public.licenses_free_settings
  ADD COLUMN IF NOT EXISTS free_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS free_disabled_message text NOT NULL DEFAULT 'Trang GetKey đang tạm đóng.',
  ADD COLUMN IF NOT EXISTS free_min_delay_seconds integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS free_return_seconds integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS free_daily_limit_per_fingerprint integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS free_require_link4m_referrer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_public_note text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS free_public_links jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Ensure singleton row exists
INSERT INTO public.licenses_free_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Reload PostgREST schema cache
SELECT pg_notify('pgrst','reload schema');
