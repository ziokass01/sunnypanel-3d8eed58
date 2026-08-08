-- Cloudflare Free-Key hot-path support + daily expired-license archive cleanup.
--
-- Goals:
--   1) Keep the existing verify-key / ECDSA contract untouched.
--   2) Reduce database growth from high-volume Free Key traffic.
--   3) Archive licenses for one full day after effective expiry, then hard-delete
--      the live row (device/IP bindings cascade) while retaining compact history.
--   4) Run bounded daily maintenance with short lock/statement timeouts.

begin;

create table if not exists public.license_expiry_history (
  id bigserial primary key,
  original_license_id uuid not null unique,
  license_key text not null,
  app_code text null,
  expired_at timestamptz not null,
  archived_at timestamptz not null default now(),
  created_at timestamptz null,
  first_used_at timestamptz null,
  max_devices integer null,
  note text null,
  device_count integer not null default 0,
  issue_count integer not null default 0,
  snapshot jsonb not null default '{}'::jsonb
);

create index if not exists idx_license_expiry_history_archived_at
  on public.license_expiry_history(archived_at desc);
create index if not exists idx_license_expiry_history_expired_at
  on public.license_expiry_history(expired_at desc);
create index if not exists idx_license_expiry_history_key
  on public.license_expiry_history(license_key);

alter table public.license_expiry_history enable row level security;
revoke all on table public.license_expiry_history from anon;
grant select on table public.license_expiry_history to authenticated;

drop policy if exists "admins read license expiry history" on public.license_expiry_history;
create policy "admins read license expiry history"
on public.license_expiry_history
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role));

