begin;

alter table public.license_reset_settings
  add column if not exists free_next_step_penalty_pct integer not null default 0 check (free_next_step_penalty_pct between 0 and 100),
  add column if not exists paid_next_step_penalty_pct integer not null default 0 check (paid_next_step_penalty_pct between 0 and 100),
  add column if not exists public_reset_cancel_after_count integer not null default 0 check (public_reset_cancel_after_count >= 0);

alter table public.licenses
  add column if not exists public_reset_disabled boolean not null default false;

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
  public_reset_count integer,
  public_reset_disabled boolean,
  next_reset_penalty_pct integer,
  next_reset_will_expire boolean,
  public_reset_cancel_after_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select *
    from public.license_reset_settings
    where id = 1
  ), l as (
    select *
    from public.licenses
    where key = upper(trim(coalesce(p_key, '')))
    limit 1
  ), meta as (
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
      ) as effective_expires_at,
      public.license_remaining_seconds(
        l.expires_at,
        l.start_on_first_use,
        l.starts_on_first_use,
        l.first_used_at,
        l.activated_at,
        l.duration_seconds,
        l.duration_days,
        now()
      ) as effective_remaining_seconds,
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
      ) as effective_status,
      (
        select count(*)::integer
        from public.license_devices ld
        where ld.license_id = l.id
      ) as device_count,
      l.max_devices,
      coalesce(l.admin_reset_count, 0) as admin_reset_count,
      coalesce(l.public_reset_count, 0) as public_reset_count,
      coalesce(l.public_reset_disabled, false) as public_reset_disabled,
      coalesce(s.public_reset_cancel_after_count, 0) as public_reset_cancel_after_count,
      case
        when public.is_free_license(l.note) then
          case
            when coalesce(l.public_reset_count, 0) = 0 then coalesce(s.free_first_penalty_pct, 50)
            when coalesce(l.public_reset_count, 0) = 1 then coalesce(s.free_next_penalty_pct, 50)
            else coalesce(s.free_next_penalty_pct, 50) + greatest(0, coalesce(l.public_reset_count, 0) - 1) * coalesce(s.free_next_step_penalty_pct, 0)
          end
        else
          case
            when coalesce(l.public_reset_count, 0) = 0 then coalesce(s.paid_first_penalty_pct, 0)
            when coalesce(l.public_reset_count, 0) = 1 then coalesce(s.paid_next_penalty_pct, 20)
            else coalesce(s.paid_next_penalty_pct, 20) + greatest(0, coalesce(l.public_reset_count, 0) - 1) * coalesce(s.paid_next_step_penalty_pct, 0)
          end
      end as raw_next_penalty_pct
    from l cross join s
  )
  select
    meta.key,
    meta.key_kind,
    meta.created_at,
    meta.effective_expires_at as expires_at,
    case
      when meta.effective_remaining_seconds is null then null
      else least(greatest(meta.effective_remaining_seconds, 0), 2147483647)::integer
    end as remaining_seconds,
    meta.effective_status as status,
    meta.device_count,
    meta.max_devices,
    meta.admin_reset_count,
    meta.public_reset_count,
    meta.public_reset_disabled,
    case
      when meta.public_reset_cancel_after_count > 0 and (meta.public_reset_count + 1) >= meta.public_reset_cancel_after_count then null
      else greatest(0, least(100, coalesce(meta.raw_next_penalty_pct, 0)))::integer
    end as next_reset_penalty_pct,
    case
      when meta.public_reset_cancel_after_count > 0 and (meta.public_reset_count + 1) >= meta.public_reset_cancel_after_count then true
      else false
    end as next_reset_will_expire,
    meta.public_reset_cancel_after_count
  from meta;
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
  v_remaining_seconds bigint := 0;
  v_penalty_seconds bigint := 0;
  v_effective_expires_at timestamptz := null;
  v_new_expires_at timestamptz := null;
  v_new_duration_seconds bigint := null;
  v_devices_removed integer := 0;
  v_status text := 'active';
  v_hard_expire boolean := false;
  v_next_public_reset_count integer := 0;
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

  if coalesce(v_license.public_reset_disabled, false) then
    return jsonb_build_object('ok', false, 'msg', 'KEY_RESET_DISABLED');
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
  v_next_public_reset_count := coalesce(v_license.public_reset_count, 0) + 1;

  if v_is_free then
    v_penalty_pct := case
      when coalesce(v_license.public_reset_count, 0) = 0 then coalesce(v_settings.free_first_penalty_pct, 50)
      when coalesce(v_license.public_reset_count, 0) = 1 then coalesce(v_settings.free_next_penalty_pct, 50)
      else coalesce(v_settings.free_next_penalty_pct, 50)
        + greatest(0, coalesce(v_license.public_reset_count, 0) - 1) * coalesce(v_settings.free_next_step_penalty_pct, 0)
    end;
  else
    v_penalty_pct := case
      when coalesce(v_license.public_reset_count, 0) = 0 then coalesce(v_settings.paid_first_penalty_pct, 0)
      when coalesce(v_license.public_reset_count, 0) = 1 then coalesce(v_settings.paid_next_penalty_pct, 20)
      else coalesce(v_settings.paid_next_penalty_pct, 20)
        + greatest(0, coalesce(v_license.public_reset_count, 0) - 1) * coalesce(v_settings.paid_next_step_penalty_pct, 0)
    end;
  end if;

  v_penalty_pct := greatest(0, least(100, coalesce(v_penalty_pct, 0)));

  if coalesce(v_settings.public_reset_cancel_after_count, 0) > 0
    and v_next_public_reset_count >= coalesce(v_settings.public_reset_cancel_after_count, 0) then
    v_hard_expire := true;
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

  if not v_hard_expire then
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
  else
    v_new_expires_at := v_now;
    v_new_duration_seconds := 0;
    v_penalty_seconds := null;
  end if;

  delete from public.license_devices
  where license_id = v_license.id;

  get diagnostics v_devices_removed = row_count;

  update public.licenses
  set
    expires_at = case
      when v_hard_expire then v_now
      when v_effective_expires_at is not null then v_new_expires_at
      else v_license.expires_at
    end,
    duration_seconds = case
      when v_hard_expire then 0
      when v_new_duration_seconds is not null then least(v_new_duration_seconds, 2147483647)::integer
      else v_license.duration_seconds
    end,
    duration_days = case
      when v_hard_expire then null
      when v_new_duration_seconds is not null then null
      else v_license.duration_days
    end,
    public_reset_count = v_next_public_reset_count
  where id = v_license.id;

  v_status := public.license_public_status(
    v_license.deleted_at,
    v_license.is_active,
    case when v_hard_expire then v_now when v_effective_expires_at is not null then v_new_expires_at else v_license.expires_at end,
    v_license.start_on_first_use,
    v_license.starts_on_first_use,
    v_license.first_used_at,
    v_license.activated_at,
    case when v_hard_expire then 0 when v_new_duration_seconds is not null then least(v_new_duration_seconds, 2147483647)::integer else v_license.duration_seconds end,
    nullif(case when v_hard_expire then null when v_new_duration_seconds is not null then null else v_license.duration_days end, 0),
    v_now
  );

  insert into public.audit_logs(action, license_key, detail)
  values (
    'PUBLIC_RESET',
    v_license.key,
    jsonb_build_object(
      'license_id', v_license.id,
      'key_kind', case when v_is_free then 'FREE' else 'PAID' end,
      'penalty_pct', case when v_hard_expire then null else v_penalty_pct end,
      'penalty_seconds', case when v_hard_expire then null else v_penalty_seconds end,
      'devices_removed', v_devices_removed,
      'public_reset_count_after', v_next_public_reset_count,
      'not_started_duration_after_seconds', case when v_hard_expire then 0 else v_new_duration_seconds end,
      'hard_expired', v_hard_expire
    )
  );

  return jsonb_build_object(
    'ok', true,
    'msg', 'RESET_OK',
    'key', v_license.key,
    'key_kind', case when v_is_free then 'FREE' else 'PAID' end,
    'created_at', v_license.created_at,
    'expires_at', case
      when v_hard_expire then v_now
      when v_effective_expires_at is not null then v_new_expires_at
      else public.license_effective_expires_at(
        v_license.expires_at,
        v_license.start_on_first_use,
        v_license.starts_on_first_use,
        v_license.first_used_at,
        v_license.activated_at,
        case when v_new_duration_seconds is not null then least(v_new_duration_seconds, 2147483647)::integer else v_license.duration_seconds end,
        case when v_new_duration_seconds is not null then null else v_license.duration_days end
      )
    end,
    'remaining_seconds',
      case
        when v_hard_expire then 0
        when v_new_expires_at is not null then greatest(0, floor(extract(epoch from (v_new_expires_at - v_now)))::integer)
        when v_new_duration_seconds is not null then least(v_new_duration_seconds, 2147483647)::integer
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
    'public_reset_count', v_next_public_reset_count,
    'penalty_pct', case when v_hard_expire then null else v_penalty_pct end,
    'penalty_seconds', case when v_hard_expire then null else v_penalty_seconds end,
    'devices_removed', v_devices_removed,
    'public_reset_disabled', coalesce(v_license.public_reset_disabled, false),
    'next_reset_penalty_pct', case
      when coalesce(v_settings.public_reset_cancel_after_count, 0) > 0 and (v_next_public_reset_count + 1) >= coalesce(v_settings.public_reset_cancel_after_count, 0) then null
      when v_is_free then greatest(0, least(100, case when v_next_public_reset_count = 1 then coalesce(v_settings.free_next_penalty_pct, 50) when v_next_public_reset_count = 0 then coalesce(v_settings.free_first_penalty_pct, 50) else coalesce(v_settings.free_next_penalty_pct, 50) + greatest(0, v_next_public_reset_count - 1) * coalesce(v_settings.free_next_step_penalty_pct, 0) end))
      else greatest(0, least(100, case when v_next_public_reset_count = 1 then coalesce(v_settings.paid_next_penalty_pct, 20) when v_next_public_reset_count = 0 then coalesce(v_settings.paid_first_penalty_pct, 0) else coalesce(v_settings.paid_next_penalty_pct, 20) + greatest(0, v_next_public_reset_count - 1) * coalesce(v_settings.paid_next_step_penalty_pct, 0) end))
    end,
    'next_reset_will_expire', case
      when coalesce(v_settings.public_reset_cancel_after_count, 0) > 0 and (v_next_public_reset_count + 1) >= coalesce(v_settings.public_reset_cancel_after_count, 0) then true
      else false
    end,
    'public_reset_cancel_after_count', coalesce(v_settings.public_reset_cancel_after_count, 0),
    'hard_expired', v_hard_expire
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'msg', 'RESET_INTERNAL_ERROR',
      'db_code', SQLSTATE
    );
end;
$$;

revoke all on function public.public_reset_key(text) from public, anon, authenticated;
grant execute on function public.public_reset_key(text) to service_role;

commit;
