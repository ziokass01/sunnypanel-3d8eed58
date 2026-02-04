-- Create table for admin-managed free key types (if missing)
CREATE TABLE IF NOT EXISTS public.licenses_free_key_types (
  code text PRIMARY KEY,
  label text NOT NULL,
  kind text NOT NULL,
  value integer NOT NULL,
  duration_seconds integer NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL
);

-- Basic sanity constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'licenses_free_key_types_kind_chk'
  ) THEN
    ALTER TABLE public.licenses_free_key_types
      ADD CONSTRAINT licenses_free_key_types_kind_chk
      CHECK (kind IN ('hour','day'));
  END IF;
END$$;

-- Keep updated_at fresh
DROP TRIGGER IF EXISTS set_updated_at_licenses_free_key_types ON public.licenses_free_key_types;
CREATE TRIGGER set_updated_at_licenses_free_key_types
BEFORE UPDATE ON public.licenses_free_key_types
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Secure with RLS (admin-only)
ALTER TABLE public.licenses_free_key_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can read free key types" ON public.licenses_free_key_types;
CREATE POLICY "Admin can read free key types"
ON public.licenses_free_key_types
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admin can insert free key types" ON public.licenses_free_key_types;
CREATE POLICY "Admin can insert free key types"
ON public.licenses_free_key_types
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admin can update free key types" ON public.licenses_free_key_types;
CREATE POLICY "Admin can update free key types"
ON public.licenses_free_key_types
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admin can delete free key types" ON public.licenses_free_key_types;
CREATE POLICY "Admin can delete free key types"
ON public.licenses_free_key_types
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Reload PostgREST schema cache
SELECT pg_notify('pgrst','reload schema');
