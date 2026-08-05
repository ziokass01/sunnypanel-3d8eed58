-- Emergency production storage cleanup for the Free Plan database.
--
-- Safety contract:
--   * DOES NOT delete auth users, user_roles, licenses, license_devices,
--     license_ip_bindings, issued keys, wallet balances, entitlements,
--     server app configuration, or payment/redeem business records.
--   * Clears only high-churn logs, nonce/rate-limit buckets, regenerable caches,
--     and runtime-only Rent sessions/devices because Rent is disabled.
--   * Keeps the Rent accounts/keys/activation data so the feature can be
--     reopened later without rebuilding customer data.

set lock_timeout = '3s';

-- One-time immediate space release. TRUNCATE releases table pages immediately,
-- unlike a large DELETE which usually waits for VACUUM before disk is reused.
do $$
declare
  table_name text;
  table_oid regclass;
begin
  foreach table_name in array array[
    'public.request_nonces',
    'public.security_alerts',
    'public.verify_rate_limits',
    'public.verify_ip_rate_limits',
    'public.verify_new_device_rate_limits',
    'public.free_ip_rate_limits',
    'public.free_fp_rate_limits',
    'public.licenses_free_ip_rate_limits',
    'public.licenses_free_fp_rate_limits',
    'public.licenses_free_rate_limits',
    'public.licenses_free_security_logs',
    'public.licenses_free_gate_logs',
    'public.licenses_free_link4m_cache',
    'public.licenses_free_outbound_buckets',
    'public.key_public_rate_limits',
    'public.server_app_runtime_events',
    'public.server_app_runtime_counter_buckets',
    'public.server_app_version_audit_logs',
    'public.ai_sunny_usage_logs',
    'public.ai_sunny_tool_audit_logs',
    'rent.sessions',
    'rent.reset_codes',
    'rent.key_devices',
    'rent.key_audit_logs',
    'rent.login_rate_limits',
    'rent.client_request_logs'
  ]
  loop
    table_oid := to_regclass(table_name);
    if table_oid is null then
      raise notice 'Storage cleanup skipped missing table %', table_name;
      continue;
    end if;

    begin
      execute format('truncate table %s', table_oid);
      raise notice 'Storage cleanup truncated %', table_name;
    exception
      when lock_not_available or query_canceled then
        -- Never hold the live verify path waiting for a busy table.
        raise warning 'Storage cleanup skipped busy table %', table_name;
      when foreign_key_violation or object_not_in_prerequisite_state then
        -- No CASCADE is used intentionally. A new dependency must be reviewed
        -- instead of being deleted automatically.
        raise warning 'Storage cleanup refused unsafe truncate for %', table_name;
    end;
  end loop;
end
$$;

-- Delete expired runtime records that are not suitable for full truncation.
do $$
begin
  if to_regclass('public.licenses_free_gate_tokens') is not null then
    delete from public.licenses_free_gate_tokens
    where expires_at < now() - interval '1 day'
       or used_at < now() - interval '1 day'
       or burned_at < now() - interval '1 day';
  end if;

  if to_regclass('public.licenses_free_sessions') is not null then
    delete from public.licenses_free_sessions
    where coalesce(closed_at, expires_at) < now() - interval '3 days';
  end if;

  if to_regclass('public.server_app_sessions') is not null then
    delete from public.server_app_sessions
    where (
      status in ('expired', 'revoked', 'logged_out')
      or (expires_at is not null and expires_at < now())
    )
    and coalesce(revoked_at, expires_at, last_seen_at, created_at) < now() - interval '7 days';
  end if;

  if to_regclass('public.ai_sunny_sandbox_sessions') is not null then
    delete from public.ai_sunny_sandbox_sessions
    where status in ('stopped', 'killed', 'failed')
      and coalesce(ended_at, started_at) < now() - interval '7 days';
  end if;
end
$$;

-- Daily bounded retention function. It is service-role only and can also be
-- called manually after a traffic spike.
create or replace function public.sunny_storage_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  spec text;
  parts text[];
  relation_oid regclass;
  affected bigint;
  total_deleted bigint := 0;
  details jsonb := '{}'::jsonb;
