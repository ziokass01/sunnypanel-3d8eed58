-- License consistency + atomic public reset repair.
-- This migration does not change verify-key's signed response contract.

begin;

-- Upgraded rows may have start_on_first_use=false from a newly added default
-- while the legacy starts_on_first_use flag is still true. Treat either flag as
-- authoritative so countdown hours are never mistaken for a fixed key.
create or replace function public.license_effective_expires_at(
  p_expires_at timestamptz,
  p_start_on_first_use boolean,
  p_starts_on_first_use boolean,
  p_first_used_at timestamptz,
  p_activated_at timestamptz,
  p_duration_seconds integer,
  p_duration_days integer
)
returns timestamptz
language sql
stable
as $$
  select case
    when p_expires_at is not null then p_expires_at
    when (coalesce(p_start_on_first_use, false) or coalesce(p_starts_on_first_use, false))
      and coalesce(p_first_used_at, p_activated_at) is not null
      and public.license_effective_duration_seconds(p_duration_seconds, p_duration_days) is not null
    then coalesce(p_first_used_at, p_activated_at)
      + (public.license_effective_duration_seconds(p_duration_seconds, p_duration_days) * interval '1 second')
    else null
  end;
$$;

create or replace function public.license_remaining_seconds(
  p_expires_at timestamptz,
  p_start_on_first_use boolean,
  p_starts_on_first_use boolean,
  p_first_used_at timestamptz,
  p_activated_at timestamptz,
  p_duration_seconds integer,
  p_duration_days integer,
  p_now timestamptz default now()
)
returns bigint
language sql
stable
as $$
  with vars as (
    select
      (coalesce(p_start_on_first_use, false) or coalesce(p_starts_on_first_use, false)) as starts_on_first_use,
      coalesce(p_first_used_at, p_activated_at) as first_used_at,
      public.license_effective_duration_seconds(p_duration_seconds, p_duration_days) as effective_duration_seconds,
      public.license_effective_expires_at(
        p_expires_at, p_start_on_first_use, p_starts_on_first_use,
        p_first_used_at, p_activated_at, p_duration_seconds, p_duration_days
      ) as effective_expires_at
  )
  select case
    when vars.effective_expires_at is not null then greatest(0, floor(extract(epoch from (vars.effective_expires_at - p_now)))::bigint)
    when vars.starts_on_first_use and vars.first_used_at is null then vars.effective_duration_seconds
    else null
  end
  from vars;
$$;

create or replace function public.license_public_status(
  p_deleted_at timestamptz,
  p_is_active boolean,
  p_expires_at timestamptz,
  p_start_on_first_use boolean,
  p_starts_on_first_use boolean,
  p_first_used_at timestamptz,
  p_activated_at timestamptz,
  p_duration_seconds integer,
  p_duration_days integer,
  p_now timestamptz default now()
)
returns text
language sql
stable
as $$
  with vars as (
    select
      (coalesce(p_start_on_first_use, false) or coalesce(p_starts_on_first_use, false)) as starts_on_first_use,
      coalesce(p_first_used_at, p_activated_at) as first_used_at,
      public.license_effective_expires_at(
        p_expires_at, p_start_on_first_use, p_starts_on_first_use,
        p_first_used_at, p_activated_at, p_duration_seconds, p_duration_days
      ) as effective_expires_at
  )
  select case
    when p_deleted_at is not null then 'deleted'
    when coalesce(p_is_active, true) = false then 'blocked'
    when vars.effective_expires_at is not null and vars.effective_expires_at <= p_now then 'expired'
    when vars.starts_on_first_use and vars.first_used_at is null then 'not_started'
    else 'active'
  end
  from vars;
$$;

-- Synchronize the boolean mirrors without modifying already issued durations or
-- expiration timestamps.
update public.licenses
set
  start_on_first_use = (coalesce(start_on_first_use, false) or coalesce(starts_on_first_use, false)),
  starts_on_first_use = (coalesce(start_on_first_use, false) or coalesce(starts_on_first_use, false))
where coalesce(start_on_first_use, false) is distinct from coalesce(starts_on_first_use, false);

-- The old Fake Lag trigger conflated device capacity with verify capacity.
drop trigger if exists trg_fake_lag_licenses_sync_max_devices_from_verify on public.licenses;
drop function if exists public.fake_lag_licenses_sync_max_devices_from_verify();

