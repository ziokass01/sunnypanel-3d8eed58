begin;

drop function if exists public.set_sunny_build_policy(
    text,
    bigint,
    timestamptz,
    timestamptz,
    boolean
);

drop trigger if exists trg_guard_security_client_build_policy
    on public.security_client_builds;

drop function if exists public.guard_security_client_build_policy();

notify pgrst, 'reload schema';
commit;
