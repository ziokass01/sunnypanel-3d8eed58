-- Atomic panel operations for license edit/reset/renew.
-- Keeping these transitions in one SECURITY DEFINER RPC prevents a refetch or
-- concurrent verify from leaving first-use and expiry fields half-updated.
begin;

create or replace function public.panel_mutate_license(
  p_license_id uuid,
  p_action text,
  p_patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action, '')));
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_license public.licenses%rowtype;
  v_key text;
  v_countdown boolean;
  v_started_at timestamptz;
  v_duration_touched boolean := false;
  v_duration_seconds bigint;
  v_duration_days integer;
  v_requested_expires timestamptz;
  v_new_expires timestamptz;
  v_max_devices integer;
  v_is_active boolean;
  v_note text;
  v_reset_devices boolean := false;
  v_devices_removed integer := 0;
  v_ips_removed integer := 0;
begin
  if v_uid is null or not public.can_manage_license(v_uid, p_license_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if v_action not in ('edit', 'reset_activation', 'renew') then
    raise exception 'INVALID_ACTION';
  end if;

  select * into v_license
  from public.licenses
  where id = p_license_id
  for update;
  if not found then
    raise exception 'LICENSE_NOT_FOUND';
  end if;

  v_key := v_license.key;
  v_countdown := coalesce(v_license.start_on_first_use, false)
    or coalesce(v_license.starts_on_first_use, false);
  v_started_at := coalesce(v_license.first_used_at, v_license.activated_at);

  if v_action = 'reset_activation' then
    if not v_countdown then
      raise exception 'NOT_COUNTDOWN_LICENSE';
    end if;

    update public.licenses
    set first_used_at = null,
        activated_at = null,
        expires_at = null
    where id = p_license_id;

    perform public.log_audit(
      'UPDATE',
      v_key,
      jsonb_build_object(
        'license_id', p_license_id,
        'source', 'RESET_ACTIVATION',
        'devices_preserved', true
      )
    );

    return jsonb_build_object('ok', true, 'action', v_action, 'license_id', p_license_id);
  end if;

  if v_action = 'renew' then
    if v_patch ? 'expires_at' then
      if v_patch->>'expires_at' is null or trim(v_patch->>'expires_at') = '' then
        v_requested_expires := null;
      else
        v_requested_expires := (v_patch->>'expires_at')::timestamptz;
      end if;
    else
      v_requested_expires := v_license.expires_at;
    end if;

    if v_countdown and v_started_at is not null and v_requested_expires is null then
      raise exception 'CANNOT_CLEAR_EXPIRES';
    end if;
    if v_countdown and v_started_at is null then
      -- A first-use countdown gets its expiry from verify-key; setting a
      -- calendar expiry here would create two competing sources of truth.
      v_new_expires := null;
    else
      v_new_expires := v_requested_expires;
    end if;

    if (v_patch ? 'reset_devices') then
      v_reset_devices := coalesce((v_patch->>'reset_devices')::boolean, false);
    end if;

    if v_reset_devices then
      delete from public.license_devices where license_id = p_license_id;
      get diagnostics v_devices_removed = row_count;
      delete from public.license_ip_bindings where license_id = p_license_id;
      get diagnostics v_ips_removed = row_count;
    end if;

    update public.licenses
    set deleted_at = null,
        is_active = true,
        expires_at = v_new_expires
    where id = p_license_id;

    perform public.log_audit(
      'REACTIVATE_RENEW',
      v_key,
      jsonb_build_object(
        'license_id', p_license_id,
        'expires_at', v_new_expires,
        'reset_devices', v_reset_devices,
        'devices_removed', v_devices_removed,
        'ips_removed', v_ips_removed,
        'source', 'PANEL_ATOMIC'
      )
    );

    return jsonb_build_object(
      'ok', true,
      'action', v_action,
      'license_id', p_license_id,
      'devices_removed', v_devices_removed,
      'ips_removed', v_ips_removed
    );
  end if;

  -- edit
  v_duration_touched := v_patch ? 'duration_seconds' or v_patch ? 'duration_days';
  if not v_countdown and v_duration_touched then
    raise exception 'DURATION_ONLY_FOR_COUNTDOWN';
  end if;

  v_max_devices := v_license.max_devices;
  if v_patch ? 'max_devices' then
    v_max_devices := (v_patch->>'max_devices')::integer;
    if v_max_devices < 1 then raise exception 'INVALID_MAX_DEVICES'; end if;
  end if;

  v_is_active := v_license.is_active;
  if v_patch ? 'is_active' then
    v_is_active := (v_patch->>'is_active')::boolean;
  end if;

  v_note := v_license.note;
  if v_patch ? 'note' then
    v_note := nullif(trim(coalesce(v_patch->>'note', '')), '');
  end if;

  if v_patch ? 'expires_at' then
    if v_patch->>'expires_at' is null or trim(v_patch->>'expires_at') = '' then
      v_requested_expires := null;
    else
      v_requested_expires := (v_patch->>'expires_at')::timestamptz;
    end if;
  else
    v_requested_expires := v_license.expires_at;
  end if;

  v_duration_seconds := public.license_effective_duration_seconds(
    v_license.duration_seconds,
    v_license.duration_days
  );
  v_duration_days := v_license.duration_days;

  if v_duration_touched then
    if v_patch ? 'duration_seconds' and v_patch->>'duration_seconds' is not null then
      v_duration_seconds := (v_patch->>'duration_seconds')::bigint;
      v_duration_days := null;
    elsif v_patch ? 'duration_days' and v_patch->>'duration_days' is not null then
      v_duration_days := (v_patch->>'duration_days')::integer;
      v_duration_seconds := (v_duration_days::bigint * 86400);
    else
      raise exception 'DURATION_REQUIRED';
    end if;

    if v_duration_seconds is null or v_duration_seconds <= 0 or v_duration_seconds > 2147483647 then
      raise exception 'INVALID_DURATION';
    end if;
  end if;

  if v_countdown then
    if v_duration_seconds is null or v_duration_seconds <= 0 then
      raise exception 'DURATION_REQUIRED';
    end if;

    if v_duration_touched then
      if v_started_at is null then
        v_new_expires := null;
      else
        v_new_expires := v_started_at + (v_duration_seconds * interval '1 second');
      end if;
    else
      v_new_expires := v_requested_expires;
    end if;

    if v_started_at is not null and v_new_expires is null then
      raise exception 'CANNOT_CLEAR_EXPIRES';
    end if;
    if v_started_at is not null and v_new_expires <= v_started_at then
      raise exception 'INVALID_EXPIRES';
    end if;
  else
    v_new_expires := v_requested_expires;
  end if;

  update public.licenses
  set max_devices = v_max_devices,
      is_active = v_is_active,
      note = v_note,
      expires_at = v_new_expires,
      duration_seconds = case when v_countdown and v_duration_touched then v_duration_seconds::integer else duration_seconds end,
      duration_days = case when v_countdown and v_duration_touched then v_duration_days else duration_days end
  where id = p_license_id;

  perform public.log_audit(
    'UPDATE',
    v_key,
    jsonb_build_object(
      'license_id', p_license_id,
      'patch', v_patch,
      'duration_changed_after_start', v_countdown and v_started_at is not null and v_duration_touched,
      'source', 'PANEL_ATOMIC'
    )
  );

  return jsonb_build_object('ok', true, 'action', v_action, 'license_id', p_license_id);
end;
$$;

create or replace function public.panel_remove_license_device(p_device_row_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_license_id uuid;
  v_device_id text;
begin
  select d.license_id, d.device_id, l.key
    into v_license_id, v_device_id, v_key
  from public.license_devices d
  join public.licenses l on l.id = d.license_id
  where d.id = p_device_row_id
  for update;

  if not found then raise exception 'DEVICE_NOT_FOUND'; end if;
  if v_uid is null or not public.can_manage_license(v_uid, v_license_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  delete from public.license_devices where id = p_device_row_id;
  perform public.log_audit(
    'UPDATE',
    v_key,
    jsonb_build_object(
      'license_id', v_license_id,
      'device_id', v_device_id,
      'source', 'REMOVE_DEVICE'
    )
  );
  return jsonb_build_object('ok', true, 'device_id', v_device_id);
end;
$$;

create or replace function public.panel_reset_license_devices(p_license_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_devices_removed integer := 0;
  v_ips_removed integer := 0;
begin
  if v_uid is null or not public.can_manage_license(v_uid, p_license_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select key into v_key from public.licenses where id = p_license_id for update;
  if not found then raise exception 'LICENSE_NOT_FOUND'; end if;

  delete from public.license_devices where license_id = p_license_id;
  get diagnostics v_devices_removed = row_count;
  delete from public.license_ip_bindings where license_id = p_license_id;
  get diagnostics v_ips_removed = row_count;

  perform public.log_audit(
    'RESET_DEVICES',
    v_key,
    jsonb_build_object(
      'license_id', p_license_id,
      'devices_removed', v_devices_removed,
      'ips_removed', v_ips_removed,
      'source', 'PANEL_ATOMIC'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'devices_removed', v_devices_removed,
    'ips_removed', v_ips_removed
  );
end;
$$;

revoke all on function public.panel_mutate_license(uuid, text, jsonb) from public, anon;
revoke all on function public.panel_remove_license_device(uuid) from public, anon;
revoke all on function public.panel_reset_license_devices(uuid) from public, anon;
grant execute on function public.panel_mutate_license(uuid, text, jsonb) to authenticated;
grant execute on function public.panel_remove_license_device(uuid) to authenticated;
grant execute on function public.panel_reset_license_devices(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
