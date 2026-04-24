-- Fake Lag hotfix: allow FAKELAG license keys, default max verify = 1, repair existing rules.
-- Safe additive migration for projects that already applied previous Fake Lag migrations.

create or replace function public.validate_license_key_format()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.key is null or NEW.key !~ '^(SUNNY|FAKELAG)-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$' then
    raise exception 'Invalid license key format. Expected SUNNY/FAKELAG-XXXX-XXXX-XXXX (A-Z0-9)';
  end if;
  NEW.key := upper(NEW.key);
  return NEW;
end;
$$;

alter table public.licenses
  add column if not exists app_code text default 'free-fire',
  add column if not exists max_ips integer,
  add column if not exists max_verify integer;

update public.license_access_rules
set max_verify_per_key = 1,
    max_ips_per_key = greatest(1, coalesce(max_ips_per_key, 1)),
    max_devices_per_key = greatest(1, coalesce(max_devices_per_key, 1)),
    updated_at = now()
where app_code = 'fake-lag';

update public.licenses
set max_ips = coalesce(max_ips, 1),
    max_verify = coalesce(max_verify, 1),
    max_devices = greatest(1, coalesce(max_devices, 1)),
    app_code = 'fake-lag'
where upper(key) like 'FAKELAG-%';
