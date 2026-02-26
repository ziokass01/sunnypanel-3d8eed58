-- Fix: prevent authenticated users from enumerating all roles
-- Drop overly permissive policy if present
DROP POLICY IF EXISTS restrict_select_authenticated ON public.user_roles;

-- Also drop quoted variant just in case it was created with quotes
DROP POLICY IF EXISTS "restrict_select_authenticated" ON public.user_roles;

-- Ensure RLS is enabled (safe/idempotent)
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Reload schema cache for API layer
SELECT pg_notify('pgrst','reload schema');
