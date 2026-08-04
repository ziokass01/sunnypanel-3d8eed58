-- Fake Lag Gói 2 hardening + usage-only license limit.
-- Safe/idempotent. Free-site quota still belongs to Server app -> Fake Lag -> Server key.
-- A license key itself only has verify/use count; per-key IP/device limits are intentionally ignored.

alter table public.licenses
  add column if not exists app_code text default 'free-fire',
  add column if not exists max_verify integer,
  add column if not exists verify_count integer not null default 0,
  add column if not exists deleted_at timestamptz;

-- Keep free public quota synchronized from Fake Lag server key rules.
-- max_devices_per_key and max_ips_per_key are reused as daily public quota knobs,
-- not per-license limits.
insert into public.server_app_settings (
  app_code,
  free_daily_limit_per_fingerprint,
  free_daily_limit_per_ip
)
select
  'fake-lag',
  greatest(1, coalesce(max_devices_per_key, max_verify_per_key, 1)),
  greatest(0, coalesce(max_ips_per_key, 0))
from public.license_access_rules
where app_code = 'fake-lag'
on conflict (app_code) do update set
  free_daily_limit_per_fingerprint = excluded.free_daily_limit_per_fingerprint,
  free_daily_limit_per_ip = excluded.free_daily_limit_per_ip;

update public.licenses
set app_code = 'fake-lag',
    max_verify = greatest(1, coalesce(max_verify, (select max_verify_per_key from public.license_access_rules where app_code = 'fake-lag'), 1))
where upper(key) like 'FAKELAG-%';

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
  v_max_verify integer := 1;
begin
  select * into v_rule
  from public.license_access_rules
  where app_code = coalesce(nullif(p_app_code, ''), 'fake-lag');

  if not found then
    select * into v_rule from public.license_access_rules where app_code = 'fake-lag';
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

  if v_license.deleted_at is not null then
    return query select false, 'KEY_DELETED', coalesce(v_license.verify_count, 0), 0;
    return;
  end if;

  if not coalesce(v_license.is_active, true) then
    return query select false, 'KEY_BLOCKED', coalesce(v_license.verify_count, 0), 0;
    return;
  end if;

  -- Server-level IP block still works, but per-license IP count is no longer a limiter.
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

  v_max_verify := greatest(1, coalesce(v_license.max_verify, v_rule.max_verify_per_key, 1));

  -- Check before increment so max_verify = 1 allows the first successful use.
  if coalesce(v_license.verify_count, 0) >= v_max_verify then
    return query select false, 'VERIFY_LIMIT_EXCEEDED', coalesce(v_license.verify_count, 0), v_ip_count;
    return;
  end if;

  update public.licenses
  set verify_count = coalesce(verify_count, 0) + 1
  where id = p_license_id
  returning verify_count into v_verify_count;

  return query select true, 'OK', v_verify_count, v_ip_count;
end;
$$;

grant execute on function public.increment_fake_lag_license_use(uuid, text, text) to service_role;
