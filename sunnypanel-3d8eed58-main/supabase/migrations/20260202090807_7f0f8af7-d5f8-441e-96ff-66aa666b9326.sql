-- Add-only: store editable Free Key settings (admin-managed)

CREATE TABLE IF NOT EXISTS public.licenses_free_settings (
  id integer PRIMARY KEY,
  free_outbound_url text NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL
);

ALTER TABLE public.licenses_free_settings ENABLE ROW LEVEL SECURITY;

-- RLS: admins can manage
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'licenses_free_settings'
      AND policyname = 'Admins read free settings'
  ) THEN
    CREATE POLICY "Admins read free settings"
    ON public.licenses_free_settings
    FOR SELECT
    USING (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'licenses_free_settings'
      AND policyname = 'Admins insert free settings'
  ) THEN
    CREATE POLICY "Admins insert free settings"
    ON public.licenses_free_settings
    FOR INSERT
    WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'licenses_free_settings'
      AND policyname = 'Admins update free settings'
  ) THEN
    CREATE POLICY "Admins update free settings"
    ON public.licenses_free_settings
    FOR UPDATE
    USING (public.has_role(auth.uid(), 'admin'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END $$;

-- Keep updated_at fresh on edits (table-local trigger)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_licenses_free_settings_updated_at ON public.licenses_free_settings;
CREATE TRIGGER trg_licenses_free_settings_updated_at
BEFORE UPDATE ON public.licenses_free_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Optional seed row for convenience (admin can overwrite)
INSERT INTO public.licenses_free_settings (id, free_outbound_url)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;