create or replace function public.keep_license_limit_fields_independent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Do not rewrite nullable limits for other products: NULL can carry legacy
  -- unlimited/default semantics there. Fake Lag has explicit, independent
  -- values supplied by its form and defaults trigger.
  if lower(coalesce(new.app_code, '')) = 'fake-lag' or upper(coalesce(new.key, '')) like 'FAKELAG-%' then
    new.app_code := 'fake-lag';
    if new.max_devices is not null then new.max_devices := greatest(1, new.max_devices); end if;
    if new.max_ips is not null then new.max_ips := greatest(1, new.max_ips); end if;
    if new.max_verify is not null then new.max_verify := greatest(1, new.max_verify); end if;
    if new.verify_count is not null then new.verify_count := greatest(0, new.verify_count); end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_keep_license_limit_fields_independent on public.licenses;
create trigger trg_keep_license_limit_fields_independent
before insert or update of key, app_code, max_devices, max_ips, max_verify, verify_count
on public.licenses
for each row execute function public.keep_license_limit_fields_independent();

-- The older defaults trigger also raised max_devices to max_verify. Replace it
-- with a version that only fills genuinely missing fields from the app rule.
create or replace function public.apply_fake_lag_license_defaults()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_rule record;
begin
  if upper(coalesce(new.key, '')) not like 'FAKELAG-%' and lower(coalesce(new.app_code, '')) <> 'fake-lag' then
    return new;
  end if;
  select * into v_rule from public.license_access_rules where app_code = 'fake-lag';
  new.app_code := 'fake-lag';
  new.max_devices := greatest(1, coalesce(new.max_devices, v_rule.max_devices_per_key, 1));
  new.max_ips := greatest(1, coalesce(new.max_ips, v_rule.max_ips_per_key, 1));
  new.max_verify := greatest(1, coalesce(new.max_verify, v_rule.max_verify_per_key, 1));
  if coalesce(new.note, '') ~* '^FREE_FAKELAG' then new.note := null; end if;
  new.updated_at := coalesce(new.updated_at, now());
  return new;
end;
$$;

-- Repair only rows that carry the exact signature of the old mirror bug. This
-- preserves intentional per-key limits while restoring the configured device
-- value for affected Fake Lag rows.
update public.licenses l
set
  max_devices = greatest(1, coalesce(r.max_devices_per_key, l.max_devices, 1)),
  max_ips = greatest(1, coalesce(l.max_ips, r.max_ips_per_key, 1))
from public.license_access_rules r
where r.app_code = 'fake-lag'
  and (lower(coalesce(l.app_code, '')) = 'fake-lag' or upper(l.key) like 'FAKELAG-%')
  and l.max_devices = l.max_verify
  and coalesce(r.max_devices_per_key, l.max_devices) <> l.max_verify;

-- Admin UI key types with plain hour/day semantics must store seconds exactly.
-- Reward/package key types are excluded because their value can represent a
-- package amount instead of time.
update public.licenses_free_key_types
set duration_seconds = case when kind = 'hour' then least(value::bigint * 3600, 2147483647)::integer else least(value::bigint * 86400, 2147483647)::integer end
where kind in ('hour', 'day')
  and value > 0
  and coalesce(free_selection_mode, 'none') in ('none', 'legacy')
  and duration_seconds is distinct from case when kind = 'hour' then least(value::bigint * 3600, 2147483647)::integer else least(value::bigint * 86400, 2147483647)::integer end;

-- Keep Fake Lag quota consumption atomic and side-effect free on rejection.
-- Older versions inserted/incremented the IP binding before discovering that
-- max_verify was exhausted, which made the dashboard drift after failed calls.
create or replace function public.increment_fake_lag_license_use(
  p_license_id uuid,
  p_app_code text,
  p_ip_hash text
)
returns table(ok boolean, msg text, verify_count integer, ip_count integer)
language plpgsql
security definer
set search_path = public
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
  if nullif(trim(coalesce(p_ip_hash, '')), '') is null then
    return query select false, 'IP_REQUIRED', coalesce(v_license.verify_count, 0), 0;
    return;
  end if;
  if p_ip_hash = any(coalesce(v_rule.blocked_ip_hashes, '{}')) then
    return query select false, 'IP_BLOCKED', coalesce(v_license.verify_count, 0), 0;
    return;
  end if;

  v_max_verify := greatest(1, coalesce(v_license.max_verify, v_rule.max_verify_per_key, 1));
  if coalesce(v_license.verify_count, 0) >= v_max_verify then
    select count(*)::integer into v_ip_count
    from public.license_ip_bindings
    where license_id = p_license_id;
    return query select false, 'VERIFY_LIMIT_EXCEEDED', coalesce(v_license.verify_count, 0), v_ip_count;
    return;
  end if;

  update public.licenses as l
  set verify_count = coalesce(l.verify_count, 0) + 1
  where l.id = p_license_id
  returning l.verify_count into v_verify_count;

  insert into public.license_ip_bindings(license_id, app_code, ip_hash, verify_count)
  values (p_license_id, coalesce(nullif(p_app_code, ''), 'fake-lag'), p_ip_hash, 1)
  on conflict (license_id, ip_hash)
  do update set
    last_seen_at = now(),
    verify_count = public.license_ip_bindings.verify_count + 1;

  select count(*)::integer into v_ip_count
  from public.license_ip_bindings
  where license_id = p_license_id;

  return query select true, 'OK', v_verify_count, v_ip_count;
