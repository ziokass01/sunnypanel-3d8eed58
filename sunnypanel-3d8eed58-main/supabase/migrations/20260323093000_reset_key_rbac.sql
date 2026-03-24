begin;

create table if not exists public.license_reset_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  require_turnstile boolean not null default false,
  free_first_penalty_pct integer not null default 50 check (free_first_penalty_pct between 0 and 100),
  free_next_penalty_pct integer not null default 50 check (free_next_penalty_pct between 0 and 100),
  paid_first_penalty_pct integer not null default 0 check (paid_first_penalty_pct between 0 and 100),
  paid_next_penalty_pct integer not null default 20 check (paid_next_penalty_pct between 0 and 100),
  public_check_limit integer not null default 12,
  public_check_window_seconds integer not null default 300,
  public_reset_limit integer not null default 5,
  public_reset_window_seconds integer not null default 600,
  user_max_duration_seconds integer not null default 2592000,
  disabled_message text not null default 'Tính năng Reset Key đang tạm đóng. Vui lòng quay lại sau.',
  updated_at timestamptz not null default now()
);

insert into public.license_reset_settings (id)
values (1)
on conflict (id) do nothing;

create or replace function public.touch_license_reset_settings()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_license_reset_settings on public.license_reset_settings;
create trigger trg_touch_license_reset_settings
before update on public.license_reset_settings
for each row
execute function public.touch_license_reset_settings();

create table if not exists public.key_public_rate_limits (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  ip text not null,
  key_bucket text not null default '',
  window_start timestamptz not null,
  count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (action, ip, key_bucket, window_start)
);

create index if not exists idx_key_public_rate_limits_window
  on public.key_public_rate_limits (window_start);

alter table public.licenses
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.licenses
  add column if not exists admin_reset_count integer not null default 0;

alter table public.licenses
  add column if not exists public_reset_count integer not null default 0;

create index if not exists idx_licenses_created_by on public.licenses (created_by);

alter table public.license_reset_settings enable row level security;
alter table public.key_public_rate_limits enable row level security;

drop policy if exists "Admins manage license reset settings" on public.license_reset_settings;
create policy "Admins manage license reset settings"
on public.license_reset_settings
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins read public key rate limits" on public.key_public_rate_limits;
create policy "Admins read public key rate limits"
on public.key_public_rate_limits
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

create or replace function public.is_free_license(p_note text)
returns boolean
language sql
stable
as $$
  select coalesce(p_note, '') ilike 'FREE%';
$$;

create or replace function public.get_my_panel_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then null
    when public.has_role(auth.uid(), 'admin') then 'admin'
    when public.has_role(auth.uid(), 'moderator') then 'moderator'
    when public.has_role(auth.uid(), 'user') then 'user'
    else null
  end;
$$;

