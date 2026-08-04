-- Roles enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
  END IF;
END $$;

-- User roles table (separate from profiles/users)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer helper to avoid RLS recursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Licenses
CREATE TABLE IF NOT EXISTS public.licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NULL,
  max_devices INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  note TEXT NULL
);

-- Devices activated per license
CREATE TABLE IF NOT EXISTS public.license_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (license_id, device_id)
);

-- Audit logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  license_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Rate limit storage for verify-key (key+ip)
CREATE TABLE IF NOT EXISTS public.verify_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key TEXT NOT NULL,
  ip TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (license_key, ip)
);

-- Basic indexes
CREATE INDEX IF NOT EXISTS idx_licenses_is_active ON public.licenses (is_active);
CREATE INDEX IF NOT EXISTS idx_licenses_expires_at ON public.licenses (expires_at);
CREATE INDEX IF NOT EXISTS idx_license_devices_license_id ON public.license_devices (license_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_license_key ON public.audit_logs (license_key);
CREATE INDEX IF NOT EXISTS idx_verify_rl_window_start ON public.verify_rate_limits (window_start);

-- Key format validation trigger (avoid CHECK with now())
CREATE OR REPLACE FUNCTION public.validate_license_key_format()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.key IS NULL OR NEW.key !~ '^SUNNY-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$' THEN
    RAISE EXCEPTION 'Invalid license key format. Expected SUNNY-XXXX-XXXX-XXXX (A-Z0-9)';
  END IF;
  NEW.key := upper(NEW.key);
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_validate_license_key_format'
  ) THEN
    CREATE TRIGGER trg_validate_license_key_format
    BEFORE INSERT OR UPDATE OF key ON public.licenses
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_license_key_format();
  END IF;
END $$;

-- Enable RLS
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verify_rate_limits ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
-- user_roles: users can read their own roles; admins can manage roles
DROP POLICY IF EXISTS "Users can read own roles" ON public.user_roles;
CREATE POLICY "Users can read own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- licenses
DROP POLICY IF EXISTS "Admins manage licenses" ON public.licenses;
CREATE POLICY "Admins manage licenses"
ON public.licenses
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- license_devices
DROP POLICY IF EXISTS "Admins manage license devices" ON public.license_devices;
CREATE POLICY "Admins manage license devices"
ON public.license_devices
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- audit_logs
DROP POLICY IF EXISTS "Admins read audit logs" ON public.audit_logs;
CREATE POLICY "Admins read audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins insert audit logs" ON public.audit_logs;
CREATE POLICY "Admins insert audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- verify_rate_limits: admin only (edge function will use service role)
DROP POLICY IF EXISTS "Admins manage verify rate limits" ON public.verify_rate_limits;
CREATE POLICY "Admins manage verify rate limits"
ON public.verify_rate_limits
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
