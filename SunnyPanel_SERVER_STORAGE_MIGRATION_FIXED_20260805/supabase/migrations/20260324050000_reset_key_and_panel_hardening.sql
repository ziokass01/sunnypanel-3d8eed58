begin;

create or replace function public.license_effective_duration_seconds(
  p_duration_seconds integer,
  p_duration_days integer
)
returns bigint
language sql
immutable
as $$
  select case
    when coalesce(p_duration_seconds, 0) > 0 then p_duration_seconds::bigint
    when coalesce(p_duration_days, 0) > 0 then (p_duration_days::bigint * 86400)
    else null
  end;
$$;

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
    when coalesce(p_start_on_first_use, p_starts_on_first_use, false)
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
      coalesce(p_start_on_first_use, p_starts_on_first_use, false) as starts_on_first_use,
      coalesce(p_first_used_at, p_activated_at) as first_used_at,
      public.license_effective_duration_seconds(p_duration_seconds, p_duration_days) as effective_duration_seconds,
      public.license_effective_expires_at(
        p_expires_at,
        p_start_on_first_use,
        p_starts_on_first_use,
        p_first_used_at,
        p_activated_at,
        p_duration_seconds,
        p_duration_days
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
      coalesce(p_start_on_first_use, p_starts_on_first_use, false) as starts_on_first_use,
      coalesce(p_first_used_at, p_activated_at) as first_used_at,
      public.license_effective_expires_at(
        p_expires_at,
        p_start_on_first_use,
        p_starts_on_first_use,
        p_first_used_at,
        p_activated_at,
        p_duration_seconds,
        p_duration_days
      ) as effective_expires_at
  )
  select case
    when p_deleted_at is not null then 'deleted'
    when coalesce(p_is_active, true) = false then 'blocked'
    when vars.effective_expires_at is not null and vars.effective_expires_at < p_now then 'expired'
    when vars.starts_on_first_use and vars.first_used_at is null then 'not_started'
    else 'active'
  end
  from vars;
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
    public.license_effective_expires_at(
      l.expires_at,
      l.start_on_first_use,
      l.starts_on_first_use,
      l.first_used_at,
      l.activated_at,
      l.duration_seconds,
      l.duration_days
    ) as expires_at,
    public.license_remaining_seconds(
      l.expires_at,
      l.start_on_first_use,
      l.starts_on_first_use,
      l.first_used_at,
      l.activated_at,
      l.duration_seconds,
      l.duration_days,
      now()
    )::integer as remaining_seconds,
    public.license_public_status(
      l.deleted_at,
      l.is_active,
      l.expires_at,
      l.start_on_first_use,
      l.starts_on_first_use,
      l.first_used_at,
      l.activated_at,
      l.duration_seconds,
      l.duration_days,
      now()
    ) as status,
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

create or replace function public.admin_set_panel_role(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.has_role(v_uid, 'admin') then
    raise exception 'NOT_AUTHORIZED';
  end if;

  insert into public.user_roles(user_id, role)
  values (p_user_id, p_role)
  on conflict (user_id, role) do nothing;
end;
$$;

grant execute on function public.admin_set_panel_role(uuid, public.app_role) to authenticated;

create or replace function public.sync_panel_role_from_auth_metadata()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text := lower(coalesce(new.raw_app_meta_data ->> 'panel_role', new.raw_app_meta_data ->> 'role', ''));
begin
  if v_role in ('admin', 'moderator', 'user') then
    insert into public.user_roles(user_id, role)
    values (new.id, v_role::public.app_role)
    on conflict (user_id, role) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_panel_role_from_auth_metadata on auth.users;
create trigger trg_sync_panel_role_from_auth_metadata
after insert or update of raw_app_meta_data on auth.users
for each row
execute function public.sync_panel_role_from_auth_metadata();

insert into public.user_roles(user_id, role)
select
  u.id,
  lower(coalesce(u.raw_app_meta_data ->> 'panel_role', u.raw_app_meta_data ->> 'role'))::public.app_role
from auth.users u
where lower(coalesce(u.raw_app_meta_data ->> 'panel_role', u.raw_app_meta_data ->> 'role', '')) in ('admin', 'moderator', 'user')
on conflict (user_id, role) do nothing;

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
  v_remaining_seconds bigint := 0;
  v_penalty_seconds bigint := 0;
  v_effective_expires_at timestamptz := null;
  v_new_expires_at timestamptz := null;
  v_new_duration_seconds bigint := null;
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
  v_effective_expires_at := public.license_effective_expires_at(
    v_license.expires_at,
    v_license.start_on_first_use,
    v_license.starts_on_first_use,
    v_license.first_used_at,
    v_license.activated_at,
    v_license.duration_seconds,
    v_license.duration_days
  );

  v_remaining_seconds := coalesce(public.license_remaining_seconds(
    v_license.expires_at,
    v_license.start_on_first_use,
    v_license.starts_on_first_use,
    v_license.first_used_at,
    v_license.activated_at,
    v_license.duration_seconds,
    v_license.duration_days,
    v_now
  ), 0);

  v_penalty_seconds := floor(v_remaining_seconds * v_penalty_pct / 100.0)::bigint;

  if v_effective_expires_at is not null then
    v_new_expires_at := v_effective_expires_at - (v_penalty_seconds * interval '1 second');
    if v_new_expires_at < v_now then
      v_new_expires_at := v_now;
    end if;
  elsif coalesce(v_license.start_on_first_use, v_license.starts_on_first_use, false)
    and coalesce(v_license.first_used_at, v_license.activated_at) is null
    and v_remaining_seconds > 0 then
    v_new_duration_seconds := greatest(0, v_remaining_seconds - v_penalty_seconds);
  end if;

  delete from public.license_devices
  where license_id = v_license.id;

  get diagnostics v_devices_removed = row_count;

  update public.licenses
  set
    expires_at = case
      when v_effective_expires_at is not null then v_new_expires_at
      else v_license.expires_at
    end,
    duration_seconds = case
      when v_new_duration_seconds is not null then v_new_duration_seconds::integer
      else v_license.duration_seconds
    end,
    duration_days = case
      when v_new_duration_seconds is not null then null
      else v_license.duration_days
    end,
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
      'admin_reset_count_after', coalesce(v_license.admin_reset_count, 0) + 1,
      'not_started_duration_after_seconds', v_new_duration_seconds
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
        when v_new_expires_at is not null then greatest(0, floor(extract(epoch from (v_new_expires_at - v_now)))::integer)
        when v_new_duration_seconds is not null then v_new_duration_seconds::integer
        else null
      end,
    'admin_reset_count', coalesce(v_license.admin_reset_count, 0) + 1
  );