begin
  perform set_config('lock_timeout', '1500ms', true);
  perform set_config('statement_timeout', '45s', true);

  foreach spec in array array[
    'public.security_alerts|created_at|14 days',
    'public.licenses_free_security_logs|created_at|14 days',
    'public.licenses_free_admin_logs|created_at|30 days',
    'public.licenses_free_gate_logs|created_at|14 days',
    'public.server_app_runtime_events|created_at|14 days',
    'public.server_app_admin_audit_logs|created_at|30 days',
    'public.server_app_version_audit_logs|created_at|14 days',
    'public.ai_sunny_usage_logs|created_at|14 days',
    'public.ai_sunny_tool_audit_logs|created_at|14 days',
    'rent.key_audit_logs|created_at|14 days',
    'rent.client_request_logs|created_at|14 days',
    'rent.login_rate_limits|created_at|1 day',
    'public.verify_rate_limits|window_start|2 days',
    'public.verify_ip_rate_limits|window_start|2 days',
    'public.verify_new_device_rate_limits|window_start|2 days',
    'public.free_ip_rate_limits|window_start|2 days',
    'public.free_fp_rate_limits|window_start|2 days',
    'public.licenses_free_ip_rate_limits|window_start|2 days',
    'public.licenses_free_fp_rate_limits|window_start|2 days',
    'public.licenses_free_rate_limits|window_start|2 days',
    'public.key_public_rate_limits|window_start|2 days',
    'public.server_app_runtime_counter_buckets|window_start|3 days',
    'public.licenses_free_link4m_cache|updated_at|30 days',
    'public.licenses_free_outbound_buckets|updated_at|30 days'
  ]
  loop
    parts := string_to_array(spec, '|');
    relation_oid := to_regclass(parts[1]);
    if relation_oid is null then
      continue;
    end if;

    begin
      execute format(
        'delete from %s where %I < now() - %L::interval',
        relation_oid,
        parts[2],
        parts[3]
      );
      get diagnostics affected = row_count;
      total_deleted := total_deleted + affected;
      details := details || jsonb_build_object(parts[1], affected);
    exception
      when lock_not_available or query_canceled then
        details := details || jsonb_build_object(parts[1], 'SKIPPED_BUSY');
      when undefined_column then
        details := details || jsonb_build_object(parts[1], 'SKIPPED_SCHEMA_MISMATCH');
    end;
  end loop;

  -- audit_logs is not a disposable table: PUBLIC_RESET and reset penalty rows
  -- are part of reset-count/penalty compatibility for released clients. Keep all
  -- reset-history rows forever, and keep every other action for 3 days so the
  -- anti-enumeration queries (5/10 minutes) and recent admin diagnostics remain
  -- available. Physical compaction is handled separately by
  -- public.sunny_compact_audit_logs_safe().
  if to_regclass('public.audit_logs') is not null then
    delete from public.audit_logs
    where created_at < now() - interval '3 days'
      and action not in ('PUBLIC_RESET', 'RESET_DEVICES', 'RESET_DEVICES_PENALTY');
    get diagnostics affected = row_count;
    total_deleted := total_deleted + affected;
    details := details || jsonb_build_object('public.audit_logs', affected);
  end if;

  if to_regclass('public.request_nonces') is not null then
    delete from public.request_nonces where expires_at < now();
    get diagnostics affected = row_count;
    total_deleted := total_deleted + affected;
    details := details || jsonb_build_object('public.request_nonces', affected);
  end if;

  if to_regclass('public.licenses_free_gate_tokens') is not null then
    delete from public.licenses_free_gate_tokens
    where expires_at < now() - interval '1 day'
       or used_at < now() - interval '1 day'
       or burned_at < now() - interval '1 day';
    get diagnostics affected = row_count;
    total_deleted := total_deleted + affected;
    details := details || jsonb_build_object('public.licenses_free_gate_tokens', affected);
  end if;

  if to_regclass('public.licenses_free_sessions') is not null then
    delete from public.licenses_free_sessions
    where coalesce(closed_at, expires_at) < now() - interval '3 days';
    get diagnostics affected = row_count;
    total_deleted := total_deleted + affected;
    details := details || jsonb_build_object('public.licenses_free_sessions', affected);
  end if;

  if to_regclass('public.server_app_sessions') is not null then
    delete from public.server_app_sessions
    where (
      status in ('expired', 'revoked', 'logged_out')
      or (expires_at is not null and expires_at < now())
    )
    and coalesce(revoked_at, expires_at, last_seen_at, created_at) < now() - interval '7 days';
    get diagnostics affected = row_count;
    total_deleted := total_deleted + affected;
    details := details || jsonb_build_object('public.server_app_sessions', affected);
  end if;

  if to_regclass('rent.sessions') is not null then
    delete from rent.sessions
    where revoked_at is not null or expires_at < now();
    get diagnostics affected = row_count;
    total_deleted := total_deleted + affected;
    details := details || jsonb_build_object('rent.sessions', affected);
  end if;

  if to_regclass('rent.reset_codes') is not null then
    delete from rent.reset_codes
    where used_at is not null or expires_at < now();
    get diagnostics affected = row_count;
    total_deleted := total_deleted + affected;
    details := details || jsonb_build_object('rent.reset_codes', affected);
  end if;

  return jsonb_build_object(
    'ok', true,
    'deleted_rows', total_deleted,
    'details', details,
    'finished_at', now()
  );
end
$$;

revoke all on function public.sunny_storage_cleanup() from public, anon, authenticated;
grant execute on function public.sunny_storage_cleanup() to service_role;

-- Schedule the retention function only when pg_cron is already enabled.
-- The migration never enables a new extension on the live project.
do $$
declare
  existing_job bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for existing_job in
      select jobid from cron.job where jobname = 'sunny-storage-cleanup-daily'
    loop
      perform cron.unschedule(existing_job);
    end loop;

    perform cron.schedule(
      'sunny-storage-cleanup-daily',
      '17 3 * * *',
      'select public.sunny_storage_cleanup();'
    );
  else
    raise notice 'pg_cron is not enabled; daily cleanup was not scheduled.';
  end if;
exception
  when insufficient_privilege or undefined_table or invalid_schema_name then
    raise notice 'Unable to schedule pg_cron cleanup; migration continues safely.';
end
$$;

-- Refresh planner statistics after the one-time cleanup.
do $$
declare
  table_name text;
  table_oid regclass;
begin
  foreach table_name in array array[
    'public.audit_logs',
    'public.request_nonces',
    'public.licenses_free_security_logs',
    'public.licenses_free_gate_logs',
    'public.server_app_runtime_events',
    'public.ai_sunny_usage_logs'
  ]
  loop
    table_oid := to_regclass(table_name);
    if table_oid is not null then
      execute format('analyze %s', table_oid);
    end if;
  end loop;
end
$$;
