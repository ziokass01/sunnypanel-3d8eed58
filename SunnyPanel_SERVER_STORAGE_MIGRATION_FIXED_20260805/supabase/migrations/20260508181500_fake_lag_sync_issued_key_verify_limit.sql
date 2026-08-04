-- Hotfix 2026-05-08: Fake Lag issued key limit must follow
-- license_access_rules.max_verify_per_key, not the public free quota.
--
-- Problem:
--   Admin Server Key page has separate meanings:
--     max_devices_per_key = public /free quota per device/day
--     max_ips_per_key     = public /free quota per IP/day
--     max_verify_per_key  = verify/use limit for the issued Fake Lag key
--   Older issuing code copied max_devices_per_key into public.licenses.max_devices,
--   so reset/check page showed 1/1000 even when max_verify_per_key was 1.
--
-- Scope: fake-lag keys only. Does not touch Find Dumps, Free Fire, Rent, or AI.

alter table public.licenses
  add column if not exists max_devices integer,
  add column if not exists max_ips integer,
  add column if not exists max_verify integer;

-- Repair existing Fake Lag keys: public display limit must mirror max_verify.
update public.licenses
set max_devices = greatest(1, coalesce(max_verify, 1))
where lower(coalesce(app_code, '')) = 'fake-lag'
  and coalesce(max_verify, 0) > 0
  and coalesce(max_devices, 0) <> greatest(1, coalesce(max_verify, 1));

-- For legacy FAKELAG rows with app_code missing/wrong, repair app_code and mirror max_verify.
update public.licenses
set app_code = 'fake-lag',
    max_devices = greatest(1, coalesce(max_verify, 1))
where upper(key) like 'FAKELAG-%'
  and coalesce(max_verify, 0) > 0
  and (lower(coalesce(app_code, '')) <> 'fake-lag' or coalesce(max_devices, 0) <> greatest(1, coalesce(max_verify, 1)));

create or replace function public.fake_lag_licenses_sync_max_devices_from_verify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.app_code, '')) = 'fake-lag' or upper(coalesce(new.key, '')) like 'FAKELAG-%' then
    new.app_code := 'fake-lag';

    -- max_verify is the real issued-key use/verify limit.
    -- max_devices is kept in sync for reset/check UI compatibility.
    if coalesce(new.max_verify, 0) > 0 then
      new.max_devices := greatest(1, new.max_verify);
    elsif coalesce(new.max_devices, 0) <= 0 then
      new.max_devices := 1;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fake_lag_licenses_sync_max_devices_from_verify on public.licenses;
create trigger trg_fake_lag_licenses_sync_max_devices_from_verify
before insert or update of key, app_code, max_devices, max_verify
on public.licenses
for each row
execute function public.fake_lag_licenses_sync_max_devices_from_verify();

-- Keep admin rule clear: quota fields can stay high, issued-key limit stays independent.
update public.license_access_rules
set key_prefix = 'FAKELAG',
    public_enabled = true,
    updated_at = now()
where app_code = 'fake-lag';