end;
$$;

grant execute on function public.admin_reset_devices_penalty(uuid) to authenticated;

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
  v_remaining_seconds bigint := 0;
  v_penalty_seconds bigint := 0;
  v_effective_expires_at timestamptz := null;
  v_new_expires_at timestamptz := null;
  v_new_duration_seconds bigint := null;
  v_devices_removed integer := 0;
  v_status text := 'active';
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

  v_effective_expires_at := public.license_effective_expires_at(
    v_license.expires_at,
    v_license.start_on_first_use,
    v_license.starts_on_first_use,
    v_license.first_used_at,
    v_license.activated_at,
    v_license.duration_seconds,
    v_license.duration_days
  );

  if v_effective_expires_at is not null and v_effective_expires_at < v_now then
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

  v_remaining_seconds := coalesce(public.license_remaining_seconds(
    v_license.expires_at,
    v_license.start_on_first_use,
    v_license.starts_on_first_use,
    v_license.first_used_at,
    v_license.activated_at,
    v_license.duration_seconds,
    v_license.duration_days,
    v_now
  ), 0);

  v_penalty_seconds := floor(v_remaining_seconds * v_penalty_pct / 100.0)::bigint;

  if v_effective_expires_at is not null then
    v_new_expires_at := v_effective_expires_at - (v_penalty_seconds * interval '1 second');
    if v_new_expires_at < v_now then
      v_new_expires_at := v_now;
    end if;
  elsif coalesce(v_license.start_on_first_use, v_license.starts_on_first_use, false)
    and coalesce(v_license.first_used_at, v_license.activated_at) is null
    and v_remaining_seconds > 0 then
    v_new_duration_seconds := greatest(0, v_remaining_seconds - v_penalty_seconds);
  end if;

  delete from public.license_devices
  where license_id = v_license.id;

  get diagnostics v_devices_removed = row_count;

  update public.licenses
  set
    expires_at = case
      when v_effective_expires_at is not null then v_new_expires_at
      else v_license.expires_at
    end,
    duration_seconds = case
      when v_new_duration_seconds is not null then v_new_duration_seconds::integer
      else v_license.duration_seconds
    end,
    duration_days = case
      when v_new_duration_seconds is not null then null
      else v_license.duration_days
    end,
    public_reset_count = coalesce(public_reset_count, 0) + 1
  where id = v_license.id;

  v_status := public.license_public_status(
    v_license.deleted_at,
    v_license.is_active,
    case when v_effective_expires_at is not null then v_new_expires_at else v_license.expires_at end,
    v_license.start_on_first_use,
    v_license.starts_on_first_use,
    v_license.first_used_at,
    v_license.activated_at,
    case when v_new_duration_seconds is not null then v_new_duration_seconds::integer else v_license.duration_seconds end,
    case when v_new_duration_seconds is not null then null else v_license.duration_days end,
    v_now
  );

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
      'public_reset_count_after', coalesce(v_license.public_reset_count, 0) + 1,
      'not_started_duration_after_seconds', v_new_duration_seconds
    )
  );

  return jsonb_build_object(
    'ok', true,
    'msg', 'RESET_OK',
    'key', v_license.key,
    'key_kind', case when v_is_free then 'FREE' else 'PAID' end,
    'created_at', v_license.created_at,
    'expires_at', case
      when v_effective_expires_at is not null then v_new_expires_at
      else public.license_effective_expires_at(
        v_license.expires_at,
        v_license.start_on_first_use,
        v_license.starts_on_first_use,
        v_license.first_used_at,
        v_license.activated_at,
        case when v_new_duration_seconds is not null then v_new_duration_seconds::integer else v_license.duration_seconds end,
        case when v_new_duration_seconds is not null then null else v_license.duration_days end
      )
    end,
    'remaining_seconds',
      case
        when v_new_expires_at is not null then greatest(0, floor(extract(epoch from (v_new_expires_at - v_now)))::integer)
        when v_new_duration_seconds is not null then v_new_duration_seconds::integer
        else public.license_remaining_seconds(
          v_license.expires_at,
          v_license.start_on_first_use,
          v_license.starts_on_first_use,
          v_license.first_used_at,
          v_license.activated_at,
          v_license.duration_seconds,
          v_license.duration_days,
          v_now
        )::integer
      end,
    'status', v_status,
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

revoke all on function public.check_public_action_rate_limit(text, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.get_public_key_info(text) from public, anon, authenticated;
revoke all on function public.public_reset_key(text) from public, anon, authenticated;

grant execute on function public.check_public_action_rate_limit(text, text, text, integer, integer) to service_role;
grant execute on function public.get_public_key_info(text) to service_role;
grant execute on function public.public_reset_key(text) to service_role;

commit;
