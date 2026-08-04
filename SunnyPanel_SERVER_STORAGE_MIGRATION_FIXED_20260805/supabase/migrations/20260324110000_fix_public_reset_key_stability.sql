begin;

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

  v_penalty_pct := greatest(0, least(100, coalesce(v_penalty_pct, 0)));

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
      when v_new_duration_seconds is not null then least(v_new_duration_seconds, 2147483647)::integer
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
    case when v_new_duration_seconds is not null then least(v_new_duration_seconds, 2147483647)::integer else v_license.duration_seconds end,
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
        case when v_new_duration_seconds is not null then least(v_new_duration_seconds, 2147483647)::integer else v_license.duration_seconds end,
        case when v_new_duration_seconds is not null then null else v_license.duration_days end
      )
    end,
    'remaining_seconds',
      case
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
    'public_reset_count', coalesce(v_license.public_reset_count, 0) + 1,
    'penalty_pct', v_penalty_pct,
    'penalty_seconds', v_penalty_seconds,
    'devices_removed', v_devices_removed
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
