-- Anti-replay nonce store
CREATE TABLE IF NOT EXISTS public.request_nonces (
  nonce TEXT PRIMARY KEY,
  ts BIGINT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.request_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_nonces FORCE ROW LEVEL SECURITY;

-- Enumeration / security alerts
CREATE TABLE IF NOT EXISTS public.security_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  ip TEXT NOT NULL,
  key_prefix TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_alerts FORCE ROW LEVEL SECURITY;

-- Admin visibility for alerts
DROP POLICY IF EXISTS "Admins read security alerts" ON public.security_alerts;
CREATE POLICY "Admins read security alerts"
ON public.security_alerts
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins insert security alerts" ON public.security_alerts;
CREATE POLICY "Admins insert security alerts"
ON public.security_alerts
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Metrics helper used by verify-key to decide when to alert
CREATE OR REPLACE FUNCTION public.security_metrics_for_ip(p_ip TEXT)
RETURNS TABLE (failure_5m INTEGER, distinct_keys_10m INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH failures AS (
    SELECT count(*)::int AS c
    FROM public.audit_logs
    WHERE action = 'VERIFY'
      AND created_at >= now() - interval '5 minutes'
      AND coalesce((detail->>'ip')::text, '') = coalesce(p_ip, '')
      AND coalesce((detail->>'ok')::text, '') = 'false'
  ),
  distinct_keys AS (
    SELECT count(distinct license_key)::int AS c
    FROM public.audit_logs
    WHERE action = 'VERIFY'
      AND created_at >= now() - interval '10 minutes'
      AND coalesce((detail->>'ip')::text, '') = coalesce(p_ip, '')
  )
  SELECT (SELECT c FROM failures), (SELECT c FROM distinct_keys);
$$;