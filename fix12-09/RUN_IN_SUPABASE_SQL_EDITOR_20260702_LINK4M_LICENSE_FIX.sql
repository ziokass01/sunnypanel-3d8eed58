-- Runtime repair for the two remaining Free Key failures:
--   1) LICENSE_INSERT_FAILED on Admin Test / real reveal across mixed licenses schemas.
--   2) Raw Cloudflare challenge HTML stored as Link4M provider last_error.
--
-- Safe scope:
--   - additive/default repair on public.licenses
--   - one service-role-only insert RPC
--   - Link4M provider endpoint/error cleanup
--   - no changes to user auth, wallets, rent, AI or paid-key logic

begin;

alter table public.licenses
  add column if not exists app_code text default 'free-fire',
  add column if not exists max_ips integer default 1,
  add column if not exists max_verify integer default 1,
  add column if not exists verify_count integer default 0,
  add column if not exists start_on_first_use boolean default false,
  add column if not exists starts_on_first_use boolean default false,
  add column if not exists duration_seconds integer,
  add column if not exists duration_days integer,
  add column if not exists first_used_at timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists public_reset_disabled boolean default false,
  add column if not exists deleted_at timestamptz;

update public.licenses
set
  app_code = coalesce(nullif(trim(app_code), ''), case when upper(key) like 'FAKELAG-%' then 'fake-lag' else 'free-fire' end),
  max_devices = greatest(1, coalesce(max_devices, 1)),
  max_ips = greatest(1, coalesce(max_ips, 1)),
  max_verify = greatest(1, coalesce(max_verify, max_devices, 1)),
  verify_count = greatest(0, coalesce(verify_count, 0)),
  start_on_first_use = coalesce(start_on_first_use, false),
  starts_on_first_use = coalesce(starts_on_first_use, false),
  public_reset_disabled = coalesce(public_reset_disabled, false)
where
  app_code is null or trim(app_code) = ''
  or max_devices is null or max_devices < 1
  or max_ips is null or max_ips < 1
  or max_verify is null or max_verify < 1
  or verify_count is null or verify_count < 0
  or start_on_first_use is null
  or starts_on_first_use is null
  or public_reset_disabled is null;

alter table public.licenses
  alter column app_code set default 'free-fire',
  alter column app_code set not null,
  alter column max_devices set default 1,
  alter column max_devices set not null,
  alter column max_ips set default 1,
  alter column max_ips set not null,
  alter column max_verify set default 1,
  alter column max_verify set not null,
  alter column verify_count set default 0,
  alter column verify_count set not null,
  alter column start_on_first_use set default false,
  alter column start_on_first_use set not null,
  alter column starts_on_first_use set default false,
  alter column starts_on_first_use set not null,
  alter column public_reset_disabled set default false,
  alter column public_reset_disabled set not null;

-- Keep the existing database-side format guard authoritative, while allowing
-- both license families that legitimately live in public.licenses.
create or replace function public.validate_license_key_format()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.key is null or upper(new.key) !~ '^(SUNNY|FAKELAG)-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$' then
    raise exception 'Invalid license key format. Expected SUNNY/FAKELAG-XXXX-XXXX-XXXX (A-Z0-9)';
  end if;
  new.key := upper(new.key);
  return new;
end;
$$;

-- Insert fixed-expiry free licenses from inside Postgres. This avoids failures
-- caused by stale PostgREST schema metadata after the table gained columns over
-- multiple releases. The normal validation/default triggers still run.
create or replace function public.insert_free_license_compat(
  p_key text,
  p_app_code text,
  p_expires_at timestamptz,
  p_note text,
  p_max_devices integer,
  p_max_ips integer,
  p_max_verify integer
)
returns table(id uuid, key text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  insert into public.licenses as l (
    key,
    app_code,
    expires_at,
    max_devices,
    max_ips,
    max_verify,
    verify_count,
    is_active,
    note,
    start_on_first_use,
    starts_on_first_use,
    duration_seconds,
    duration_days,
    first_used_at,
    activated_at,
    public_reset_disabled,
    deleted_at
  ) values (
    upper(trim(p_key)),
    coalesce(nullif(lower(trim(p_app_code)), ''), 'free-fire'),
    p_expires_at,
    greatest(1, coalesce(p_max_devices, 1)),
    greatest(1, coalesce(p_max_ips, 1)),
    greatest(1, coalesce(p_max_verify, 1)),
    0,
    true,
    nullif(p_note, ''),
    false,
    false,
    null,
    null,
    null,
    null,
    false,
    null
  )
  returning l.id, l.key;
end;
$$;

revoke all on function public.insert_free_license_compat(text,text,timestamptz,text,integer,integer,integer) from public;
revoke all on function public.insert_free_license_compat(text,text,timestamptz,text,integer,integer,integer) from anon;
revoke all on function public.insert_free_license_compat(text,text,timestamptz,text,integer,integer,integer) from authenticated;
grant execute on function public.insert_free_license_compat(text,text,timestamptz,text,integer,integer,integer) to service_role;

-- Normalize only exact legacy Link4M API bases. Templates/custom URLs are left
-- untouched and are normalized again at runtime by free-start.
update public.licenses_free_shortlink_providers
set api_url_template = case
  when lower(rtrim(api_url_template, '/')) = 'https://link4m.co/api-shorten' then 'https://link4m.co/api-shorten/v2'
  when lower(rtrim(api_url_template, '/')) = 'https://link4m.com/api-shorten' then 'https://link4m.com/api-shorten/v2'
  else api_url_template
end,
updated_at = now()
where provider = 'link4m'
  and lower(rtrim(coalesce(api_url_template, ''), '/')) in (
    'https://link4m.co/api-shorten',
    'https://link4m.com/api-shorten'
  );

-- Never keep an entire Cloudflare HTML page in an admin table/UI.
update public.licenses_free_shortlink_providers
set last_error = 'LINK4M_CLOUDFLARE_CHALLENGE',
    updated_at = now()
where provider = 'link4m'
  and (
    coalesce(last_error, '') ilike '%<!doctype html%'
    or coalesce(last_error, '') ilike '%<title>just a moment%'
    or coalesce(last_error, '') ilike '%challenge-platform%'
    or coalesce(last_error, '') ilike '%cf-chl-%'
  );

commit;