end;
$$;

revoke all on function public.increment_fake_lag_license_use(uuid,text,text) from public, anon, authenticated;
grant execute on function public.increment_fake_lag_license_use(uuid,text,text) to service_role;

create or replace function public.reset_license_key_atomic(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_license public.licenses%rowtype;
  v_settings public.license_reset_settings%rowtype;
  v_now timestamptz := now();
  v_starts boolean := false;
  v_first_used timestamptz;
  v_duration bigint;
  v_effective_expires timestamptz;
  v_remaining bigint;
  v_kind text := 'admin';
  v_penalty_pct integer := 0;
  v_penalty_seconds bigint := 0;
  v_new_expires timestamptz;
  v_new_duration bigint;
  v_devices_removed integer := 0;
  v_ips_removed integer := 0;
  v_next_reset_count integer := 0;
  v_app_code text;
  v_hard_expire boolean := false;
begin
  select * into v_settings from public.license_reset_settings where id = 1;
  if not coalesce(v_settings.enabled, true) then
    return jsonb_build_object('ok', false, 'msg', 'RESET_DISABLED', 'disabled_message', v_settings.disabled_message);
  end if;

  select * into v_license
  from public.licenses
  where key = upper(trim(coalesce(p_key, '')))
  for update;

  if not found or v_license.deleted_at is not null then return jsonb_build_object('ok', false, 'msg', 'KEY_UNAVAILABLE'); end if;
  if not coalesce(v_license.is_active, false) then return jsonb_build_object('ok', false, 'msg', 'KEY_UNAVAILABLE'); end if;
  if coalesce(v_license.public_reset_disabled, false) then return jsonb_build_object('ok', false, 'msg', 'KEY_RESET_DISABLED', 'public_reset_disabled', true); end if;

  v_starts := coalesce(v_license.start_on_first_use, false) or coalesce(v_license.starts_on_first_use, false);
  v_first_used := coalesce(v_license.first_used_at, v_license.activated_at);
  v_duration := public.license_effective_duration_seconds(v_license.duration_seconds, v_license.duration_days);
  v_effective_expires := public.license_effective_expires_at(
    v_license.expires_at, v_license.start_on_first_use, v_license.starts_on_first_use,
    v_license.first_used_at, v_license.activated_at, v_license.duration_seconds, v_license.duration_days
  );
  if v_effective_expires is not null and v_effective_expires <= v_now then return jsonb_build_object('ok', false, 'msg', 'KEY_UNAVAILABLE'); end if;

  v_remaining := public.license_remaining_seconds(
    v_license.expires_at, v_license.start_on_first_use, v_license.starts_on_first_use,
    v_license.first_used_at, v_license.activated_at, v_license.duration_seconds, v_license.duration_days, v_now
  );
  if v_remaining is null then v_remaining := 0; end if;

  if exists(select 1 from public.licenses_free_issues i where i.license_id = v_license.id) then v_kind := 'free'; end if;
  if v_kind = 'free' then
    v_penalty_pct := case
      when coalesce(v_license.public_reset_count, 0) = 0 then coalesce(v_settings.free_first_penalty_pct, 0)
      when coalesce(v_license.public_reset_count, 0) = 1 then coalesce(v_settings.free_next_penalty_pct, 0)
      else coalesce(v_settings.free_next_penalty_pct, 0) + greatest(0, coalesce(v_license.public_reset_count, 0) - 1) * coalesce(v_settings.free_next_step_penalty_pct, 0)
    end;
  else
    v_penalty_pct := case
      when coalesce(v_license.public_reset_count, 0) = 0 then coalesce(v_settings.paid_first_penalty_pct, 0)
      when coalesce(v_license.public_reset_count, 0) = 1 then coalesce(v_settings.paid_next_penalty_pct, 0)
      else coalesce(v_settings.paid_next_penalty_pct, 0) + greatest(0, coalesce(v_license.public_reset_count, 0) - 1) * coalesce(v_settings.paid_next_step_penalty_pct, 0)
    end;
  end if;
  v_penalty_pct := greatest(0, least(100, v_penalty_pct));
  v_penalty_seconds := floor(v_remaining * v_penalty_pct / 100.0)::bigint;
  v_next_reset_count := coalesce(v_license.public_reset_count, 0) + 1;
  v_hard_expire := coalesce(v_settings.public_reset_cancel_after_count, 0) > 0
    and v_next_reset_count >= v_settings.public_reset_cancel_after_count;

  if v_hard_expire then
    v_new_expires := v_now;
    v_new_duration := 0;
  elsif v_effective_expires is not null then
    v_new_expires := greatest(v_now, v_effective_expires - v_penalty_seconds * interval '1 second');
  elsif v_starts and v_first_used is null and v_duration is not null then
    v_new_duration := greatest(0, v_duration - v_penalty_seconds);
  end if;

  delete from public.license_devices where license_id = v_license.id;
  get diagnostics v_devices_removed = row_count;
  delete from public.license_ip_bindings where license_id = v_license.id;
  get diagnostics v_ips_removed = row_count;

  update public.licenses
  set
    expires_at = case when v_effective_expires is not null then v_new_expires else expires_at end,
    duration_seconds = case when v_new_duration is not null then least(v_new_duration, 2147483647)::integer else duration_seconds end,
    duration_days = case when v_new_duration is not null then null else duration_days end,
    verify_count = 0,
    public_reset_count = v_next_reset_count,
    is_active = case when v_hard_expire then false else is_active end
  where id = v_license.id;

  v_app_code := coalesce(nullif(v_license.app_code, ''), case when upper(v_license.key) like 'FAKELAG-%' then 'fake-lag' else 'free-fire' end);
  insert into public.audit_logs(action, license_key, detail)
  values ('PUBLIC_RESET', v_license.key, jsonb_build_object(
    'license_id', v_license.id, 'app_code', v_app_code, 'key_kind', v_kind,
    'devices_removed', v_devices_removed, 'ips_removed', v_ips_removed,
    'penalty_pct', v_penalty_pct, 'penalty_seconds', v_penalty_seconds,
    'old_expires_at', v_effective_expires, 'new_expires_at', v_new_expires,
    'old_duration_seconds', v_duration, 'new_duration_seconds', v_new_duration,
    'public_reset_count_after', v_next_reset_count, 'hard_expired', v_hard_expire, 'source', 'public-atomic'
  ));

  return jsonb_build_object(
    'ok', true, 'msg', 'RESET_OK', 'key', v_license.key, 'key_kind', case when v_kind = 'free' then 'FREE' else 'PAID' end,
    'app_code', v_app_code, 'created_at', v_license.created_at,
    'expires_at', v_new_expires,
    'remaining_seconds', case when v_new_expires is not null then greatest(0, floor(extract(epoch from (v_new_expires - v_now)))::bigint) when v_new_duration is not null then v_new_duration else v_remaining end,
    'status', case when v_hard_expire or (v_new_expires is not null and v_new_expires <= v_now) then 'expired' when v_starts and v_first_used is null then 'not_started' else 'active' end,
    'device_count', 0, 'max_devices', v_license.max_devices,
    'ip_count', 0, 'max_ips', v_license.max_ips,
    'verify_count', 0, 'max_verify', v_license.max_verify,
    'public_reset_count', v_next_reset_count, 'admin_reset_count', coalesce(v_license.admin_reset_count, 0),
    'penalty_pct', v_penalty_pct, 'penalty_seconds', v_penalty_seconds,
    'devices_removed', v_devices_removed, 'ips_removed', v_ips_removed,
    'public_reset_disabled', false,
    'next_reset_penalty_pct', case
      when coalesce(v_settings.public_reset_cancel_after_count, 0) > 0 and (v_next_reset_count + 1) >= v_settings.public_reset_cancel_after_count then null
      when v_kind = 'free' then coalesce(v_settings.free_next_penalty_pct, 0)
      else coalesce(v_settings.paid_next_penalty_pct, 0)
    end,
    'next_reset_will_expire', coalesce(v_settings.public_reset_cancel_after_count, 0) > 0 and (v_next_reset_count + 1) >= v_settings.public_reset_cancel_after_count,
    'public_reset_cancel_after_count', coalesce(v_settings.public_reset_cancel_after_count, 0)
  );
exception when others then
  return jsonb_build_object('ok', false, 'msg', 'RESET_INTERNAL_ERROR', 'db_code', sqlstate);
end;
$$;

revoke all on function public.reset_license_key_atomic(text) from public, anon, authenticated;
grant execute on function public.reset_license_key_atomic(text) to service_role;

create index if not exists idx_license_devices_license_last_seen on public.license_devices(license_id, last_seen desc);
create index if not exists idx_license_ip_bindings_license_last_seen on public.license_ip_bindings(license_id, last_seen_at desc);

commit;
