begin;

create table if not exists public.server_app_redeem_key_uses (
  id uuid primary key default gen_random_uuid(),
  app_code text not null,
  redeem_key_id uuid not null references public.server_app_redeem_keys(id) on delete cascade,
  account_ref text null,
  device_id text null,
  ip_hash text null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_server_app_redeem_key_uses_key_created
  on public.server_app_redeem_key_uses(redeem_key_id, created_at desc);
create index if not exists idx_server_app_redeem_key_uses_key_account
  on public.server_app_redeem_key_uses(redeem_key_id, account_ref, created_at desc)
  where account_ref is not null;
create index if not exists idx_server_app_redeem_key_uses_key_device
  on public.server_app_redeem_key_uses(redeem_key_id, device_id, created_at desc)
  where device_id is not null;
create index if not exists idx_server_app_redeem_key_uses_key_ip
  on public.server_app_redeem_key_uses(redeem_key_id, ip_hash, created_at desc)
  where ip_hash is not null;

create or replace function public.server_app_reserve_redeem_use(
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
begin
  select *
    into v_key
  from public.server_app_redeem_keys
  where id = p_redeem_key_id
    and app_code = p_app_code
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
    from public.server_app_redeem_key_uses
    where redeem_key_id = p_redeem_key_id
      and account_ref = p_account_ref;
    if v_account_used >= v_key.max_redeems_per_account then
      raise exception 'REDEEM_KEY_ACCOUNT_LIMIT_REACHED' using errcode = 'P0001';
    end if;
  end if;

  if coalesce(v_key.max_redeems_per_device, 0) > 0 and nullif(trim(coalesce(p_device_id, '')), '') is not null then
    select count(*)::integer into v_device_used
    from public.server_app_redeem_key_uses
    where redeem_key_id = p_redeem_key_id
      and device_id = p_device_id;
    if v_device_used >= v_key.max_redeems_per_device then
      raise exception 'REDEEM_KEY_DEVICE_LIMIT_REACHED' using errcode = 'P0001';
    end if;
  end if;

  if coalesce(v_key.max_redeems_per_ip, 0) > 0 and nullif(trim(coalesce(p_ip_hash, '')), '') is not null then
    select count(*)::integer into v_ip_used
    from public.server_app_redeem_key_uses
    where redeem_key_id = p_redeem_key_id
      and ip_hash = p_ip_hash;
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
  returning id into v_use_id;

  update public.server_app_redeem_keys
  set redeemed_count = coalesce(redeemed_count, 0) + 1,
      last_redeemed_at = now(),
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_account_ref', nullif(trim(coalesce(p_account_ref, '')), ''),
        'last_device_id', nullif(trim(coalesce(p_device_id, '')), ''),
        'last_ip_hash', nullif(trim(coalesce(p_ip_hash, '')), ''),
        'last_redeemed_at', now()
      )
  where id = p_redeem_key_id;

  return query
  select v_use_id,
         coalesce(v_key.redeemed_count, 0) + 1,
         coalesce(v_key.max_redemptions, 1),
         v_account_used + case when nullif(trim(coalesce(p_account_ref, '')), '') is null then 0 else 1 end,
         v_device_used + case when nullif(trim(coalesce(p_device_id, '')), '') is null then 0 else 1 end,
         v_ip_used + case when nullif(trim(coalesce(p_ip_hash, '')), '') is null then 0 else 1 end;
end;
$$;

create or replace function public.server_app_release_redeem_use(
  p_use_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  select id, redeem_key_id
    into v_row
  from public.server_app_redeem_key_uses
  where id = p_use_id
  for update;

  if not found then
    return false;
  end if;

  delete from public.server_app_redeem_key_uses where id = p_use_id;

  update public.server_app_redeem_keys
  set redeemed_count = greatest(0, coalesce(redeemed_count, 0) - 1),
      updated_at = now()
  where id = v_row.redeem_key_id;

  return true;
end;
$$;

comment on table public.server_app_redeem_key_uses is 'One row per successful reserved redeem use. Used for per-account/device/ip limits.';
comment on function public.server_app_reserve_redeem_use(text, uuid, text, text, text, jsonb) is 'Atomically lock a redeem key, enforce per-key and per-subject limits, then reserve one use.';
comment on function public.server_app_release_redeem_use(uuid) is 'Compensating release when runtime redeem reservation succeeded but later steps failed.';

commit;
