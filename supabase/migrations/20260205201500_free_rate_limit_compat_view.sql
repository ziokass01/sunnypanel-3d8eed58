-- Compatibility objects for operators/runbooks expecting free_ip_rate_limits naming

DROP TABLE IF EXISTS public.free_ip_rate_limits CASCADE;

CREATE VIEW public.free_ip_rate_limits AS

SELECT
  ip_hash,
  window_start,
  count,
  updated_at
FROM public.licenses_free_rate_limits;

GRANT SELECT ON public.free_ip_rate_limits TO anon, authenticated, service_role;
