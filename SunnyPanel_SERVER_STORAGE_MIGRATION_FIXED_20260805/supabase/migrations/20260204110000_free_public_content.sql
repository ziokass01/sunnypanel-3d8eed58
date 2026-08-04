-- Add public note + links that can be rendered on /free and /free/claim

ALTER TABLE public.licenses_free_settings
  ADD COLUMN IF NOT EXISTS free_public_note text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS free_public_links jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Ensure settings row exists
INSERT INTO public.licenses_free_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
