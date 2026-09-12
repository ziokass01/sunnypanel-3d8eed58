-- Harden RLS enforcement by forcing RLS even for table owners
-- This helps prevent privilege-based bypasses and aligns with least-privilege defaults.

ALTER TABLE public.licenses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.license_devices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.verify_rate_limits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;