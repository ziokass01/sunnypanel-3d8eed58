-- Satisfy linter: add explicit deny-all policy for request_nonces
DROP POLICY IF EXISTS "No access to request nonces" ON public.request_nonces;
CREATE POLICY "No access to request nonces"
ON public.request_nonces
FOR ALL
USING (false)
WITH CHECK (false);