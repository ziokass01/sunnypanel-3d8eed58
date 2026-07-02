-- Route Link4M Free Key rows through the official browser Full Page Script.
-- Supabase no longer calls Link4M's API from an Edge IP, so Cloudflare cannot
-- replace the JSON response with a "Just a moment" challenge page.
--
-- This migration is intentionally narrow:
--   * it converts only Link4M rows;
--   * it preserves each row's pass_scope and rotation position;
--   * it does not disable NhapMa, LayMa, Traffic68 or custom providers;
--   * it never creates a direct gate fallback.

begin;

do $$
declare
  v_token text;
  v_updated integer := 0;
begin
  select api_token_secret
    into v_token
  from public.licenses_free_shortlink_providers
  where coalesce(trim(api_token_secret), '') <> ''
    and (
      provider = 'link4m'
      or api_url_template ilike '%link4m.co%'
      or api_url_template ilike '%link4m.com%'
      or note = 'SUNNY_LINK4M_BROWSER_BRIDGE_V2'
    )
  order by enabled desc, updated_at desc, created_at desc
  limit 1;

  if coalesce(trim(v_token), '') = '' then
    raise exception 'LINK4M_TOKEN_MISSING: add a valid Link4M API token before applying this migration';
  end if;

  update public.licenses_free_shortlink_providers
  set name = case
        when coalesce(trim(name), '') = '' then 'Link4M Browser Bridge'
        else name
      end,
      provider = 'traffic68',
      api_token_secret = coalesce(nullif(trim(api_token_secret), ''), v_token),
      api_url_template = 'https://mityangho.id.vn/free/link4m-bridge',
      enabled = true,
      last_error = null,
      fail_count = 0,
      note = 'SUNNY_LINK4M_BROWSER_BRIDGE_V2',
      updated_at = now()
  where provider = 'link4m'
     or api_url_template ilike '%link4m.co%'
     or api_url_template ilike '%link4m.com%'
     or note = 'SUNNY_LINK4M_BROWSER_BRIDGE_V2';

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    insert into public.licenses_free_shortlink_providers (
      name, provider, api_token_secret, api_url_template, enabled,
      pass_scope, sort_order, last_error, fail_count, note
    ) values (
      'Link4M Browser Bridge', 'traffic68', v_token,
      'https://mityangho.id.vn/free/link4m-bridge', true,
      'both', 1, null, 0, 'SUNNY_LINK4M_BROWSER_BRIDGE_V2'
    );
  end if;

  update public.licenses_free_settings
  set free_shortlink_next_index_pass1 = 0,
      free_shortlink_next_index_pass2 = 0
  where id = 1;
end $$;

commit;
