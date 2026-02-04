DO $$
BEGIN
  -- Add missing settings columns one-by-one (robust across Postgres versions)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='licenses_free_settings' AND column_name='free_enabled'
  ) THEN
    ALTER TABLE public.licenses_free_settings ADD COLUMN free_enabled boolean NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='licenses_free_settings' AND column_name='free_disabled_message'
  ) THEN
    ALTER TABLE public.licenses_free_settings ADD COLUMN free_disabled_message text NOT NULL DEFAULT 'Trang GetKey đang tạm đóng.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='licenses_free_settings' AND column_name='free_min_delay_seconds'
  ) THEN
    ALTER TABLE public.licenses_free_settings ADD COLUMN free_min_delay_seconds integer NOT NULL DEFAULT 25;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='licenses_free_settings' AND column_name='free_return_seconds'
  ) THEN
    ALTER TABLE public.licenses_free_settings ADD COLUMN free_return_seconds integer NOT NULL DEFAULT 10;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='licenses_free_settings' AND column_name='free_daily_limit_per_fingerprint'
  ) THEN
    ALTER TABLE public.licenses_free_settings ADD COLUMN free_daily_limit_per_fingerprint integer NOT NULL DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='licenses_free_settings' AND column_name='free_require_link4m_referrer'
  ) THEN
    ALTER TABLE public.licenses_free_settings ADD COLUMN free_require_link4m_referrer boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='licenses_free_settings' AND column_name='free_public_note'
  ) THEN
    ALTER TABLE public.licenses_free_settings ADD COLUMN free_public_note text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='licenses_free_settings' AND column_name='free_public_links'
  ) THEN
    ALTER TABLE public.licenses_free_settings ADD COLUMN free_public_links jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Ensure singleton row exists
INSERT INTO public.licenses_free_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Reload PostgREST schema cache
SELECT pg_notify('pgrst','reload schema');
