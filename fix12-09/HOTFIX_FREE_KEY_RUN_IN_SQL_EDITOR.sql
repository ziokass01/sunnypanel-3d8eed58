-- HOTFIX FREE KEY PROVIDER/GATE TOKEN
-- Chạy file này trong Supabase Dashboard > SQL Editor nếu `supabase db push` đang fail.
-- Phạm vi: chỉ Free Key web flow. Không đụng verify-key/rent verify-key.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.licenses_free_settings (
  id integer PRIMARY KEY,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL
);

ALTER TABLE public.licenses_free_settings
  ADD COLUMN IF NOT EXISTS free_outbound_url text NULL,
  ADD COLUMN IF NOT EXISTS free_outbound_url_pass2 text NULL,
  ADD COLUMN IF NOT EXISTS free_shortlink_mode text DEFAULT 'round_robin',
  ADD COLUMN IF NOT EXISTS free_shortlink_last_provider_id_pass1 uuid NULL,
  ADD COLUMN IF NOT EXISTS free_shortlink_last_provider_id_pass2 uuid NULL,
  ADD COLUMN IF NOT EXISTS free_shortlink_next_index_pass1 integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_shortlink_next_index_pass2 integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_gate_token_life_seconds integer DEFAULT 600,
  ADD COLUMN IF NOT EXISTS free_session_absolute_seconds integer DEFAULT 900,
  ADD COLUMN IF NOT EXISTS free_claim_window_seconds integer DEFAULT 180;

INSERT INTO public.licenses_free_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

UPDATE public.licenses_free_settings
SET
  free_shortlink_mode = CASE WHEN free_shortlink_mode IN ('round_robin', 'random') THEN free_shortlink_mode ELSE 'round_robin' END,
  free_shortlink_next_index_pass1 = GREATEST(0, COALESCE(free_shortlink_next_index_pass1, 0)),
  free_shortlink_next_index_pass2 = GREATEST(0, COALESCE(free_shortlink_next_index_pass2, 0)),
  free_gate_token_life_seconds = GREATEST(60, LEAST(COALESCE(free_gate_token_life_seconds, 600), 1800)),
  free_session_absolute_seconds = GREATEST(COALESCE(free_session_absolute_seconds, 900), 900),
  free_claim_window_seconds = GREATEST(60, LEAST(COALESCE(free_claim_window_seconds, 180), 600));

ALTER TABLE public.licenses_free_settings
  DROP CONSTRAINT IF EXISTS licenses_free_settings_free_shortlink_mode_check;
ALTER TABLE public.licenses_free_settings
  ADD CONSTRAINT licenses_free_settings_free_shortlink_mode_check
  CHECK (free_shortlink_mode IS NULL OR free_shortlink_mode IN ('round_robin', 'random'));

CREATE TABLE IF NOT EXISTS public.licenses_free_shortlink_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL DEFAULT 'Link4M',
  provider text NOT NULL DEFAULT 'link4m',
  api_token_secret text NULL,
  api_url_template text NULL,
  enabled boolean NOT NULL DEFAULT true,
  pass_scope text NOT NULL DEFAULT 'both',
  sort_order integer NOT NULL DEFAULT 100,
  last_used_at timestamptz NULL,
  last_error text NULL,
  fail_count integer NOT NULL DEFAULT 0,
  note text NULL
);

ALTER TABLE public.licenses_free_shortlink_providers
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'Link4M',
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'link4m',
  ADD COLUMN IF NOT EXISTS api_token_secret text NULL,
  ADD COLUMN IF NOT EXISTS api_url_template text NULL,
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pass_scope text NOT NULL DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_error text NULL,
  ADD COLUMN IF NOT EXISTS fail_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS note text NULL;

UPDATE public.licenses_free_shortlink_providers
SET
  provider = CASE WHEN provider IN ('custom', 'link4m', 'traffic68', 'nhapma', 'layma', 'none') THEN provider ELSE 'custom' END,
  pass_scope = CASE WHEN pass_scope IN ('both', 'pass1', 'pass2') THEN pass_scope ELSE 'both' END,
  sort_order = GREATEST(0, COALESCE(sort_order, 100)),
  enabled = COALESCE(enabled, true),
  name = COALESCE(NULLIF(trim(name), ''), 'Link4M');

-- Tách dữ liệu cũ dạng https://link4m.co/st?api=TOKEN&url={GATE_URL_ENC}
-- thành 2 ô mới: API base + Token.
UPDATE public.licenses_free_shortlink_providers
SET
  api_token_secret = COALESCE(NULLIF(trim(api_token_secret), ''), substring(api_url_template from '[?&](?:api|token|tokenUser)=([^&]+)')),
  api_url_template = split_part(api_url_template, '?', 1),
  provider = CASE
    WHEN api_url_template ILIKE '%link4m.co%' THEN 'link4m'
    WHEN api_url_template ILIKE '%traffic68%' THEN 'traffic68'
    ELSE provider
  END
