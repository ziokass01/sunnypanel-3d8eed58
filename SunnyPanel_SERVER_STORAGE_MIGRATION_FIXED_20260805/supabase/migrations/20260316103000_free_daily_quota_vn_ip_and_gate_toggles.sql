-- Additive safety controls for FREE quota and gate matching
ALTER TABLE public.licenses_free_settings
  ADD COLUMN IF NOT EXISTS free_daily_limit_per_ip integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_gate_require_ip_match boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS free_gate_require_ua_match boolean NOT NULL DEFAULT true;

UPDATE public.licenses_free_settings
SET
  free_daily_limit_per_ip = COALESCE(free_daily_limit_per_ip, 0),
  free_gate_require_ip_match = COALESCE(free_gate_require_ip_match, true),
  free_gate_require_ua_match = COALESCE(free_gate_require_ua_match, true)
WHERE id = 1;
