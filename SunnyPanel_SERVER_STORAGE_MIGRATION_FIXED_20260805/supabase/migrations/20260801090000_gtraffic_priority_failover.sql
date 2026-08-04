-- Add GTraffic JSON shortlink support and daily quota state.
-- Quota dates are written by Edge Functions using Asia/Ho_Chi_Minh.

ALTER TABLE public.licenses_free_shortlink_providers
  ADD COLUMN IF NOT EXISTS quota_remaining integer NULL,
  ADD COLUMN IF NOT EXISTS quota_date date NULL;

ALTER TABLE public.licenses_free_shortlink_providers
  DROP CONSTRAINT IF EXISTS licenses_free_shortlink_providers_quota_remaining_check;
ALTER TABLE public.licenses_free_shortlink_providers
  ADD CONSTRAINT licenses_free_shortlink_providers_quota_remaining_check
  CHECK (quota_remaining IS NULL OR quota_remaining >= 0);

ALTER TABLE public.licenses_free_shortlink_providers
  DROP CONSTRAINT IF EXISTS licenses_free_shortlink_providers_provider_check;
ALTER TABLE public.licenses_free_shortlink_providers
  ADD CONSTRAINT licenses_free_shortlink_providers_provider_check
  CHECK (provider IN ('custom', 'link4m', 'gtraffic', 'traffic68', 'nhapma', 'layma', 'none'));

ALTER TABLE public.licenses_free_settings
  DROP CONSTRAINT IF EXISTS licenses_free_settings_free_shortlink_mode_check;
ALTER TABLE public.licenses_free_settings
  ADD CONSTRAINT licenses_free_settings_free_shortlink_mode_check
  CHECK (free_shortlink_mode IS NULL OR free_shortlink_mode IN ('round_robin', 'random', 'priority_failover'));

-- This release is specifically for ordered quota failover. Existing provider
-- rows keep their current sort_order; the first enabled row remains primary.
UPDATE public.licenses_free_settings
SET free_shortlink_mode = 'priority_failover'
WHERE id = 1;

COMMENT ON COLUMN public.licenses_free_shortlink_providers.quota_remaining IS
  'Last remaining daily quota reported by a provider such as GTraffic.';
COMMENT ON COLUMN public.licenses_free_shortlink_providers.quota_date IS
  'Asia/Ho_Chi_Minh date associated with quota_remaining.';
