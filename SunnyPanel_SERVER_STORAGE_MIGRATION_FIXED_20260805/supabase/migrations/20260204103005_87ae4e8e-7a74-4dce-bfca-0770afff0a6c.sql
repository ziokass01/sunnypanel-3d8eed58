ALTER TABLE public.licenses_free_settings
ADD COLUMN IF NOT EXISTS free_min_delay_enabled boolean NOT NULL DEFAULT true;

-- Ensure singleton row has a value (defensive)
UPDATE public.licenses_free_settings
SET free_min_delay_enabled = COALESCE(free_min_delay_enabled, true)
WHERE id = 1;

-- Reload PostgREST schema cache
SELECT pg_notify('pgrst','reload schema');
