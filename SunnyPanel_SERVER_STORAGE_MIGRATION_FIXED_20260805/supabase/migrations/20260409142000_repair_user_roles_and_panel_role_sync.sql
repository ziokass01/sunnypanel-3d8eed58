begin;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'app_role'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
  END IF;
END
$$;
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;
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
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE OR REPLACE FUNCTION public.get_my_panel_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN NULL
    WHEN public.has_role(auth.uid(), 'admin'::public.app_role) THEN 'admin'
    WHEN public.has_role(auth.uid(), 'moderator'::public.app_role) THEN 'moderator'
    WHEN public.has_role(auth.uid(), 'user'::public.app_role) THEN 'user'
    ELSE NULL
  END;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_panel_role() TO authenticated;
CREATE OR REPLACE FUNCTION public.sync_panel_role_from_auth_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_role text := lower(coalesce(NEW.raw_app_meta_data ->> 'panel_role', NEW.raw_app_meta_data ->> 'role', ''));
BEGIN
  IF v_role IN ('admin', 'moderator', 'user') THEN
    INSERT INTO public.user_roles(user_id, role)
    VALUES (NEW.id, v_role::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_panel_role_from_auth_metadata ON auth.users;
CREATE TRIGGER trg_sync_panel_role_from_auth_metadata
AFTER INSERT OR UPDATE OF raw_app_meta_data ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_panel_role_from_auth_metadata();
INSERT INTO public.user_roles(user_id, role)
SELECT u.id, lower(coalesce(u.raw_app_meta_data ->> 'panel_role', u.raw_app_meta_data ->> 'role'))::public.app_role
FROM auth.users u
WHERE lower(coalesce(u.raw_app_meta_data ->> 'panel_role', u.raw_app_meta_data ->> 'role', '')) IN ('admin', 'moderator', 'user')
ON CONFLICT (user_id, role) DO NOTHING;
commit;
