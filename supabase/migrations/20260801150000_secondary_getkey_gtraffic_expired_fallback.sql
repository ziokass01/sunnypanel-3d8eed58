-- Separate Get Key phụ provider pool + reliable GTraffic expired-code fallback.
-- GTraffic account setting requirement: "Điều hướng khi hết mã" = "Đi tới liên kết gốc".

ALTER TABLE public.licenses_free_shortlink_providers
  ADD COLUMN IF NOT EXISTS secondary_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unavailable_until timestamptz NULL;

ALTER TABLE public.licenses_free_settings
  ADD COLUMN IF NOT EXISTS free_secondary_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS free_secondary_shortlink_mode text NOT NULL DEFAULT 'priority_failover',
  ADD COLUMN IF NOT EXISTS free_secondary_last_provider_id_pass1 uuid NULL,
  ADD COLUMN IF NOT EXISTS free_secondary_last_provider_id_pass2 uuid NULL,
  ADD COLUMN IF NOT EXISTS free_secondary_next_index_pass1 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_secondary_next_index_pass2 integer NOT NULL DEFAULT 0;

ALTER TABLE public.licenses_free_settings
  DROP CONSTRAINT IF EXISTS licenses_free_settings_secondary_shortlink_mode_check;
ALTER TABLE public.licenses_free_settings
  ADD CONSTRAINT licenses_free_settings_secondary_shortlink_mode_check
  CHECK (free_secondary_shortlink_mode IN ('round_robin', 'random', 'priority_failover'));

ALTER TABLE public.licenses_free_sessions
  ADD COLUMN IF NOT EXISTS shortlink_channel text NOT NULL DEFAULT 'primary';
ALTER TABLE public.licenses_free_sessions
  DROP CONSTRAINT IF EXISTS licenses_free_sessions_shortlink_channel_check;
ALTER TABLE public.licenses_free_sessions
  ADD CONSTRAINT licenses_free_sessions_shortlink_channel_check
  CHECK (shortlink_channel IN ('primary', 'secondary'));

ALTER TABLE public.licenses_free_gate_tokens
  ADD COLUMN IF NOT EXISTS shortlink_channel text NOT NULL DEFAULT 'primary';
ALTER TABLE public.licenses_free_gate_tokens
  DROP CONSTRAINT IF EXISTS licenses_free_gate_tokens_shortlink_channel_check;
ALTER TABLE public.licenses_free_gate_tokens
  ADD CONSTRAINT licenses_free_gate_tokens_shortlink_channel_check
  CHECK (shortlink_channel IN ('primary', 'secondary'));

CREATE INDEX IF NOT EXISTS idx_free_shortlink_secondary_order
  ON public.licenses_free_shortlink_providers(secondary_enabled, enabled, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_free_shortlink_unavailable_until
  ON public.licenses_free_shortlink_providers(unavailable_until)
  WHERE unavailable_until IS NOT NULL;

-- The browser bridge does not return GTraffic's real JSON `remaining`, so the
-- old local 1,000-use estimator is intentionally retired.
DROP FUNCTION IF EXISTS public.licenses_reserve_gtraffic_quota(uuid, date, integer);

COMMENT ON COLUMN public.licenses_free_shortlink_providers.secondary_enabled IS
  'When true, this provider is eligible for the gray Get Key phụ button.';
COMMENT ON COLUMN public.licenses_free_shortlink_providers.unavailable_until IS
  'Temporary failover lock; GTraffic early-return expiry is retried after 00:00 Vietnam time.';
COMMENT ON COLUMN public.licenses_free_sessions.shortlink_channel IS
  'Provider pool selected at start: primary or secondary; preserved across VIP Pass2.';
