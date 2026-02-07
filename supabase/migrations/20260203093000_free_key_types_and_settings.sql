-- Add Free Key key-types (1..24 hours, 1..30 days) + settings fields + token-based session fields
-- Add-only / backward-compatible (keeps existing cookies flow tables, but new flow uses out_token/claim_token)

-- 1) Key types
CREATE TABLE IF NOT EXISTS public.licenses_free_key_types (
  code text PRIMARY KEY,
  label text NOT NULL,
  duration_seconds integer NOT NULL CHECK (duration_seconds > 0),
  kind text NOT NULL CHECK (kind IN ('hour','day')),
  value integer NOT NULL CHECK (value > 0),
  sort_order integer NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lfkt_enabled ON public.licenses_free_key_types (enabled);
CREATE INDEX IF NOT EXISTS idx_lfkt_sort ON public.licenses_free_key_types (sort_order);

ALTER TABLE public.licenses_free_key_types ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='licenses_free_key_types' AND policyname='Admins manage free key types'
  ) THEN
    CREATE POLICY "Admins manage free key types"
    ON public.licenses_free_key_types
    FOR ALL
    USING (public.has_role(auth.uid(), 'admin'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END $$;

-- Keep updated_at fresh
DROP TRIGGER IF EXISTS trg_licenses_free_key_types_updated_at ON public.licenses_free_key_types;
CREATE TRIGGER trg_licenses_free_key_types_updated_at
BEFORE UPDATE ON public.licenses_free_key_types
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Seed hours 1..24 (code h01..h24) and days 1..30 (d01..d30). Default enable: h01 + d01.
DO $$
DECLARE
  i int;
  v_code text;
  lbl text;
BEGIN
  FOR i IN 1..24 LOOP
    v_code := 'h' || lpad(i::text, 2, '0');
    lbl := i::text || ' giờ';
    INSERT INTO public.licenses_free_key_types(code,label,duration_seconds,kind,value,sort_order,enabled)
    VALUES (v_code, lbl, i*3600, 'hour', i, i, (i=1))
    ON CONFLICT (code) DO NOTHING;
  END LOOP;

  FOR i IN 1..30 LOOP
    code := 'd' || lpad(i::text, 2, '0');
    lbl := i::text || ' ngày';
    INSERT INTO public.licenses_free_key_types(code,label,duration_seconds,kind,value,sort_order,enabled)
    VALUES (v_code, lbl, i*86400, 'day', i, 100 + i, (i=1))
    ON CONFLICT (code) DO NOTHING;
  END LOOP;
END $$;

-- 2) Settings fields (single row id=1)
ALTER TABLE public.licenses_free_settings
  ADD COLUMN IF NOT EXISTS free_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS free_disabled_message text NOT NULL DEFAULT 'Trang GetKey đang tạm đóng.',
  ADD COLUMN IF NOT EXISTS free_min_delay_seconds integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS free_return_seconds integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS free_daily_limit_per_fingerprint integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS free_require_link4m_referrer boolean NOT NULL DEFAULT false;

-- Ensure row exists
INSERT INTO public.licenses_free_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- 3) Session fields for token-based flow
ALTER TABLE public.licenses_free_sessions
  ADD COLUMN IF NOT EXISTS out_token_hash text NULL,
  ADD COLUMN IF NOT EXISTS out_expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS started_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS gate_ok_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS revealed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS key_type_code text NULL,
  ADD COLUMN IF NOT EXISTS duration_seconds integer NULL;

CREATE INDEX IF NOT EXISTS idx_lfs_out_token_hash ON public.licenses_free_sessions (out_token_hash);
CREATE INDEX IF NOT EXISTS idx_lfs_claim_token_hash ON public.licenses_free_sessions (claim_token_hash);
