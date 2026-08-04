-- Sanity check: create a restrictive deny policy for anon on licenses
DROP POLICY IF EXISTS deny_anon_select ON public.licenses;
CREATE POLICY deny_anon_select ON public.licenses AS RESTRICTIVE FOR SELECT TO anon USING (false);
