-- Normalize legacy Link4M API bases saved without the documented /v2 suffix.
-- Scope: Free Key shortlink provider configuration only.
-- No token, session, license, verify-key, or rent data is changed.

UPDATE public.licenses_free_shortlink_providers
SET
  api_url_template = regexp_replace(
    regexp_replace(trim(api_url_template), '/api-shorten/+$', '/api-shorten/v2', 'i'),
    '/api-shorten$', '/api-shorten/v2', 'i'
  ),
  updated_at = now()
WHERE lower(coalesce(provider, '')) = 'link4m'
  AND trim(coalesce(api_url_template, '')) ~* '^https?://[^/]*link4m\.(co|com)/api-shorten/?$';

UPDATE public.licenses_free_shortlink_providers
SET
  api_url_template = regexp_replace(trim(api_url_template), '/api-shorten/v2/+$', '/api-shorten/v2', 'i'),
  updated_at = now()
WHERE lower(coalesce(provider, '')) = 'link4m'
  AND trim(coalesce(api_url_template, '')) ~* '^https?://[^/]*link4m\.(co|com)/api-shorten/v2/+$';

NOTIFY pgrst, 'reload schema';
