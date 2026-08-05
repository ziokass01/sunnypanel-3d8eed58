-- Safe physical compaction for public.audit_logs on the live SunnyPanel server.
--
-- This migration only installs a guarded maintenance function. It does NOT run
-- the compaction automatically, because the operation briefly takes an
-- ACCESS EXCLUSIVE lock on audit_logs. Run it manually during low traffic:
--
--   select public.sunny_compact_audit_logs_safe(3);
--
-- Safety contract:
--   * Never changes public.licenses, license_devices, license_ip_bindings,
--     issued keys, key expiration, activation state, verify counters, users,
--     wallets or entitlements.
--   * Preserves every PUBLIC_RESET, RESET_DEVICES and RESET_DEVICES_PENALTY row.
--     These rows remain available to legacy reset-count/penalty code, including
--     AI redeem keys which do not store the count in public.licenses.
--   * Preserves all audit rows newer than p_keep_days.
--   * Refuses to run if another table has a foreign key to audit_logs.
--   * Keeps the existing table, indexes, RLS policies and grants intact.

create or replace function public.sunny_compact_audit_logs_safe(
  p_keep_days integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_keep_days integer := greatest(1, least(coalesce(p_keep_days, 3), 30));
  v_before_rows bigint;
  v_after_rows bigint;
  v_reset_rows bigint;
  v_before_size bigint;
  v_after_size bigint;
  v_started_at timestamptz := clock_timestamp();
begin
  if to_regclass('public.audit_logs') is null then
    return jsonb_build_object('ok', false, 'msg', 'AUDIT_LOGS_NOT_FOUND');
  end if;

  -- A future schema change must be reviewed instead of silently cascading.
  if exists (
    select 1
    from pg_constraint
    where contype = 'f'
      and confrelid = 'public.audit_logs'::regclass
  ) then
    raise exception 'AUDIT_LOGS_HAS_REFERENCING_FOREIGN_KEY';
  end if;

  perform set_config('lock_timeout', '5s', true);
  perform set_config('statement_timeout', '180s', true);

  select count(*), pg_total_relation_size('public.audit_logs'::regclass)
    into v_before_rows, v_before_size
  from public.audit_logs;

  -- Lock before taking the keep-set snapshot so no audit row can be inserted
  -- between the snapshot and TRUNCATE.
  lock table public.audit_logs in access exclusive mode;

  drop table if exists pg_temp.sunny_audit_logs_keep;
  create temporary table sunny_audit_logs_keep
  (like public.audit_logs including defaults)
  on commit drop;

  insert into sunny_audit_logs_keep (id, action, license_key, created_at, detail)
  select id, action, license_key, created_at, detail
  from public.audit_logs
  where created_at >= now() - make_interval(days => v_keep_days)
     or action in ('PUBLIC_RESET', 'RESET_DEVICES', 'RESET_DEVICES_PENALTY');

  select count(*) filter (
           where action in ('PUBLIC_RESET', 'RESET_DEVICES', 'RESET_DEVICES_PENALTY')
         )
    into v_reset_rows
  from sunny_audit_logs_keep;

  truncate table public.audit_logs;

  insert into public.audit_logs (id, action, license_key, created_at, detail)
  select id, action, license_key, created_at, detail
  from sunny_audit_logs_keep
  order by created_at;

  get diagnostics v_after_rows = row_count;
  analyze public.audit_logs;
  v_after_size := pg_total_relation_size('public.audit_logs'::regclass);

  return jsonb_build_object(
    'ok', true,
    'keep_days', v_keep_days,
    'before_rows', v_before_rows,
    'after_rows', v_after_rows,
    'removed_rows', greatest(0, v_before_rows - v_after_rows),
    'preserved_reset_rows', v_reset_rows,
    'before_bytes', v_before_size,
    'after_bytes', v_after_size,
    'before_size', pg_size_pretty(v_before_size),
    'after_size', pg_size_pretty(v_after_size),
    'started_at', v_started_at,
    'finished_at', clock_timestamp()
  );
exception
  when lock_not_available or query_canceled then
    return jsonb_build_object(
      'ok', false,
      'msg', 'AUDIT_LOGS_BUSY_TRY_LOW_TRAFFIC',
      'finished_at', clock_timestamp()
    );
end
$$;

revoke all on function public.sunny_compact_audit_logs_safe(integer)
  from public, anon, authenticated;
grant execute on function public.sunny_compact_audit_logs_safe(integer)
  to service_role;

-- Make routine cleanup efficient without changing application semantics.
alter table public.audit_logs set (
  autovacuum_vacuum_scale_factor = 0.03,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 1000,
  autovacuum_analyze_threshold = 1000
);
