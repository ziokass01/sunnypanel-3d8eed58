-- Security fix: browser quick-link bridges expose the unique /free/gate token
-- inside outbound_url and let callers skip the advertising flow.
--
-- Move Link4M rows back to the server-side shortening endpoint. Runtime code
-- accepts only opaque provider responses and fails over/closed when a provider
-- returns a URL containing the gate destination.

update public.licenses_free_shortlink_providers
set
  provider = 'link4m',
  api_url_template = 'https://link4m.co/api-shorten/v2',
  name = case
    when lower(coalesce(name, '')) like '%browser bridge%' then 'Link4M'
    else name
  end,
  last_error = null,
  unavailable_until = null
where
  lower(coalesce(api_url_template, '')) like '%/free/link4m-bridge%'
  or (
    lower(coalesce(api_url_template, '')) like '%link4m.co/st%'
    or lower(coalesce(api_url_template, '')) like '%link4m.com/st%'
  );

comment on column public.licenses_free_shortlink_providers.api_url_template is
  'Shortener API/template. FREE runtime rejects browser bridge URLs that expose the unique gate destination.';