create or replace function public.can_manage_license(_user_id uuid, _license_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(public.has_role(_user_id, 'admin'), false)
    or exists (
      select 1
      from public.licenses l
      where l.id = _license_id
        and l.created_by = _user_id
    );
$$;

grant execute on function public.get_my_panel_role() to authenticated;

create or replace function public.set_license_created_by()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT'
     and new.created_by is null
     and auth.role() = 'authenticated'
     and auth.uid() is not null then
    new.created_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_license_created_by on public.licenses;
create trigger trg_set_license_created_by
before insert on public.licenses
for each row
execute function public.set_license_created_by();

create or replace function public.enforce_license_write_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_is_user_like boolean := false;
  v_limit_seconds integer := 2592000;
  v_start_on_first_use boolean := false;
  v_duration_seconds integer := null;
begin
  if auth.role() is distinct from 'authenticated' or v_uid is null then
    return new;
  end if;

  v_is_admin := public.has_role(v_uid, 'admin');
  v_is_user_like := public.has_role(v_uid, 'user') or public.has_role(v_uid, 'moderator');

  if v_is_admin then
    return new;
  end if;

  if not v_is_user_like then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if new.created_by is null then
    new.created_by := v_uid;
  end if;

  if new.created_by is distinct from v_uid then
    raise exception 'FORBIDDEN_CREATED_BY';
  end if;

  if public.is_free_license(new.note) then
    raise exception 'FORBIDDEN_NOTE_PREFIX';
  end if;

  select coalesce(user_max_duration_seconds, 2592000)
    into v_limit_seconds
  from public.license_reset_settings
  where id = 1;

  v_start_on_first_use :=
    coalesce(new.start_on_first_use, new.starts_on_first_use, false);

  v_duration_seconds :=
    case
      when coalesce(new.duration_seconds, 0) > 0 then new.duration_seconds
      when coalesce(new.duration_days, 0) > 0 then new.duration_days * 86400
      else null
    end;

  if v_start_on_first_use then
    if coalesce(v_duration_seconds, 0) <= 0 then
      raise exception 'DURATION_REQUIRED';
    end if;

    if v_duration_seconds > v_limit_seconds then
      raise exception 'USER_MAX_30_DAYS';
    end if;
  else
    if new.expires_at is not null
       and new.expires_at > now() + make_interval(secs => v_limit_seconds) then
      raise exception 'USER_MAX_30_DAYS';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_license_write_limits on public.licenses;
create trigger trg_enforce_license_write_limits
before insert or update on public.licenses
for each row
execute function public.enforce_license_write_limits();

drop policy if exists "Admins manage licenses" on public.licenses;
create policy "Admins manage licenses"
on public.licenses
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Users select own licenses" on public.licenses;
create policy "Users select own licenses"
on public.licenses
for select
to authenticated
using (
  (public.has_role(auth.uid(), 'user') or public.has_role(auth.uid(), 'moderator'))
  and created_by = auth.uid()
);

drop policy if exists "Users insert own licenses" on public.licenses;
create policy "Users insert own licenses"
on public.licenses
for insert
to authenticated
with check (
  (public.has_role(auth.uid(), 'user') or public.has_role(auth.uid(), 'moderator'))
  and created_by = auth.uid()
);

drop policy if exists "Users update own licenses" on public.licenses;
create policy "Users update own licenses"
on public.licenses
for update
to authenticated
using (
  (public.has_role(auth.uid(), 'user') or public.has_role(auth.uid(), 'moderator'))
  and created_by = auth.uid()
)
with check (
  (public.has_role(auth.uid(), 'user') or public.has_role(auth.uid(), 'moderator'))
  and created_by = auth.uid()
);

drop policy if exists "Users delete own licenses" on public.licenses;
create policy "Users delete own licenses"
on public.licenses
for delete
to authenticated
using (
  (public.has_role(auth.uid(), 'user') or public.has_role(auth.uid(), 'moderator'))
  and created_by = auth.uid()
);

drop policy if exists "Admins manage license devices" on public.license_devices;
create policy "Admins manage license devices"
on public.license_devices
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Users read own license devices" on public.license_devices;
create policy "Users read own license devices"
on public.license_devices
for select
to authenticated
using (
  (public.has_role(auth.uid(), 'user') or public.has_role(auth.uid(), 'moderator'))
  and public.can_manage_license(auth.uid(), license_id)
);

drop policy if exists "Users delete own license devices" on public.license_devices;
create policy "Users delete own license devices"
on public.license_devices
for delete
to authenticated
using (
  (public.has_role(auth.uid(), 'user') or public.has_role(auth.uid(), 'moderator'))
  and public.can_manage_license(auth.uid(), license_id)
);

create or replace function public.log_audit(
  p_action text,
  p_license_key text,
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_action text := upper(trim(coalesce(p_action, '')));
  v_key text := upper(trim(coalesce(p_license_key, '')));
  v_is_admin boolean := false;
  v_owns boolean := false;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  v_is_admin := public.has_role(v_uid, 'admin');

  if not v_is_admin then
    if v_action not in ('CREATE', 'UPDATE', 'SOFT_DELETE', 'REACTIVATE_RENEW', 'RESET_DEVICES', 'RESET_DEVICES_PENALTY') then
      raise exception 'NOT_ALLOWED';
    end if;

    if v_action <> 'CREATE' then
      select exists (
        select 1
        from public.licenses l
        where l.key = v_key
          and l.created_by = v_uid
      )
      into v_owns;

      if not v_owns then
        raise exception 'NOT_ALLOWED';
      end if;
    end if;
  end if;

  insert into public.audit_logs(action, license_key, detail)
  values (
    v_action,
    v_key,
    coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('actor_user_id', v_uid)
  );
end;
$$;

grant execute on function public.log_audit(text, text, jsonb) to authenticated;

create or replace function public.dashboard_stats_scoped()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_total integer := 0;
  v_active integer := 0;
  v_expired integer := 0;
  v_blocked integer := 0;
  v_deleted integer := 0;
  v_devices integer := 0;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  v_is_admin := public.has_role(v_uid, 'admin');

  if not (v_is_admin or public.has_role(v_uid, 'user') or public.has_role(v_uid, 'moderator')) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if v_is_admin then
    select count(*) into v_total from public.licenses;
    select count(*) into v_deleted from public.licenses where deleted_at is not null;
    select count(*) into v_blocked from public.licenses where deleted_at is null and is_active = false;
    select count(*) into v_expired from public.licenses where deleted_at is null and expires_at is not null and expires_at < now();
    select count(*) into v_active from public.licenses where deleted_at is null and is_active = true and (expires_at is null or expires_at >= now());
    select count(*) into v_devices from public.license_devices;
  else
    select count(*) into v_total from public.licenses where created_by = v_uid;
    select count(*) into v_deleted from public.licenses where created_by = v_uid and deleted_at is not null;
    select count(*) into v_blocked from public.licenses where created_by = v_uid and deleted_at is null and is_active = false;
    select count(*) into v_expired from public.licenses where created_by = v_uid and deleted_at is null and expires_at is not null and expires_at < now();
    select count(*) into v_active from public.licenses where created_by = v_uid and deleted_at is null and is_active = true and (expires_at is null or expires_at >= now());
    select count(*) into v_devices
    from public.license_devices ld
    join public.licenses l on l.id = ld.license_id
    where l.created_by = v_uid;
  end if;

  return jsonb_build_object(
    'total_licenses', coalesce(v_total, 0),
    'active_licenses', coalesce(v_active, 0),
    'expired_licenses', coalesce(v_expired, 0),
    'blocked_licenses', coalesce(v_blocked, 0),
    'deleted_licenses', coalesce(v_deleted, 0),
    'total_devices', coalesce(v_devices, 0)
  );
end;
$$;

grant execute on function public.dashboard_stats_scoped() to authenticated;

create or replace function public.verify_counts_per_day_scoped(p_days integer default 14)
returns table(day text, count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_days integer := greatest(coalesce(p_days, 14), 1);
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  v_is_admin := public.has_role(v_uid, 'admin');

  if not (v_is_admin or public.has_role(v_uid, 'user') or public.has_role(v_uid, 'moderator')) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  return query
  with days as (
    select generate_series(
      date_trunc('day', now()) - ((v_days - 1) * interval '1 day'),
      date_trunc('day', now()),
      interval '1 day'
    )::date as d
  ),
  counts as (
    select
      date_trunc('day', a.created_at)::date as d,
      count(*)::bigint as c
    from public.audit_logs a
    left join public.licenses l on l.key = a.license_key
    where a.action = 'VERIFY'
      and a.created_at >= date_trunc('day', now()) - ((v_days - 1) * interval '1 day')
      and (
        v_is_admin
        or l.created_by = v_uid
      )
    group by 1
  )
  select to_char(days.d, 'YYYY-MM-DD') as day, coalesce(counts.c, 0)::bigint as count
  from days
  left join counts on counts.d = days.d
  order by days.d asc;
end;
$$;

grant execute on function public.verify_counts_per_day_scoped(integer) to authenticated;

create or replace function public.admin_reset_devices_penalty(p_license_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_license public.licenses%rowtype;
  v_now timestamptz := now();
  v_penalty_pct integer := 0;
  v_remaining_seconds integer := 0;
  v_penalty_seconds integer := 0;
  v_new_expires_at timestamptz := null;
  v_devices_removed integer := 0;
begin
  if v_uid is null or not public.has_role(v_uid, 'admin') then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select *
  into v_license
  from public.licenses
  where id = p_license_id
  for update;

  if not found then
    raise exception 'LICENSE_NOT_FOUND';
  end if;

  if v_license.deleted_at is not null then
    raise exception 'LICENSE_DELETED';
  end if;

  v_penalty_pct := case when coalesce(v_license.admin_reset_count, 0) = 0 then 0 else 20 end;

  if v_license.expires_at is not null then
    v_remaining_seconds := greatest(0, floor(extract(epoch from (v_license.expires_at - v_now)))::integer);
    v_penalty_seconds := floor(v_remaining_seconds * v_penalty_pct / 100.0)::integer;
    v_new_expires_at := v_license.expires_at - make_interval(secs => v_penalty_seconds);

    if v_new_expires_at < v_now then
      v_new_expires_at := v_now;
    end if;
  end if;

  delete from public.license_devices
  where license_id = v_license.id;

  get diagnostics v_devices_removed = row_count;

  update public.licenses
  set
    expires_at = v_new_expires_at,
    admin_reset_count = coalesce(admin_reset_count, 0) + 1
  where id = v_license.id;

  perform public.log_audit(
    'RESET_DEVICES_PENALTY',
    v_license.key,
    jsonb_build_object(
      'license_id', v_license.id,
      'penalty_pct', v_penalty_pct,
      'penalty_seconds', v_penalty_seconds,
      'devices_removed', v_devices_removed,
      'admin_reset_count_after', coalesce(v_license.admin_reset_count, 0) + 1
    )
  );

  return jsonb_build_object(
    'ok', true,
    'msg', 'RESET_OK',
    'key', v_license.key,
    'penalty_pct', v_penalty_pct,
    'penalty_seconds', v_penalty_seconds,
    'devices_removed', v_devices_removed,
    'remaining_seconds',
      case
        when v_new_expires_at is null then null
        else greatest(0, floor(extract(epoch from (v_new_expires_at - v_now)))::integer)
      end,
    'admin_reset_count', coalesce(v_license.admin_reset_count, 0) + 1
  );
end;
$$;

grant execute on function public.admin_reset_devices_penalty(uuid) to authenticated;

create or replace function public.check_public_action_rate_limit(
  p_action text,
  p_ip text,
  p_key_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, current_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket text := coalesce(p_key_bucket, '');
  v_limit integer := greatest(coalesce(p_limit, 1), 1);
  v_window integer := greatest(coalesce(p_window_seconds, 60), 1);
  v_window_start timestamptz;
  v_count integer := 0;
begin
  v_window_start :=
    to_timestamp(
      floor(extract(epoch from now()) / v_window) * v_window
    );

  insert into public.key_public_rate_limits (action, ip, key_bucket, window_start, count)
  values (upper(coalesce(p_action, 'CHECK')), coalesce(p_ip, '0.0.0.0'), v_bucket, v_window_start, 1)
  on conflict (action, ip, key_bucket, window_start)
  do update set count = public.key_public_rate_limits.count + 1
  returning count into v_count;

  return query
  select (v_count <= v_limit), v_count;
end;
$$;

create or replace function public.get_public_key_info(p_key text)
returns table(
  key text,
  key_kind text,
  created_at timestamptz,
  expires_at timestamptz,
  remaining_seconds integer,
  status text,
  device_count integer,
  max_devices integer,
  admin_reset_count integer,
  public_reset_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.key,
    case when public.is_free_license(l.note) then 'FREE' else 'PAID' end as key_kind,
    l.created_at,
    l.expires_at,
    case
      when l.expires_at is null then null
      else greatest(0, floor(extract(epoch from (l.expires_at - now())))::integer)
    end as remaining_seconds,
    case
      when l.deleted_at is not null then 'deleted'
      when l.is_active = false then 'blocked'
      when l.expires_at is not null and l.expires_at < now() then 'expired'
      else 'active'
    end as status,
    (
      select count(*)::integer
      from public.license_devices ld
      where ld.license_id = l.id
    ) as device_count,
    l.max_devices,
    coalesce(l.admin_reset_count, 0) as admin_reset_count,
    coalesce(l.public_reset_count, 0) as public_reset_count
  from public.licenses l
  where l.key = upper(trim(coalesce(p_key, '')))
  limit 1;
$$;

create or replace function public.public_reset_key(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.license_reset_settings%rowtype;
  v_license public.licenses%rowtype;
  v_now timestamptz := now();
  v_is_free boolean := false;
  v_penalty_pct integer := 0;
  v_remaining_seconds integer := 0;
  v_penalty_seconds integer := 0;
  v_new_expires_at timestamptz := null;
  v_devices_removed integer := 0;
begin
  select * into v_settings
  from public.license_reset_settings
  where id = 1;

  if coalesce(v_settings.enabled, false) = false then
    return jsonb_build_object(
      'ok', false,
      'msg', 'RESET_DISABLED',
      'disabled_message', coalesce(v_settings.disabled_message, 'Reset Key đang tạm đóng.')
    );
  end if;

  select *
  into v_license
  from public.licenses
  where key = upper(trim(coalesce(p_key, '')))
  for update;

  if not found or v_license.deleted_at is not null then
    return jsonb_build_object('ok', false, 'msg', 'KEY_NOT_FOUND');
  end if;

  if v_license.is_active = false then
    return jsonb_build_object('ok', false, 'msg', 'KEY_BLOCKED');
  end if;

  if v_license.expires_at is not null and v_license.expires_at < v_now then
    return jsonb_build_object('ok', false, 'msg', 'KEY_EXPIRED');
  end if;

  v_is_free := public.is_free_license(v_license.note);

  if v_is_free then
    v_penalty_pct := case
      when coalesce(v_license.public_reset_count, 0) = 0 then coalesce(v_settings.free_first_penalty_pct, 50)
      else coalesce(v_settings.free_next_penalty_pct, 50)
    end;
  else
    v_penalty_pct := case
      when coalesce(v_license.public_reset_count, 0) = 0 then coalesce(v_settings.paid_first_penalty_pct, 0)
      else coalesce(v_settings.paid_next_penalty_pct, 20)
    end;
  end if;

  if v_license.expires_at is not null then
    v_remaining_seconds := greatest(0, floor(extract(epoch from (v_license.expires_at - v_now)))::integer);
    v_penalty_seconds := floor(v_remaining_seconds * v_penalty_pct / 100.0)::integer;
    v_new_expires_at := v_license.expires_at - make_interval(secs => v_penalty_seconds);

    if v_new_expires_at < v_now then
      v_new_expires_at := v_now;
    end if;
  end if;

  delete from public.license_devices
  where license_id = v_license.id;

  get diagnostics v_devices_removed = row_count;

  update public.licenses
  set
    expires_at = v_new_expires_at,
    public_reset_count = coalesce(public_reset_count, 0) + 1
  where id = v_license.id;

  insert into public.audit_logs(action, license_key, detail)
  values (
    'PUBLIC_RESET',
    v_license.key,
    jsonb_build_object(
      'license_id', v_license.id,
      'key_kind', case when v_is_free then 'FREE' else 'PAID' end,
      'penalty_pct', v_penalty_pct,
      'penalty_seconds', v_penalty_seconds,
      'devices_removed', v_devices_removed,
      'public_reset_count_after', coalesce(v_license.public_reset_count, 0) + 1
    )
  );

  return jsonb_build_object(
    'ok', true,
    'msg', 'RESET_OK',
    'key', v_license.key,
    'key_kind', case when v_is_free then 'FREE' else 'PAID' end,
    'created_at', v_license.created_at,
    'expires_at', v_new_expires_at,
    'remaining_seconds',
      case
        when v_new_expires_at is null then null
        else greatest(0, floor(extract(epoch from (v_new_expires_at - v_now)))::integer)
      end,
    'status', 'active',
    'device_count', 0,
    'max_devices', v_license.max_devices,
    'admin_reset_count', coalesce(v_license.admin_reset_count, 0),
    'public_reset_count', coalesce(v_license.public_reset_count, 0) + 1,
    'penalty_pct', v_penalty_pct,
    'penalty_seconds', v_penalty_seconds,
    'devices_removed', v_devices_removed
  );
end;
$$;

commit;
