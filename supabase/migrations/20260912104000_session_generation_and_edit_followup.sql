-- Follow-up hardening for the 2026-09-12 Sunny V34 lifecycle patch.
-- 1) Make pgcrypto visible inside SECURITY DEFINER helpers.
-- 2) Recover any device whose server generation had already fallen behind a
--    client-side signed-lease anchor before the high-water migration existed.
-- 3) Make started-countdown Edit mean "remaining time from save moment" and
--    avoid silently extending a key when only note/device fields are edited.
begin;

create extension if not exists pgcrypto;

create or replace function public.guard_license_session_generation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_key_hash text;
  v_device_hash text := encode(digest(trim(new.device_id), 'sha256'), 'hex');
  v_floor bigint := 0;
  v_recovery_floor bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  if tg_op = 'UPDATE' then
    if new.license_id is distinct from old.license_id
       or new.device_id is distinct from old.device_id then
      raise exception 'DEVICE_IDENTITY_IMMUTABLE';
    end if;

    if coalesce(new.session_generation, 0) < coalesce(old.session_generation, 0) then
      raise exception 'SESSION_GENERATION_ROLLBACK';
    end if;

    if coalesce(new.session_generation, 0) = coalesce(old.session_generation, 0) then
      return new;
    end if;
  end if;

  select encode(digest(key, 'sha256'), 'hex')
    into v_key_hash
  from public.licenses
  where id = new.license_id;

  if v_key_hash is null then
    raise exception 'LICENSE_NOT_FOUND';
  end if;

  if tg_op = 'INSERT' then
    select generation
      into v_floor
    from public.license_session_high_water
    where key_hash = v_key_hash
      and device_hash = v_device_hash
    for update;

    -- A recreated row must be above both the persisted ledger and any legacy
    -- client anchor that may have survived an older broken reset. Epoch-ms is
    -- far above the old small counter while still exactly representable by the
    -- native/JSON number path.
    new.session_generation := greatest(
      coalesce(new.session_generation, 0),
      coalesce(v_floor, 0),
      v_recovery_floor
    );
  else
    insert into public.license_session_high_water(key_hash, device_hash, generation, updated_at)
    values (v_key_hash, v_device_hash, greatest(0, coalesce(new.session_generation, 0)), now())
    on conflict (key_hash, device_hash) do update
      set generation = greatest(public.license_session_high_water.generation, excluded.generation),
          updated_at = now();
  end if;

  return new;
end;
$$;

create or replace function public.bump_license_sessions_on_activation_reset()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_recovery_floor bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  if (coalesce(old.start_on_first_use, false) or coalesce(old.starts_on_first_use, false))
     and (old.first_used_at is not null or old.activated_at is not null)
     and new.first_used_at is null
     and new.activated_at is null then
    update public.license_devices
    set session_generation = greatest(coalesce(session_generation, 0) + 1, v_recovery_floor)
    where license_id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.admin_repair_license_session(
  p_license_id uuid,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_key_hash text;
  v_device_hash text;
  v_previous bigint := 0;
  v_floor bigint;
  v_binding_present boolean := false;
begin
  if v_uid is null or not public.has_role(v_uid, 'admin') then
    raise exception 'NOT_AUTHORIZED';
  end if;
  if nullif(trim(p_device_id), '') is null then
    raise exception 'DEVICE_ID_REQUIRED';
  end if;

  select key into v_key
  from public.licenses
  where id = p_license_id
  for update;
  if not found then
    raise exception 'LICENSE_NOT_FOUND';
  end if;

  v_key_hash := encode(digest(v_key, 'sha256'), 'hex');
  v_device_hash := encode(digest(trim(p_device_id), 'sha256'), 'hex');

  select coalesce(generation, 0)
    into v_previous
  from public.license_session_high_water
  where key_hash = v_key_hash
    and device_hash = v_device_hash
  for update;

  v_floor := greatest(v_previous, floor(extract(epoch from clock_timestamp()) * 1000)::bigint);

  insert into public.license_session_high_water(key_hash, device_hash, generation, updated_at)
  values (v_key_hash, v_device_hash, v_floor, now())
  on conflict (key_hash, device_hash) do update
    set generation = greatest(public.license_session_high_water.generation, excluded.generation),
        updated_at = now();

  update public.license_devices
  set session_generation = greatest(coalesce(session_generation, 0), v_floor)
  where license_id = p_license_id
    and device_id = trim(p_device_id);
  v_binding_present := found;

  perform public.log_audit(
    'UPDATE',
    v_key,
    jsonb_build_object(
      'license_id', p_license_id,
      'device_id', trim(p_device_id),
      'previous_floor', v_previous,
      'new_floor', v_floor,
      'binding_present', v_binding_present,
      'source', 'REPAIR_SESSION_GENERATION'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'generation_floor', v_floor,
    'binding_present', v_binding_present
  );
end;
$$;

-- One-time automatic repair for bindings that may already be below a local
-- anchor. The guard trigger mirrors the raised value into the high-water ledger.
update public.license_devices
set session_generation = greatest(
      coalesce(session_generation, 0),
      floor(extract(epoch from clock_timestamp()) * 1000)::bigint
    );

create or replace function public.panel_mutate_license(
  p_license_id uuid,
  p_action text,
  p_patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action, ''));
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
  v_now timestamptz := clock_timestamp();
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
        'devices_preserved', true,
        'session_floor_recovered', true
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
        -- Before first use, duration is only the countdown template.
        v_new_expires := null;
      else
        -- Once started, Edit means the remaining time requested by the
        -- operator from the moment the save is committed.
        v_new_expires := v_now + (v_duration_seconds * interval '1 second');
      end if;
    else
      v_new_expires := v_requested_expires;
    end if;

    if v_started_at is not null and v_new_expires is null then
      raise exception 'CANNOT_CLEAR_EXPIRES';
    end if;
    if v_started_at is not null and v_new_expires <= v_now then
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
      'duration_edit_mode', case
        when v_countdown and v_started_at is not null and v_duration_touched then 'REMAINING_FROM_SAVE_TIME'
        when v_countdown and v_duration_touched then 'COUNTDOWN_TEMPLATE'
        else 'UNCHANGED'
      end,
      'source', 'PANEL_ATOMIC'
    )
  );

  return jsonb_build_object('ok', true, 'action', v_action, 'license_id', p_license_id, 'expires_at', v_new_expires);
end;
$$;

revoke all on function public.guard_license_session_generation() from public, anon, authenticated;
revoke all on function public.bump_license_sessions_on_activation_reset() from public, anon, authenticated;
revoke all on function public.admin_repair_license_session(uuid, text) from public, anon;
grant execute on function public.admin_repair_license_session(uuid, text) to authenticated;
revoke all on function public.panel_mutate_license(uuid, text, jsonb) from public, anon;
grant execute on function public.panel_mutate_license(uuid, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
