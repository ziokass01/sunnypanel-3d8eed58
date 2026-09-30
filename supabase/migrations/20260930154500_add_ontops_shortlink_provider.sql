-- Add first-class Ontops short-link support without changing existing provider behavior.
-- Existing rows that were manually configured as Custom Ontops are upgraded in place;
-- API tokens, enable flags, pass scope, quota settings, and sort order are preserved.

begin;

alter table public.licenses_free_shortlink_providers
  drop constraint if exists licenses_free_shortlink_providers_provider_check;

alter table public.licenses_free_shortlink_providers
  add constraint licenses_free_shortlink_providers_provider_check
  check (provider in ('custom', 'link4m', 'gtraffic', 'ontops', 'traffic68', 'nhapma', 'layma', 'none'));

update public.licenses_free_shortlink_providers
set
  provider = 'ontops',
  name = case
    when nullif(btrim(name), '') is null then 'Ontops'
    else name
  end,
  api_url_template = 'https://api-management.ontops.link/api/public/create-short-link'
where provider = 'custom'
  and nullif(btrim(coalesce(api_token_secret, '')), '') is not null
  and (
    lower(btrim(coalesce(name, ''))) = 'ontops'
    or coalesce(api_url_template, '') ilike '%api-management.ontops.link/%'
  );

comment on constraint licenses_free_shortlink_providers_provider_check
  on public.licenses_free_shortlink_providers is
  'Allowed Free Key short-link providers, including Ontops.';

commit;
