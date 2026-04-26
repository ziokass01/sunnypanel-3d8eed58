-- Fake Lag license display + limit sync fix
--
-- Fixes:
-- 1) Fake Lag public/license list must show the real generated key only.
--    Old rows stored the FREE_FAKELAG_* payload in licenses.note; that payload should not be
--    displayed under the key in the audit/license screen.
-- 2) Public reset/check status showed 0/1 even when Fake Lag rule was configured as
--    0/3000. Existing and future FAKELAG-* licenses now inherit the Fake Lag verify limit
--    from license_access_rules.max_verify_per_key.
--
-- Safe scope: only FAKELAG-* / app_code='fake-lag'. Does not touch Find Dumps or Free Fire.

begin;

alter table public.licenses
  add column if not exists app_code text not null default 'free-fire',
  add column if not exists max_devices integer not null default 1,
  add column if not exists max_ips integer not null default 1,
  add column if not exists max_verify integer not null default 1,
  add column if not exists verify_count integer not null default 0,
  add column if not exists note text;

-- Clean old noisy payload note from already-issued Fake Lag keys.
update public.licenses
set
  note = null,
  app_code = 'fake-lag',
  updated_at = coalesce(updated_at, now())
where (upper(key) like 'FAKELAG-%' or app_code = 'fake-lag')
  and coalesce(note, '') ~* '^FREE_FAKELAG';

-- Sync existing Fake Lag limits from the current rule.
update public.licenses l
set
  app_code = 'fake-lag',
  max_devices = greatest(coalesce(l.max_devices, 1), coalesce(r.max_verify_per_key, 1)),
  max_verify = greatest(coalesce(l.max_verify, 1), coalesce(r.max_verify_per_key, 1)),
  max_ips = greatest(coalesce(l.max_ips, 1), coalesce(r.max_ips_per_key, 1)),
  updated_at = coalesce(l.updated_at, now())
from public.license_access_rules r
where r.app_code = 'fake-lag'
  and (upper(l.key) like 'FAKELAG-%' or l.app_code = 'fake-lag')
  and (
    l.app_code is distinct from 'fake-lag'
    or coalesce(l.max_devices, 1) < coalesce(r.max_verify_per_key, 1)
    or coalesce(l.max_verify, 1) < coalesce(r.max_verify_per_key, 1)
    or coalesce(l.max_ips, 1) < coalesce(r.max_ips_per_key, 1)
  );

create or replace function public.apply_fake_lag_license_defaults()
returns trigger
language plpgsql
as $$
declare
  v_rule record;
  v_verify_limit integer := 1;
  v_ip_limit integer := 1;
begin
  if upper(coalesce(new.key, '')) not like 'FAKELAG-%' and coalesce(new.app_code, '') <> 'fake-lag' then
    return new;
  end if;

  select * into v_rule
  from public.license_access_rules
  where app_code = 'fake-lag';

  if found then
    v_verify_limit := greatest(1, coalesce(v_rule.max_verify_per_key, 1));
    v_ip_limit := greatest(1, coalesce(v_rule.max_ips_per_key, 1));
  end if;

  new.app_code := 'fake-lag';

  -- For Fake Lag, the public status page uses max_devices for the "used/device" display.
  -- Keep it aligned with the configured verify/use quota so check-key shows 0/3000 instead of 0/1.
  if coalesce(new.max_devices, 1) < v_verify_limit then
    new.max_devices := v_verify_limit;
  end if;

  if coalesce(new.max_verify, 1) < v_verify_limit then
    new.max_verify := v_verify_limit;
  end if;

  if coalesce(new.max_ips, 1) < v_ip_limit then
    new.max_ips := v_ip_limit;
  end if;

  -- Do not display or persist the internal free-flow payload as a license note.
  if coalesce(new.note, '') ~* '^FREE_FAKELAG' then
    new.note := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_fake_lag_license_defaults on public.licenses;
create trigger trg_apply_fake_lag_license_defaults
before insert or update of key, app_code, max_devices, max_verify, max_ips, note
on public.licenses
for each row
execute function public.apply_fake_lag_license_defaults();

-- Keep issue key_mask clean as well: if a license row exists, always show licenses.key.
create or replace function public.apply_fake_lag_issue_display_key()
returns trigger
language plpgsql
as $$
declare
  v_key text;
begin
  if coalesce(new.app_code, '') <> 'fake-lag'
     and coalesce(new.key_signature, '') <> 'FAKELAG'
     and coalesce(new.key_mask, '') not like 'FAKELAG-%' then
    return new;
  end if;

  if new.license_id is not null then
    select key into v_key
    from public.licenses
    where id = new.license_id;
    if coalesce(v_key, '') like 'FAKELAG-%' then
      new.key_mask := v_key;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_fake_lag_issue_display_key on public.licenses_free_issues;
create trigger trg_apply_fake_lag_issue_display_key
before insert or update of license_id, key_mask, app_code, key_signature
on public.licenses_free_issues
for each row
execute function public.apply_fake_lag_issue_display_key();

-- Backfill issue key_mask for already-issued Fake Lag keys.
update public.licenses_free_issues i
set key_mask = l.key
from public.licenses l
where i.license_id = l.id
  and (i.app_code = 'fake-lag' or i.key_signature = 'FAKELAG' or upper(l.key) like 'FAKELAG-%')
  and coalesce(i.key_mask, '') is distinct from l.key;

commit;
