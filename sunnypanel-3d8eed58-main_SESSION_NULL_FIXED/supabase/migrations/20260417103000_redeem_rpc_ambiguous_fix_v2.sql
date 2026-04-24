begin;

drop function if exists public.server_app_reserve_redeem_use(text, uuid, text, text, text, jsonb);

create function public.server_app_reserve_redeem_use(
  p_app_code text,
  p_redeem_key_id uuid,
  p_account_ref text default null,
  p_device_id text default null,
  p_ip_hash text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  use_id uuid,
  redeemed_count integer,
  key_limit integer,
  account_used integer,
  device_used integer,
  ip_used integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key public.server_app_redeem_keys%rowtype;
  v_account_used integer := 0;
  v_device_used integer := 0;
  v_ip_used integer := 0;
  v_use_id uuid;
  v_redeemed_count integer := 0;
begin
  select *
    into v_key
  from public.server_app_redeem_keys
  where server_app_redeem_keys.id = p_redeem_key_id
    and server_app_redeem_keys.app_code = p_app_code
  for update;

  if not found then
    raise exception 'REDEEM_KEY_NOT_FOUND' using errcode = 'P0001';
  end if;

  if coalesce(v_key.enabled, true) is not true then
    raise exception 'REDEEM_KEY_DISABLED' using errcode = 'P0001';
  end if;

  if v_key.blocked_at is not null then
    raise exception 'REDEEM_KEY_BLOCKED' using errcode = 'P0001';
  end if;

  if v_key.starts_at is not null and v_key.starts_at > now() then
    raise exception 'REDEEM_KEY_NOT_STARTED' using errcode = 'P0001';
  end if;

  if v_key.expires_at is not null and v_key.expires_at <= now() then
    raise exception 'REDEEM_KEY_EXPIRED' using errcode = 'P0001';
  end if;

  if coalesce(v_key.max_redemptions, 1) <= coalesce(v_key.redeemed_count, 0) then
    raise exception 'REDEEM_KEY_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  if coalesce(v_key.max_redeems_per_account, 0) > 0 and nullif(trim(coalesce(p_account_ref, '')), '') is not null then
    select count(*)::integer into v_account_used
    from public.server_app_redeem_key_uses uses_account
    where uses_account.redeem_key_id = p_redeem_key_id
      and uses_account.account_ref = p_account_ref;
    if v_account_used >= v_key.max_redeems_per_account then
      raise exception 'REDEEM_KEY_ACCOUNT_LIMIT_REACHED' using errcode = 'P0001';
    end if;
  end if;

  if coalesce(v_key.max_redeems_per_device, 0) > 0 and nullif(trim(coalesce(p_device_id, '')), '') is not null then
    select count(*)::integer into v_device_used
    from public.server_app_redeem_key_uses uses_device
    where uses_device.redeem_key_id = p_redeem_key_id
      and uses_device.device_id = p_device_id;
    if v_device_used >= v_key.max_redeems_per_device then
      raise exception 'REDEEM_KEY_DEVICE_LIMIT_REACHED' using errcode = 'P0001';
    end if;
  end if;

  if coalesce(v_key.max_redeems_per_ip, 0) > 0 and nullif(trim(coalesce(p_ip_hash, '')), '') is not null then
    select count(*)::integer into v_ip_used
    from public.server_app_redeem_key_uses uses_ip
    where uses_ip.redeem_key_id = p_redeem_key_id
      and uses_ip.ip_hash = p_ip_hash;
    if v_ip_used >= v_key.max_redeems_per_ip then
      raise exception 'REDEEM_KEY_IP_LIMIT_REACHED' using errcode = 'P0001';
    end if;
  end if;

  insert into public.server_app_redeem_key_uses (
    app_code,
    redeem_key_id,
    account_ref,
    device_id,
    ip_hash,
    metadata
  ) values (
    p_app_code,
    p_redeem_key_id,
    nullif(trim(coalesce(p_account_ref, '')), ''),
    nullif(trim(coalesce(p_device_id, '')), ''),
    nullif(trim(coalesce(p_ip_hash, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning server_app_redeem_key_uses.id into v_use_id;

  update public.server_app_redeem_keys as rk
  set redeemed_count = coalesce(rk.redeemed_count, 0) + 1,
      last_redeemed_at = now(),
      updated_at = now(),
      metadata = coalesce(rk.metadata, '{}'::jsonb) || jsonb_build_object(
        'last_account_ref', nullif(trim(coalesce(p_account_ref, '')), ''),
        'last_device_id', nullif(trim(coalesce(p_device_id, '')), ''),
        'last_ip_hash', nullif(trim(coalesce(p_ip_hash, '')), ''),
        'last_redeemed_at', now()
      )
  where rk.id = p_redeem_key_id
  returning rk.redeemed_count into v_redeemed_count;

  return query
  select v_use_id,
         v_redeemed_count,
         coalesce(v_key.max_redemptions, 1),
         v_account_used + case when nullif(trim(coalesce(p_account_ref, '')), '') is null then 0 else 1 end,
         v_device_used + case when nullif(trim(coalesce(p_device_id, '')), '') is null then 0 else 1 end,
         v_ip_used + case when nullif(trim(coalesce(p_ip_hash, '')), '') is null then 0 else 1 end;
end;
$$;

commit;
