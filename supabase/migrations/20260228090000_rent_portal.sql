-- Rent portal (tenant) + HMAC-bound keys

-- 1) Add new role value (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role'
      AND e.enumlabel = 'tenant'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'tenant';
  END IF;
END $$;

-- 2) Tenants
CREATE TABLE IF NOT EXISTS public.rent_tenants (
  tenant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  subscription_expires_at TIMESTAMPTZ NULL,
  secret_salt UUID NOT NULL DEFAULT gen_random_uuid(),
  secret_version INT NOT NULL DEFAULT 1,
  rotate_count INT NOT NULL DEFAULT 0,
  note TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_rent_tenants_auth_user_id ON public.rent_tenants (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_rent_tenants_subscription_expires_at ON public.rent_tenants (subscription_expires_at);

ALTER TABLE public.rent_tenants ENABLE ROW LEVEL SECURITY;

-- 3) Activation codes (admin issues, tenant redeems)
CREATE TABLE IF NOT EXISTS public.rent_activation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.rent_tenants(tenant_id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  code_last4 TEXT NOT NULL,
  duration_seconds INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ NULL,
  used_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_rent_activation_codes_tenant_id ON public.rent_activation_codes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_rent_activation_codes_used_at ON public.rent_activation_codes (used_at);

ALTER TABLE public.rent_activation_codes ENABLE ROW LEVEL SECURITY;

-- 3b) Password reset codes (admin issues, one-time)
CREATE TABLE IF NOT EXISTS public.rent_password_reset_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.rent_tenants(tenant_id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  code_last4 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ NULL,
  used_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_rent_password_reset_codes_tenant_id ON public.rent_password_reset_codes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_rent_password_reset_codes_used_at ON public.rent_password_reset_codes (used_at);

ALTER TABLE public.rent_password_reset_codes ENABLE ROW LEVEL SECURITY;

-- 4) Tenant-issued license keys
CREATE TABLE IF NOT EXISTS public.rent_license_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.rent_tenants(tenant_id) ON DELETE CASCADE,
  key_id BIGINT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  expires_unix INT NOT NULL,
  max_devices INT NOT NULL DEFAULT 1,
  key_last4 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ NULL,
  note TEXT NULL,
  UNIQUE (tenant_id, key_id)
);

CREATE INDEX IF NOT EXISTS idx_rent_license_keys_tenant_id ON public.rent_license_keys (tenant_id);
CREATE INDEX IF NOT EXISTS idx_rent_license_keys_expires_at ON public.rent_license_keys (expires_at);
CREATE INDEX IF NOT EXISTS idx_rent_license_keys_revoked_at ON public.rent_license_keys (revoked_at);

ALTER TABLE public.rent_license_keys ENABLE ROW LEVEL SECURITY;

-- 5) Devices per rent license key
CREATE TABLE IF NOT EXISTS public.rent_license_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.rent_tenants(tenant_id) ON DELETE CASCADE,
  key_id BIGINT NOT NULL,
  device_id TEXT NOT NULL,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_rent_license_devices_tenant_key ON public.rent_license_devices (tenant_id, key_id);

ALTER TABLE public.rent_license_devices ENABLE ROW LEVEL SECURITY;

-- 6) RLS policies
-- Tenants: admins can do everything; tenants can read their own tenant row.
DROP POLICY IF EXISTS "rent_tenants_admin_all" ON public.rent_tenants;
CREATE POLICY "rent_tenants_admin_all"
ON public.rent_tenants
AS RESTRICTIVE
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "rent_tenants_self_select" ON public.rent_tenants;
CREATE POLICY "rent_tenants_self_select"
ON public.rent_tenants
AS RESTRICTIVE
FOR SELECT
USING (auth.uid() = auth_user_id);

-- Activation codes: admin only
DROP POLICY IF EXISTS "rent_activation_codes_admin_all" ON public.rent_activation_codes;
CREATE POLICY "rent_activation_codes_admin_all"
ON public.rent_activation_codes
AS RESTRICTIVE
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Password reset codes: admin only
DROP POLICY IF EXISTS "rent_password_reset_codes_admin_all" ON public.rent_password_reset_codes;
CREATE POLICY "rent_password_reset_codes_admin_all"
ON public.rent_password_reset_codes
AS RESTRICTIVE
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- License keys: admin full; tenant can view and manage their own keys
DROP POLICY IF EXISTS "rent_license_keys_admin_all" ON public.rent_license_keys;
CREATE POLICY "rent_license_keys_admin_all"
ON public.rent_license_keys
AS RESTRICTIVE
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "rent_license_keys_tenant_own" ON public.rent_license_keys;
CREATE POLICY "rent_license_keys_tenant_own"
ON public.rent_license_keys
AS RESTRICTIVE
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.rent_tenants t
    WHERE t.tenant_id = rent_license_keys.tenant_id
      AND t.auth_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "rent_license_keys_tenant_update_revoke" ON public.rent_license_keys;
CREATE POLICY "rent_license_keys_tenant_update_revoke"
ON public.rent_license_keys
AS RESTRICTIVE
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.rent_tenants t
    WHERE t.tenant_id = rent_license_keys.tenant_id
      AND t.auth_user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.rent_tenants t
    WHERE t.tenant_id = rent_license_keys.tenant_id
      AND t.auth_user_id = auth.uid()
  )
);

-- Devices: admin full; tenant can read their own
DROP POLICY IF EXISTS "rent_license_devices_admin_all" ON public.rent_license_devices;
CREATE POLICY "rent_license_devices_admin_all"
ON public.rent_license_devices
AS RESTRICTIVE
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "rent_license_devices_tenant_select" ON public.rent_license_devices;
CREATE POLICY "rent_license_devices_tenant_select"
ON public.rent_license_devices
AS RESTRICTIVE
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.rent_tenants t
    WHERE t.tenant_id = rent_license_devices.tenant_id
      AND t.auth_user_id = auth.uid()
  )
);
