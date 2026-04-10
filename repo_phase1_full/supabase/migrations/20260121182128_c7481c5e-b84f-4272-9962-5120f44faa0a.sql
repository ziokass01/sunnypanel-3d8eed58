-- 1) Soft delete support
ALTER TABLE public.licenses
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_licenses_deleted_at ON public.licenses (deleted_at);

-- 2) Ensure license key format validation actually runs (function exists but no trigger yet)
DROP TRIGGER IF EXISTS trg_validate_license_key_format ON public.licenses;
CREATE TRIGGER trg_validate_license_key_format
BEFORE INSERT OR UPDATE OF key ON public.licenses
FOR EACH ROW
EXECUTE FUNCTION public.validate_license_key_format();

-- 3) Make device upsert possible + prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS uq_license_devices_license_device
ON public.license_devices (license_id, device_id);

-- 4) Rate limit table: prevent duplicates per window
CREATE UNIQUE INDEX IF NOT EXISTS uq_verify_rate_limits_key_ip_window
ON public.verify_rate_limits (license_key, ip, window_start);

-- 5) One-time first-admin bootstrap policy (avoids being locked out)
CREATE OR REPLACE FUNCTION public.no_admin_exists()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE role = 'admin'::public.app_role
  );
$$;

DROP POLICY IF EXISTS "First admin can self-assign" ON public.user_roles;
CREATE POLICY "First admin can self-assign"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  public.no_admin_exists()
  AND user_id = auth.uid()
  AND role = 'admin'::public.app_role
);