-- One bounded batch. It archives first and only deletes rows that are confirmed
-- present in the archive table. FOR UPDATE SKIP LOCKED avoids blocking live key
-- verification/reset work on busy rows.
create or replace function public.sunny_archive_expired_licenses(
  p_batch_size integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit integer := least(5000, greatest(1, coalesce(p_batch_size, 1000)));
  v_archived integer := 0;
  v_deleted integer := 0;
begin
  perform set_config('lock_timeout', '1200ms', true);
  perform set_config('statement_timeout', '25s', true);

  with candidates as materialized (
    select
      l.id,
      l.key,
      l.created_at,
      l.first_used_at,
      l.max_devices,
      l.note,
      to_jsonb(l) as row_json,
      public.license_effective_expires_at(
        l.expires_at,
        l.start_on_first_use,
        l.starts_on_first_use,
        l.first_used_at,
        l.activated_at,
        l.duration_seconds,
        l.duration_days
      ) as effective_expires_at
    from public.licenses l
    where l.deleted_at is null
      and public.license_effective_expires_at(
        l.expires_at,
        l.start_on_first_use,
        l.starts_on_first_use,
        l.first_used_at,
        l.activated_at,
        l.duration_seconds,
        l.duration_days
      ) < now() - interval '1 day'
    order by public.license_effective_expires_at(
      l.expires_at,
      l.start_on_first_use,
      l.starts_on_first_use,
      l.first_used_at,
      l.activated_at,
      l.duration_seconds,
      l.duration_days
    ) asc
    limit v_limit
    for update skip locked
  ), archived as (
    insert into public.license_expiry_history (
      original_license_id,
      license_key,
      app_code,
      expired_at,
      created_at,
      first_used_at,
      max_devices,
      note,
      device_count,
      issue_count,
      snapshot
    )
    select
      c.id,
      c.key,
      nullif(trim(coalesce(c.row_json ->> 'app_code', '')), ''),
      c.effective_expires_at,
      c.created_at,
      c.first_used_at,
      c.max_devices,
      c.note,
      (
        select count(*)::integer
        from public.license_devices d
        where d.license_id = c.id
      ),
      case
        when to_regclass('public.licenses_free_issues') is null then 0
        else (
          select count(*)::integer
          from public.licenses_free_issues i
          where i.license_id = c.id
        )
      end,
      jsonb_strip_nulls(
        c.row_json
        - 'id'
        - 'key'
        - 'note'
        - 'created_at'
        - 'first_used_at'
      )
    from candidates c
    on conflict (original_license_id) do nothing
    returning original_license_id
  ), removed as (
    delete from public.licenses l
    using candidates c
    where l.id = c.id
      and exists (
        select 1
        from public.license_expiry_history h
        where h.original_license_id = c.id
      )
    returning l.id
  )
  select
    (select count(*)::integer from archived),
    (select count(*)::integer from removed)
  into v_archived, v_deleted;

  return jsonb_build_object(
    'ok', true,
    'batch_size', v_limit,
    'archived', coalesce(v_archived, 0),
    'deleted', coalesce(v_deleted, 0),
    'finished_at', now()
  );
exception
  when lock_not_available or query_canceled then
    return jsonb_build_object(
      'ok', false,
      'code', 'SKIPPED_BUSY',
      'archived', coalesce(v_archived, 0),
      'deleted', coalesce(v_deleted, 0),
      'finished_at', now()
    );
end;
$$;

revoke all on function public.sunny_archive_expired_licenses(integer)
  from public, anon, authenticated;
grant execute on function public.sunny_archive_expired_licenses(integer)
  to service_role;

-- Daily maintenance remains deliberately bounded. The archive loop can remove
-- at most 10,000 expired licenses per run; a large backlog is drained over
-- multiple days without one huge blocking DELETE transaction.
create or replace function public.sunny_daily_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_round integer;
  v_result jsonb;
  v_deleted integer := 0;
  v_archived_total integer := 0;
  v_deleted_total integer := 0;
  v_cleanup jsonb := '{}'::jsonb;
  v_rows bigint := 0;
  v_details jsonb := '{}'::jsonb;
begin
  perform set_config('lock_timeout', '1200ms', true);
  perform set_config('statement_timeout', '55s', true);

  for v_round in 1..10 loop
    v_result := public.sunny_archive_expired_licenses(1000);
    v_deleted := greatest(0, coalesce((v_result ->> 'deleted')::integer, 0));
    v_archived_total := v_archived_total + greatest(0, coalesce((v_result ->> 'archived')::integer, 0));
    v_deleted_total := v_deleted_total + v_deleted;
    exit when v_deleted < 1000;
  end loop;

  -- Reuse the existing storage-retention function when available.
  if to_regprocedure('public.sunny_storage_cleanup()') is not null then
    begin
      v_cleanup := public.sunny_storage_cleanup();
    exception
      when others then
        v_cleanup := jsonb_build_object('ok', false, 'code', 'STORAGE_CLEANUP_FAILED');
    end;
  end if;

  -- High-volume Free Key runtime rows only need a short operational window.
  if to_regclass('public.licenses_free_sessions') is not null then
    delete from public.licenses_free_sessions
    where coalesce(closed_at, expires_at) < now() - interval '1 day';
    get diagnostics v_rows = row_count;
    v_details := v_details || jsonb_build_object('licenses_free_sessions', v_rows);
  end if;

  if to_regclass('public.licenses_free_gate_tokens') is not null then
    delete from public.licenses_free_gate_tokens
    where expires_at < now() - interval '12 hours'
       or used_at < now() - interval '12 hours'
       or burned_at < now() - interval '12 hours';
    get diagnostics v_rows = row_count;
    v_details := v_details || jsonb_build_object('licenses_free_gate_tokens', v_rows);
  end if;

  if to_regclass('public.licenses_free_issues') is not null then
    delete from public.licenses_free_issues
    where expires_at < now() - interval '1 day';
    get diagnostics v_rows = row_count;
    v_details := v_details || jsonb_build_object('licenses_free_issues', v_rows);
  end if;

  if to_regclass('public.licenses_free_gate_logs') is not null then
    delete from public.licenses_free_gate_logs
    where created_at < now() - interval '3 days';
    get diagnostics v_rows = row_count;
    v_details := v_details || jsonb_build_object('licenses_free_gate_logs', v_rows);
  end if;

  if to_regclass('public.licenses_free_security_logs') is not null then
    delete from public.licenses_free_security_logs
    where created_at < now() - interval '3 days';
    get diagnostics v_rows = row_count;
    v_details := v_details || jsonb_build_object('licenses_free_security_logs', v_rows);
  end if;

  return jsonb_build_object(
    'ok', true,
    'expired_licenses_archived', v_archived_total,
    'expired_licenses_deleted', v_deleted_total,
    'runtime_cleanup', v_details,
    'base_cleanup', v_cleanup,
    'finished_at', now()
  );
end;
$$;

revoke all on function public.sunny_daily_maintenance()
  from public, anon, authenticated;
grant execute on function public.sunny_daily_maintenance()
  to service_role;

-- Schedule only when pg_cron is already enabled. No extension is enabled by
-- this migration, so a project without pg_cron remains unchanged.
do $$
declare
  existing_job bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for existing_job in
      select jobid from cron.job where jobname = 'sunny-daily-maintenance'
    loop
      perform cron.unschedule(existing_job);
    end loop;

    perform cron.schedule(
      'sunny-daily-maintenance',
      '27 3 * * *',
      'select public.sunny_daily_maintenance();'
    );
  else
    raise notice 'pg_cron is not enabled; sunny-daily-maintenance was not scheduled.';
  end if;
exception
  when insufficient_privilege or undefined_table or invalid_schema_name then
    raise notice 'Unable to schedule sunny-daily-maintenance; migration continues safely.';
end
$$;

notify pgrst, 'reload schema';

commit;
