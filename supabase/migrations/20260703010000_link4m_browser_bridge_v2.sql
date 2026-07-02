-- Route Free Key shortlinks through Link4M's official browser Full Page Script.
-- Supabase no longer calls Link4M's API from a server IP, so Cloudflare cannot
-- replace the JSON response with a challenge page. The external Link4M step
-- remains mandatory; this migration does not enable a direct gate fallback.

begin;

do $$
declare
  v_token text;
  v_bridge_id uuid;
begin
  select api_token_secret
    into v_token
  from public.licenses_free_shortlink_providers
  where coalesce(trim(api_token_secret), '') <> ''
    and (
      provider = 'link4m'
      or api_url_template ilike '%link4m.co%'
      or api_url_template ilike '%link4m.com%'
    )
  order by enabled desc, updated_at desc, created_at desc
  limit 1;

  if coalesce(trim(v_token), '') = '' then
    raise exception 'LINK4M_TOKEN_MISSING: add a valid Link4M API token before applying this migration';
  end if;

  -- Keep old rows for audit/recovery, but prevent round-robin from selecting
  -- the server-side Link4M API rows that are currently receiving Cloudflare HTML.
  update public.licenses_free_shortlink_providers
  set enabled = false,
      last_error = null,
      updated_at = now();

  select id into v_bridge_id
  from public.licenses_free_shortlink_providers
  where note = 'SUNNY_LINK4M_BROWSER_BRIDGE_V2'
  order by updated_at desc
  limit 1;

  if v_bridge_id is null then
    insert into public.licenses_free_shortlink_providers (
      name, provider, api_token_secret, api_url_template, enabled,
      pass_scope, sort_order, last_error, fail_count, note
    ) values (
      'Link4M Browser Bridge', 'traffic68', v_token,
      'https://mityangho.id.vn/free/link4m-bridge', true,
      'both', 1, null, 0, 'SUNNY_LINK4M_BROWSER_BRIDGE_V2'
    );
  else
    update public.licenses_free_shortlink_providers
    set name = 'Link4M Browser Bridge',
        provider = 'traffic68',
        api_token_secret = v_token,
        api_url_template = 'https://mityangho.id.vn/free/link4m-bridge',
        enabled = true,
        pass_scope = 'both',
        sort_order = 1,
        last_error = null,
        fail_count = 0,
        note = 'SUNNY_LINK4M_BROWSER_BRIDGE_V2',
        updated_at = now()
    where id = v_bridge_id;
  end if;
end $$;

commit;
