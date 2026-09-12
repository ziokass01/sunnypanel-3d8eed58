-- Preserve Sunny V34 session generations across device resets/rebinds.
-- The native client stores a signed-lease high-water mark locally.  A
-- license_devices row must therefore never be able to restart at generation 0
-- just because the panel removed and recreated the row.
begin;

create extension if not exists pgcrypto;

alter table public.license_devices
  add column if not exists session_generation bigint not null default 0;

create table if not exists public.license_session_high_water (
  key_hash text not null,
  device_hash text not null,
  generation bigint not null default 0 check (generation >= 0),
  updated_at timestamptz not null default now(),
  primary key (key_hash, device_hash)
);

alter table public.license_session_high_water enable row level security;
revoke all on public.license_session_high_water from public, anon, authenticated;

-- Seed the ledger before installing the guard.  It intentionally has no FK to
-- license_devices because the latter is a replaceable binding row.
insert into public.license_session_high_water (key_hash, device_hash, generation)
select
  encode(digest(l.key, 'sha256'), 'hex'),
  encode(digest(d.device_id, 'sha256'), 'hex'),
  greatest(0, coalesce(d.session_generation, 0))
from public.license_devices d
join public.licenses l on l.id = d.license_id
on conflict (key_hash, device_hash) do update
set generation = greatest(public.license_session_high_water.generation, excluded.generation),
    updated_at = now();

create or replace function public.guard_license_session_generation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key_hash text;
  v_device_hash text := encode(digest(trim(new.device_id), 'sha256'), 'hex');
  v_floor bigint := 0;
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

    new.session_generation := greatest(coalesce(new.session_generation, 0), coalesce(v_floor, 0));
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

drop trigger if exists trg_guard_license_session_generation on public.license_devices;
create trigger trg_guard_license_session_generation
before insert or update of session_generation, license_id, device_id
on public.license_devices
for each row
execute function public.guard_license_session_generation();

-- Reset activation invalidates previously issued leases while keeping the
-- generation strictly above the local client anchor.
create or replace function public.bump_license_sessions_on_activation_reset()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (coalesce(old.start_on_first_use, false) or coalesce(old.starts_on_first_use, false))
     and (old.first_used_at is not null or old.activated_at is not null)
     and new.first_used_at is null
     and new.activated_at is null then
    update public.license_devices
    set session_generation = coalesce(session_generation, 0) + 1,
        last_seen = now()
    where license_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bump_license_sessions_on_activation_reset on public.licenses;
create trigger trg_bump_license_sessions_on_activation_reset
after update of first_used_at, activated_at, expires_at
on public.licenses
for each row
execute function public.bump_license_sessions_on_activation_reset();

-- One-time repair for bindings that were already rejected with
-- SIGNED_LEASE_PERSISTENT_ROLLBACK.  The floor is never lowered.  If the
-- panel already deleted the binding, the next verify adopts this ledger row.
create or replace function public.admin_repair_license_session(
  p_license_id uuid,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
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

  -- Milliseconds are far above the normal per-device counter while remaining
  -- exactly representable in the client JSON number range.
  v_floor := greatest(v_previous, floor(extract(epoch from clock_timestamp()) * 1000)::bigint);

  insert into public.license_session_high_water(key_hash, device_hash, generation, updated_at)
  values (v_key_hash, v_device_hash, v_floor, now())
  on conflict (key_hash, device_hash) do update
    set generation = greatest(public.license_session_high_water.generation, excluded.generation),
        updated_at = now();

  update public.license_devices
  set session_generation = greatest(coalesce(session_generation, 0), v_floor),
      last_seen = now()
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

revoke all on function public.guard_license_session_generation() from public, anon, authenticated;
revoke all on function public.bump_license_sessions_on_activation_reset() from public, anon, authenticated;
revoke all on function public.admin_repair_license_session(uuid, text) from public, anon;
grant execute on function public.admin_repair_license_session(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