WHERE COALESCE(trim(api_url_template), '') <> ''
  AND api_url_template ~* '[?&](api|token|tokenUser)='
  AND api_url_template ~* '[?&](url|u|link|target)=';

-- Xóa các dòng provider hỏng thiếu API hoặc Token để UI không còn báo "Dòng 1: thiếu ô Token".
DELETE FROM public.licenses_free_shortlink_providers
WHERE provider <> 'none'
  AND (COALESCE(trim(api_url_template), '') = '' OR COALESCE(trim(api_token_secret), '') = '');

ALTER TABLE public.licenses_free_shortlink_providers
  DROP CONSTRAINT IF EXISTS licenses_free_shortlink_providers_pass_scope_check;
ALTER TABLE public.licenses_free_shortlink_providers
  ADD CONSTRAINT licenses_free_shortlink_providers_pass_scope_check
  CHECK (pass_scope IN ('both', 'pass1', 'pass2'));

ALTER TABLE public.licenses_free_shortlink_providers
  DROP CONSTRAINT IF EXISTS licenses_free_shortlink_providers_provider_check;
ALTER TABLE public.licenses_free_shortlink_providers
  ADD CONSTRAINT licenses_free_shortlink_providers_provider_check
  CHECK (provider IN ('custom', 'link4m', 'traffic68', 'nhapma', 'layma', 'none'));

CREATE INDEX IF NOT EXISTS idx_lfsp_enabled_scope_order
  ON public.licenses_free_shortlink_providers(enabled, pass_scope, sort_order, created_at);

DROP TRIGGER IF EXISTS trg_licenses_free_shortlink_providers_updated_at ON public.licenses_free_shortlink_providers;
CREATE TRIGGER trg_licenses_free_shortlink_providers_updated_at
BEFORE UPDATE ON public.licenses_free_shortlink_providers
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.licenses_free_shortlink_providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON public.licenses_free_shortlink_providers;
CREATE POLICY service_role_all
ON public.licenses_free_shortlink_providers
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.licenses_free_gate_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  pass_no integer NOT NULL DEFAULT 1,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  activate_after_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  burned_at timestamptz NULL,
  provider_id uuid NULL,
  short_url text NULL,
  ip_hash text NULL,
  ua_hash text NULL,
  fingerprint_hash text NULL,
  fail_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.licenses_free_gate_tokens
  ADD COLUMN IF NOT EXISTS pass_no integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS token_hash text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS activate_after_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS used_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS burned_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS provider_id uuid NULL,
  ADD COLUMN IF NOT EXISTS short_url text NULL,
  ADD COLUMN IF NOT EXISTS ip_hash text NULL,
  ADD COLUMN IF NOT EXISTS ua_hash text NULL,
  ADD COLUMN IF NOT EXISTS fingerprint_hash text NULL,
  ADD COLUMN IF NOT EXISTS fail_reason text NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.licenses_free_gate_tokens
  DROP CONSTRAINT IF EXISTS licenses_free_gate_tokens_status_check;
ALTER TABLE public.licenses_free_gate_tokens
  ADD CONSTRAINT licenses_free_gate_tokens_status_check
  CHECK (status IN ('pending', 'burned_early', 'gate_ok', 'expired', 'used', 'closed'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.licenses_free_gate_tokens'::regclass
      AND conname = 'licenses_free_gate_tokens_token_hash_key'
  ) THEN
    ALTER TABLE public.licenses_free_gate_tokens
      ADD CONSTRAINT licenses_free_gate_tokens_token_hash_key UNIQUE (token_hash);
  END IF;

  IF to_regclass('public.licenses_free_sessions') IS NOT NULL THEN
    ALTER TABLE public.licenses_free_sessions
      ADD COLUMN IF NOT EXISTS gate_flow_version text NULL,
      ADD COLUMN IF NOT EXISTS gate_token_life_seconds integer NULL,
      ADD COLUMN IF NOT EXISTS provider_id_pass1 uuid NULL,
      ADD COLUMN IF NOT EXISTS provider_id_pass2 uuid NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lfgt_session_pass ON public.licenses_free_gate_tokens(session_id, pass_no, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lfgt_status_expires ON public.licenses_free_gate_tokens(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_lfgt_provider ON public.licenses_free_gate_tokens(provider_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_licenses_free_gate_tokens_updated_at ON public.licenses_free_gate_tokens;
CREATE TRIGGER trg_licenses_free_gate_tokens_updated_at
BEFORE UPDATE ON public.licenses_free_gate_tokens
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.licenses_free_gate_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON public.licenses_free_gate_tokens;
CREATE POLICY service_role_all
ON public.licenses_free_gate_tokens
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.licenses_free_shortlink_providers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.licenses_free_gate_tokens TO service_role;

-- Reload PostgREST schema cache để hết lỗi "could not find table in schema cache".
NOTIFY pgrst, 'reload schema';
SELECT pg_notification_queue_usage();
