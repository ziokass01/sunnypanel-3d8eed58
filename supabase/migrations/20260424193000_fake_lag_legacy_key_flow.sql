-- Fake Lag legacy-style key flow
-- Safe additive migration: does not change existing Free Fire / Find Dumps tables.

create table if not exists public.license_access_rules (
  app_code text primary key,
  key_prefix text not null default 'FAKELAG',
  default_duration_seconds integer not null default 86400,
  max_devices_per_key integer not null default 1,
  max_ips_per_key integer not null default 1,
  max_verify_per_key integer not null default 1,
  public_enabled boolean not null default true,
  allow_reset boolean not null default false,
  blocked_device_hashes text[] not null default '{}',
  blocked_ip_hashes text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.license_ip_bindings (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  app_code text not null default 'fake-lag',
  ip_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  verify_count integer not null default 1,
  unique (license_id, ip_hash)
);

alter table public.licenses
  add column if not exists app_code text not null default 'free-fire',
  add column if not exists verify_count integer not null default 0;

create index if not exists licenses_app_code_idx on public.licenses(app_code);
create index if not exists license_ip_bindings_license_id_idx on public.license_ip_bindings(license_id);
create index if not exists license_ip_bindings_app_code_idx on public.license_ip_bindings(app_code);

insert into public.license_access_rules (
  app_code,
  key_prefix,
  default_duration_seconds,
  max_devices_per_key,
  max_ips_per_key,
  max_verify_per_key,
  public_enabled,
  allow_reset,
  notes
)
values (
  'fake-lag',
  'FAKELAG',
  86400,
  1,
  1,
  1,
  true,
  false,
  'Fake Lag dùng key riêng FAKELAG, không trộn với key SUNNY của Free Fire.'
)
on conflict (app_code) do nothing;

create or replace function public.increment_fake_lag_license_use(
  p_license_id uuid,
  p_app_code text,
  p_ip_hash text
)
returns table(ok boolean, msg text, verify_count integer, ip_count integer)
language plpgsql
security definer
as $$
declare
  v_rule public.license_access_rules%rowtype;
  v_license public.licenses%rowtype;
  v_ip_count integer := 0;
  v_verify_count integer := 0;
begin
  select * into v_rule
  from public.license_access_rules
  where app_code = coalesce(nullif(p_app_code, ''), 'fake-lag');

  if not found then
    select * into v_rule
    from public.license_access_rules
    where app_code = 'fake-lag';
  end if;

  if not coalesce(v_rule.public_enabled, true) then
    return query select false, 'APP_KEY_DISABLED', 0, 0;
    return;
  end if;

  select * into v_license
  from public.licenses
  where id = p_license_id
  for update;

  if not found then
    return query select false, 'KEY_NOT_FOUND', 0, 0;
    return;
  end if;

  if p_ip_hash = any(coalesce(v_rule.blocked_ip_hashes, '{}')) then
    return query select false, 'IP_BLOCKED', coalesce(v_license.verify_count, 0), 0;
    return;
  end if;

  insert into public.license_ip_bindings (license_id, app_code, ip_hash, verify_count)
  values (p_license_id, coalesce(nullif(p_app_code, ''), 'fake-lag'), p_ip_hash, 1)
  on conflict (license_id, ip_hash)
  do update set
    last_seen_at = now(),
    verify_count = public.license_ip_bindings.verify_count + 1;

  select count(*) into v_ip_count
  from public.license_ip_bindings
  where license_id = p_license_id;

  if v_ip_count > coalesce(v_rule.max_ips_per_key, 1) then
    return query select false, 'IP_LIMIT_EXCEEDED', coalesce(v_license.verify_count, 0), v_ip_count;
    return;
  end if;

  update public.licenses
  set verify_count = coalesce(verify_count, 0) + 1
  where id = p_license_id
  returning verify_count into v_verify_count;

  if v_verify_count > coalesce(v_rule.max_verify_per_key, 1) then
    return query select false, 'VERIFY_LIMIT_EXCEEDED', v_verify_count, v_ip_count;
    return;
  end if;

  return query select true, 'OK', v_verify_count, v_ip_count;
end;
$$;
