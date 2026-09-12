begin;

create table if not exists public.security_client_builds (
    build_id text primary key,
    product_id text not null,
    is_active boolean not null default true,
    not_before timestamptz not null,
    expires_at timestamptz not null,
    exp_generation bigint not null default 1 check (exp_generation > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (expires_at > not_before)
);

alter table public.license_devices
    add column if not exists device_public_key_spki text,
    add column if not exists device_public_key_sha256 text,
    add column if not exists device_key_bound_at timestamptz,
    add column if not exists session_generation bigint not null default 0;

create index if not exists idx_license_devices_public_key_hash
    on public.license_devices(device_public_key_sha256)
    where device_public_key_sha256 is not null;

-- Running this migration starts the independent V34 build lease at deploy time.
insert into public.security_client_builds (
    build_id,
    product_id,
    is_active,
    not_before,
    expires_at,
    exp_generation,
    updated_at
)
values (
    'sunny-v34-ac-20260721',
    'sunny-free-fire',
    true,
    now() - interval '5 minutes',
    now() + interval '7 days',
    1,
    now()
)
on conflict (build_id)
do update set
    product_id = excluded.product_id,
    is_active = true,
    not_before = least(public.security_client_builds.not_before, excluded.not_before),
    expires_at = greatest(public.security_client_builds.expires_at, excluded.expires_at),
    exp_generation = greatest(public.security_client_builds.exp_generation, excluded.exp_generation),
    updated_at = now();

create or replace function public.issue_sunny_v34_lease(
    p_license_id uuid,
    p_device_id text,
    p_build_id text,
    p_product_id text
)
returns table (
    session_generation bigint,
    exp_generation bigint,
    build_not_before bigint,
    build_expires_at bigint
)
language plpgsql
security definer
set search_path = public
as $function$
declare
    v_build public.security_client_builds%rowtype;
    v_session_generation bigint;
begin
    select *
      into v_build
      from public.security_client_builds
     where build_id = p_build_id
       and product_id = p_product_id
       and is_active = true
     for update;

    if not found or now() < v_build.not_before or now() >= v_build.expires_at then
        raise exception 'BUILD_LEASE_INVALID';
    end if;

    update public.license_devices
       set session_generation = public.license_devices.session_generation + 1,
           last_seen = now()
     where license_id = p_license_id
       and device_id = p_device_id
     returning public.license_devices.session_generation
      into v_session_generation;

    if not found then
        raise exception 'DEVICE_LEASE_NOT_FOUND';
    end if;

    return query
    select
        v_session_generation,
        v_build.exp_generation,
        floor(extract(epoch from v_build.not_before))::bigint,
        floor(extract(epoch from v_build.expires_at))::bigint;
end;
$function$;

revoke all on function public.issue_sunny_v34_lease(uuid,text,text,text) from public;
revoke execute on function public.issue_sunny_v34_lease(uuid,text,text,text) from anon, authenticated;
grant execute on function public.issue_sunny_v34_lease(uuid,text,text,text) to service_role;

alter table public.security_client_builds enable row level security;
revoke all on table public.security_client_builds from anon, authenticated;
grant select, insert, update, delete on table public.security_client_builds to service_role;

notify pgrst, 'reload schema';
commit;
