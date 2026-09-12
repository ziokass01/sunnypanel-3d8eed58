-- Keep the admin -20% action atomic and clear IP bindings together with
-- devices.  Otherwise a new device could still be rejected by an old IP row.
begin;

create or replace function public.admin_reset_devices_penalty(p_license_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_license public.licenses%rowtype;
  v_now timestamptz := clock_timestamp();
  v_effective_expires timestamptz;
  v_new_expires timestamptz;
  v_remaining_seconds bigint := 0;
  v_penalty_pct integer := 0;
  v_penalty_seconds bigint := 0;
  v_new_duration_seconds bigint := null;
  v_devices_removed integer := 0;
  v_ips_removed integer := 0;
begin
  if v_uid is null or not public.has_role(v_uid, 'admin') then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select * into v_license
  from public.licenses
  where id = p_license_id
  for update;
  if not found then raise exception 'LICENSE_NOT_FOUND'; end if;
  if v_license.deleted_at is not null then raise exception 'LICENSE_DELETED'; end if;

  v_penalty_pct := case when coalesce(v_license.admin_reset_count, 0) = 0 then 0 else 20 end;
  v_effective_expires := public.license_effective_expires_at(
    v_license.expires_at,
    v_license.start_on_first_use,
    v_license.starts_on_first_use,
    v_license.first_used_at,
    v_license.activated_at,
    v_license.duration_seconds,
    v_license.duration_days
  );
  v_remaining_seconds := greatest(0, coalesce(public.license_remaining_seconds(
    v_license.expires_at,
    v_license.start_on_first_use,
    v_license.starts_on_first_use,
    v_license.first_used_at,
    v_license.activated_at,
    v_license.duration_seconds,
    v_license.duration_days,
    v_now
  ), 0));
  v_penalty_seconds := floor(v_remaining_seconds * v_penalty_pct / 100.0)::bigint;

  if v_effective_expires is not null then
    v_new_expires := greatest(v_now, v_effective_expires - v_penalty_seconds * interval '1 second');
  elsif (coalesce(v_license.start_on_first_use, false) or coalesce(v_license.starts_on_first_use, false))
        and coalesce(v_license.first_used_at, v_license.activated_at) is null then
    v_new_duration_seconds := greatest(0, v_remaining_seconds - v_penalty_seconds);
  end if;

  delete from public.license_devices where license_id = p_license_id;
  get diagnostics v_devices_removed = row_count;
  delete from public.license_ip_bindings where license_id = p_license_id;
  get diagnostics v_ips_removed = row_count;

  update public.licenses
  set expires_at = case when v_effective_expires is not null then v_new_expires else expires_at end,
      duration_seconds = case when v_new_duration_seconds is not null then v_new_duration_seconds::integer else duration_seconds end,
      duration_days = case when v_new_duration_seconds is not null then null else duration_days end,
      admin_reset_count = coalesce(admin_reset_count, 0) + 1
  where id = p_license_id;

  perform public.log_audit(
    'RESET_DEVICES_PENALTY',
    v_license.key,
    jsonb_build_object(
      'license_id', p_license_id,
      'penalty_pct', v_penalty_pct,
      'penalty_seconds', v_penalty_seconds,
      'devices_removed', v_devices_removed,
      'ips_removed', v_ips_removed,
      'admin_reset_count_after', coalesce(v_license.admin_reset_count, 0) + 1,
      'source', 'PANEL_ATOMIC'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'msg', 'RESET_OK',
    'key', v_license.key,
    'penalty_pct', v_penalty_pct,
    'penalty_seconds', v_penalty_seconds,
    'devices_removed', v_devices_removed,
    'ips_removed', v_ips_removed,
    'remaining_seconds', case
      when v_new_expires is not null then greatest(0, floor(extract(epoch from (v_new_expires - v_now)))::bigint)
      when v_new_duration_seconds is not null then v_new_duration_seconds
      else null
    end,
    'admin_reset_count', coalesce(v_license.admin_reset_count, 0) + 1
  );
end;
$$;

grant execute on function public.admin_reset_devices_penalty(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
