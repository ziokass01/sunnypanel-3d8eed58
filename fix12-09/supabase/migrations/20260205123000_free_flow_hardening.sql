-- Harden free-key flow against bypass/replay and add admin moderation tools

ALTER TABLE public.licenses_free_sessions
  ADD COLUMN IF NOT EXISTS claim_token_plain text NULL;

CREATE TABLE IF NOT EXISTS public.licenses_free_blocklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  enabled boolean NOT NULL DEFAULT true,
  reason text NULL,
  fingerprint_hash text NULL,
  ip_hash text NULL,
  created_by uuid NULL,
  CONSTRAINT ck_lfb_target CHECK (fingerprint_hash IS NOT NULL OR ip_hash IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_lfb_fp ON public.licenses_free_blocklist (fingerprint_hash) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_lfb_ip ON public.licenses_free_blocklist (ip_hash) WHERE enabled = true;

ALTER TABLE public.licenses_free_blocklist ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='licenses_free_blocklist' AND policyname='Admins manage free blocklist'
  ) THEN
    CREATE POLICY "Admins manage free blocklist"
    ON public.licenses_free_blocklist
    FOR ALL
    USING (public.has_role(auth.uid(), 'admin'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END $$;
