-- Free key type selection controls and per-app FREE quota
ALTER TABLE public.licenses_free_key_types
  ADD COLUMN IF NOT EXISTS free_selection_mode text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS free_selection_expand boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_package_code text,
  ADD COLUMN IF NOT EXISTS default_credit_code text,
  ADD COLUMN IF NOT EXISTS default_wallet_kind text;

ALTER TABLE public.server_app_settings
  ADD COLUMN IF NOT EXISTS free_daily_limit_per_fingerprint integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_daily_limit_per_ip integer NOT NULL DEFAULT 0;

UPDATE public.licenses_free_key_types
SET
  free_selection_mode = CASE
    WHEN code IN ('fdh1','fdd1','fd_package') THEN 'package'
    WHEN code IN ('fd_credit') THEN 'credit'
    ELSE COALESCE(free_selection_mode, 'none')
  END,
  free_selection_expand = COALESCE(free_selection_expand, false),
  default_package_code = CASE
    WHEN code IN ('fdh1','fdd1','fd_package') AND COALESCE(default_package_code, '') = '' THEN 'classic'
    WHEN code = 'fdd7' AND COALESCE(default_package_code, '') = '' THEN 'go'
    WHEN code = 'fdd30' AND COALESCE(default_package_code, '') = '' THEN 'plus'
    ELSE default_package_code
  END,
  default_credit_code = CASE
    WHEN code = 'fd_credit' AND COALESCE(default_credit_code, '') = '' THEN 'credit-normal'
    ELSE default_credit_code
  END,
  default_wallet_kind = CASE
    WHEN code = 'fd_credit' AND COALESCE(default_wallet_kind, '') = '' THEN 'normal'
    ELSE default_wallet_kind
  END
WHERE app_code = 'find-dumps';
