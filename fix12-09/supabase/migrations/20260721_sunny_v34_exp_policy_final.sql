begin;

-- Final V34 EXP policy:
-- 1) Build deadlines are absolute, not rolling.
-- 2) Any policy change advances exp_generation exactly once.
-- 3) exp_generation can never move backwards.
-- 4) Only service_role may call the policy administration RPC.

create or replace function public.guard_security_client_build_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
    v_policy_changed boolean;
begin
    if new.build_id is distinct from old.build_id then
        raise exception 'BUILD_ID_IMMUTABLE';
    end if;

    if new.expires_at <= new.not_before then
        raise exception 'BUILD_EXPIRY_MUST_BE_AFTER_NOT_BEFORE';
    end if;

    if new.exp_generation < old.exp_generation then
        raise exception 'EXP_GENERATION_ROLLBACK';
    end if;

    v_policy_changed :=
        new.product_id is distinct from old.product_id
        or new.is_active is distinct from old.is_active
        or new.not_before is distinct from old.not_before
        or new.expires_at is distinct from old.expires_at;

    if v_policy_changed then
        if new.exp_generation = old.exp_generation then
            new.exp_generation := old.exp_generation + 1;
        elsif new.exp_generation <> old.exp_generation + 1 then
            raise exception 'EXP_GENERATION_MUST_ADVANCE_EXACTLY_ONCE';
        end if;
    elsif new.exp_generation <> old.exp_generation then
        raise exception 'EXP_GENERATION_CHANGE_WITHOUT_POLICY_CHANGE';
    end if;

    new.updated_at := now();
    return new;
end;
$function$;

drop trigger if exists trg_guard_security_client_build_policy
    on public.security_client_builds;

create trigger trg_guard_security_client_build_policy
before update on public.security_client_builds
for each row
execute function public.guard_security_client_build_policy();

create or replace function public.set_sunny_build_policy(
    p_build_id text,
    p_expected_exp_generation bigint,
    p_new_not_before timestamptz default null,
    p_new_expires_at timestamptz default null,
    p_new_is_active boolean default null
)
returns table (
    build_id text,
    product_id text,
    is_active boolean,
    not_before_epoch bigint,
    expires_at_epoch bigint,
    exp_generation bigint
)
language plpgsql
security definer
set search_path = public
as $function$
declare
    v_current public.security_client_builds%rowtype;
    v_not_before timestamptz;
    v_expires_at timestamptz;
    v_is_active boolean;
begin
    if p_build_id is null or btrim(p_build_id) = '' then
        raise exception 'BUILD_ID_REQUIRED';
    end if;

    if p_expected_exp_generation is null or p_expected_exp_generation <= 0 then
        raise exception 'EXPECTED_EXP_GENERATION_REQUIRED';
    end if;

    select *
      into v_current
      from public.security_client_builds
     where public.security_client_builds.build_id = p_build_id
     for update;

    if not found then
        raise exception 'BUILD_NOT_FOUND';
    end if;

    if v_current.exp_generation <> p_expected_exp_generation then
        raise exception 'EXP_GENERATION_CONFLICT';
    end if;

    v_not_before := coalesce(p_new_not_before, v_current.not_before);
    v_expires_at := coalesce(p_new_expires_at, v_current.expires_at);
    v_is_active := coalesce(p_new_is_active, v_current.is_active);

    if v_expires_at <= v_not_before then
        raise exception 'BUILD_EXPIRY_MUST_BE_AFTER_NOT_BEFORE';
    end if;

    if v_not_before is not distinct from v_current.not_before
       and v_expires_at is not distinct from v_current.expires_at
       and v_is_active is not distinct from v_current.is_active then
        return query
        select
            v_current.build_id,
            v_current.product_id,
            v_current.is_active,
            floor(extract(epoch from v_current.not_before))::bigint,
            floor(extract(epoch from v_current.expires_at))::bigint,
            v_current.exp_generation;
        return;
    end if;

    update public.security_client_builds
       set not_before = v_not_before,
           expires_at = v_expires_at,
           is_active = v_is_active
     where public.security_client_builds.build_id = p_build_id;

    return query
    select
        b.build_id,
        b.product_id,
        b.is_active,
        floor(extract(epoch from b.not_before))::bigint,
        floor(extract(epoch from b.expires_at))::bigint,
        b.exp_generation
      from public.security_client_builds as b
     where b.build_id = p_build_id;
end;
$function$;

revoke all on function public.set_sunny_build_policy(text,bigint,timestamptz,timestamptz,boolean)
    from public;
revoke execute on function public.set_sunny_build_policy(text,bigint,timestamptz,timestamptz,boolean)
    from anon, authenticated;
grant execute on function public.set_sunny_build_policy(text,bigint,timestamptz,timestamptz,boolean)
    to service_role;

notify pgrst, 'reload schema';
commit;
