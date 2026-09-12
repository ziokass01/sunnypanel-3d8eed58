-- Cloudflare-native verify-key for the already released Sunny SRC V10.1.
--
-- Deployment order is intentionally fail-safe:
--   1) Apply this migration first.
--   2) Deploy customer-worker with VERIFY_NATIVE_ENABLED=0 (proxy mode).
--   3) Configure Cloudflare secrets and test the RPC/signature contract.
--   4) Set VERIFY_NATIVE_ENABLED=1 only after all checks pass.
--
-- The public response contract is NOT produced in SQL. PostgreSQL returns only
-- trusted state; Cloudflare Worker creates the V3 session fields and signs the
-- exact ECDSA-P256 canonical string expected by SRC V10.1.

begin;

create or replace function public.sunny_verify_audit(
  p_license_key text,
  p_detail jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.audit_logs(action, license_key, detail)
  values (
    'VERIFY',
    coalesce(p_license_key, ''),
    coalesce(p_detail, '{}'::jsonb)
  );
exception
  when others then
    -- Audit storage must never stop a released menu from verifying a valid key.
    return;
end;
$$;

revoke all on function public.sunny_verify_audit(text,jsonb)
  from public, anon, authenticated;

create or replace function public.sunny_verify_maybe_block_enumeration(
  p_ip text,
  p_key text,
  p_failure_5m_limit integer,
  p_distinct_10m_limit integer,
  p_block_minutes integer
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_failure_5m integer := 0;
  v_distinct_10m integer := 0;
  v_now timestamptz := clock_timestamp();
  v_until timestamptz;
begin
  select
    coalesce(metrics.failure_5m, 0),
    coalesce(metrics.distinct_keys_10m, 0)
  into v_failure_5m, v_distinct_10m
  from public.security_metrics_for_ip(coalesce(p_ip, '')) as metrics;

  if v_failure_5m <= greatest(coalesce(p_failure_5m_limit, 80), 1)
     and v_distinct_10m <= greatest(coalesce(p_distinct_10m_limit, 100), 1) then
    return;
  end if;

  insert into public.security_alerts(kind, ip, key_prefix, meta)
  values (
    'ENUMERATION',
    coalesce(p_ip, ''),
    nullif(left(coalesce(p_key, ''), 10), ''),
    jsonb_build_object(
      'failure_5m', v_failure_5m,
      'distinct_keys_10m', v_distinct_10m,
      'thresholds', jsonb_build_object(
        'failure_5m', greatest(coalesce(p_failure_5m_limit, 80), 1),
        'distinct_keys_10m', greatest(coalesce(p_distinct_10m_limit, 100), 1)
      )
    )
  );

  v_until := v_now + make_interval(mins => greatest(coalesce(p_block_minutes, 15), 1));

  insert into public.blocked_ips(ip, blocked_until, reason, meta, updated_at)
  values (
    coalesce(p_ip, ''),
    v_until,
    'ENUMERATION',
    jsonb_build_object(
      'failure_5m', v_failure_5m,
      'distinct_keys_10m', v_distinct_10m,
      'block_minutes', greatest(coalesce(p_block_minutes, 15), 1)
    ),
    v_now
  )
  on conflict (ip)
  do update set
    blocked_until = greatest(public.blocked_ips.blocked_until, excluded.blocked_until),
    reason = excluded.reason,
    meta = excluded.meta,
    updated_at = excluded.updated_at;
exception
  when others then
    -- Alerting/autoblock is best effort and must not become a verify outage.
    return;
end;
$$;

revoke all on function public.sunny_verify_maybe_block_enumeration(text,text,integer,integer,integer)
  from public, anon, authenticated;

create or replace function public.verify_key_v10_1_atomic(
  p_key text,
  p_device text,
  p_device_name text,
  p_ip text,
  p_ip_hash text,
  p_nonce text,
  p_ts bigint,
  p_build_id text,
  p_product_id text,
  p_precheck_msg text,
  p_precheck_status integer,
  p_precheck_reason text,
  p_has_proof_envelope boolean,
  p_proof_valid boolean,
  p_submitted_public_key text,
  p_submitted_public_key_sha256 text,
  p_require_device_key boolean,
  p_ip_rate_limit integer,
  p_ip_rate_window_seconds integer,
  p_key_rate_limit integer,
  p_key_rate_window_seconds integer,
  p_new_device_limit integer,
  p_new_device_window_seconds integer,
  p_enum_failure_5m_limit integer,
  p_enum_distinct_10m_limit integer,
  p_enum_block_minutes integer,
  p_session_id_prefix text,
  p_audit_success boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_server_epoch bigint;
  v_key text := upper(trim(coalesce(p_key, '')));
  v_device text := trim(coalesce(p_device, ''));
  v_ip text := trim(coalesce(p_ip, ''));
  v_nonce_rows integer := 0;
  v_blocked_until timestamptz;
  v_build public.security_client_builds%rowtype;
  v_license public.licenses%rowtype;
  v_existing_device public.license_devices%rowtype;
  v_device_id uuid;
  v_existing_device_found boolean := false;
  v_existing_device_key_hash text := '';
  v_bound_device_key_hash text := '';
  v_device_count integer := 0;
  v_max_devices integer := 1;
  v_starts_on_first_use boolean := false;
  v_effective_first_used_at timestamptz;
  v_effective_expires_at timestamptz;
  v_effective_duration_seconds bigint;
  v_started boolean := false;
  v_remaining_seconds bigint := 0;
  v_session_generation bigint := 0;
  v_ip_rate record;
  v_key_rate record;
  v_new_device_rate record;
  v_fake_lag record;
  v_fake_lag_error text;
begin
  if v_ip = '' then
    v_ip := '0.0.0.0';
  end if;

  -- For authenticated requests that reach PostgreSQL, reject an autoblocked IP
  -- before nonce insertion, request precheck handling or license lookup.
  select blocked_until
  into v_blocked_until
  from public.blocked_ips
  where ip = v_ip;

  if found and v_blocked_until > v_now then
    perform public.sunny_verify_audit(
      '',
      jsonb_build_object(
        'ip', v_ip,
        'ok', false,
        'msg', 'RATE_LIMIT',
        'reason', 'IP_BLOCKED',
        'backend', 'cloudflare-native'
      )
    );
    return jsonb_build_object(
      'ok', false,
      'msg', 'RATE_LIMIT',
      'http_status', 429,
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (v_blocked_until - v_now)))::integer)
    );
  end if;

  -- Request HMAC and timestamp window are verified in Cloudflare before this
  -- RPC. The nonce remains in PostgreSQL so replay behavior stays compatible
  -- across Worker restarts and Cloudflare locations.
  insert into public.request_nonces(nonce, ts, expires_at)
  values (
    coalesce(p_nonce, ''),
    coalesce(p_ts, 0),
    v_now + interval '10 minutes'
  )
  on conflict (nonce) do nothing;
  get diagnostics v_nonce_rows = row_count;

  if v_nonce_rows <> 1 then
    perform public.sunny_verify_audit(
      '',
      jsonb_build_object(
        'ip', v_ip,
        'ok', false,
        'msg', 'UNAUTHORIZED',
        'reason', 'NONCE_REPLAY',
        'backend', 'cloudflare-native'
      )
    );
    return jsonb_build_object('ok', false, 'msg', 'UNAUTHORIZED', 'http_status', 200);
  end if;

  -- Cloudflare performs JSON/schema/static build validation, but sends the
  -- result here so invalid authenticated requests still consume their nonce as
  -- they did in the released Supabase Edge Function.
  if nullif(trim(coalesce(p_precheck_msg, '')), '') is not null then
    if p_precheck_msg in ('DEVICE_ID_UNSTABLE', 'APP_UPDATE_REQUIRED') then
      perform public.sunny_verify_audit(
        v_key,
        jsonb_build_object(
          'ip', v_ip,
          'device', nullif(v_device, ''),
          'ok', false,
          'msg', p_precheck_msg,
          'reason', coalesce(p_precheck_reason, ''),
          'build_id', nullif(coalesce(p_build_id, ''), ''),
          'backend', 'cloudflare-native'
        )
      );
    end if;

    return jsonb_build_object(
      'ok', false,
      'msg', p_precheck_msg,
      'http_status', greatest(200, least(coalesce(p_precheck_status, 200), 599))
    );
  end if;

  -- Dynamic build lease. A normal MVCC read is deliberate: the old
  -- issue_sunny_v34_lease FOR UPDATE lock serialized every verify on one build
  -- row. Session generation remains atomic on each device row below.
  select *
  into v_build
  from public.security_client_builds
  where build_id = p_build_id
    and product_id = p_product_id
    and is_active = true;

  if not found
     or v_now + interval '5 minutes' < v_build.not_before
     or v_now >= v_build.expires_at then
    return jsonb_build_object('ok', false, 'msg', 'APP_UPDATE_REQUIRED', 'http_status', 200);
  end if;

  select * into v_ip_rate
  from public.check_ip_rate_limit(
    v_ip,
    greatest(coalesce(p_ip_rate_limit, 300), 1),
    greatest(coalesce(p_ip_rate_window_seconds, 60), 10)
  );

  if not coalesce(v_ip_rate.allowed, false) then
    perform public.sunny_verify_audit(
      v_key,
      jsonb_build_object(
        'ip', v_ip,
        'device', v_device,
        'ok', false,
        'msg', 'RATE_LIMIT',
        'kind', 'IP_ONLY',
        'current_count', v_ip_rate.current_count,
        'backend', 'cloudflare-native'
      )
    );
    perform public.sunny_verify_maybe_block_enumeration(
      v_ip, v_key,
      p_enum_failure_5m_limit,
      p_enum_distinct_10m_limit,
      p_enum_block_minutes
    );
    return jsonb_build_object(
      'ok', false,
      'msg', 'RATE_LIMIT',
      'http_status', 429,
      'retry_after_seconds', greatest(coalesce(p_ip_rate_window_seconds, 60), 10)
    );
  end if;

  select * into v_key_rate
  from public.check_rate_limit(
    v_key,
    v_ip,
    greatest(coalesce(p_key_rate_limit, 60), 1),
    greatest(coalesce(p_key_rate_window_seconds, 300), 10)
  );

  if not coalesce(v_key_rate.allowed, false) then
    perform public.sunny_verify_audit(
      v_key,
      jsonb_build_object(
        'ip', v_ip,
        'device', v_device,
        'ok', false,
        'msg', 'RATE_LIMIT',
        'current_count', v_key_rate.current_count,
        'backend', 'cloudflare-native'
      )
    );
    perform public.sunny_verify_maybe_block_enumeration(
      v_ip, v_key,
      p_enum_failure_5m_limit,
      p_enum_distinct_10m_limit,
      p_enum_block_minutes
    );
    return jsonb_build_object(
      'ok', false,
      'msg', 'RATE_LIMIT',
      'http_status', 429,
      'retry_after_seconds', greatest(coalesce(p_key_rate_window_seconds, 300), 10)
    );
  end if;

  -- Lock one license row so concurrent new-device requests cannot exceed
  -- max_devices. Different keys still verify concurrently.
  select *
  into v_license
  from public.licenses
  where key = v_key
  for update;

  if not found then
    perform public.sunny_verify_audit(
      v_key,
      jsonb_build_object(
        'ip', v_ip,
        'device', v_device,
        'ok', false,
        'msg', 'KEY_NOT_FOUND',
        'backend', 'cloudflare-native'
      )
    );
    perform public.sunny_verify_maybe_block_enumeration(
      v_ip, v_key,
      p_enum_failure_5m_limit,
      p_enum_distinct_10m_limit,
      p_enum_block_minutes
    );
    return jsonb_build_object('ok', false, 'msg', 'KEY_NOT_FOUND', 'http_status', 200);
  end if;

  if v_license.deleted_at is not null then
    perform public.sunny_verify_audit(
      v_key,
      jsonb_build_object(
        'ip', v_ip,
        'device', v_device,
        'ok', false,
        'msg', 'KEY_DELETED',
        'backend', 'cloudflare-native'
      )
    );
    perform public.sunny_verify_maybe_block_enumeration(
      v_ip, v_key,
      p_enum_failure_5m_limit,
      p_enum_distinct_10m_limit,
      p_enum_block_minutes
    );
    return jsonb_build_object('ok', false, 'msg', 'KEY_NOT_FOUND', 'http_status', 200);
  end if;

  if not coalesce(v_license.is_active, false) then
    perform public.sunny_verify_audit(
      v_key,
      jsonb_build_object(
        'ip', v_ip,
        'device', v_device,
        'ok', false,
        'msg', 'KEY_BLOCKED',
        'backend', 'cloudflare-native'
      )
    );
    perform public.sunny_verify_maybe_block_enumeration(
      v_ip, v_key,
      p_enum_failure_5m_limit,
      p_enum_distinct_10m_limit,
      p_enum_block_minutes
    );
    return jsonb_build_object('ok', false, 'msg', 'KEY_BLOCKED', 'http_status', 200);
  end if;

  -- Preserve the released fail-closed rule: a non-null expires_at in the past
  -- is expired even when a start-on-first-use flag is present.
  if v_license.expires_at is not null and v_license.expires_at <= v_now then
    perform public.sunny_verify_audit(
      v_key,
      jsonb_build_object(
        'ip', v_ip,
        'device', v_device,
        'ok', false,
        'msg', 'KEY_EXPIRED',
        'backend', 'cloudflare-native'
      )
    );
    perform public.sunny_verify_maybe_block_enumeration(
      v_ip, v_key,
      p_enum_failure_5m_limit,
      p_enum_distinct_10m_limit,
      p_enum_block_minutes
    );
    return jsonb_build_object('ok', false, 'msg', 'KEY_EXPIRED', 'http_status', 200);
  end if;

  if (coalesce(p_require_device_key, false) and not coalesce(p_proof_valid, false))
     or (coalesce(p_has_proof_envelope, false) and not coalesce(p_proof_valid, false)) then
    return jsonb_build_object('ok', false, 'msg', 'DEVICE_KEY_REQUIRED', 'http_status', 200);
  end if;

  select *
  into v_existing_device
  from public.license_devices
  where license_id = v_license.id
    and device_id = v_device;

  v_existing_device_found := found;
  if v_existing_device_found then
    v_existing_device_key_hash := trim(coalesce(v_existing_device.device_public_key_sha256, ''));
  end if;

  if v_existing_device_key_hash <> '' and (
    not coalesce(p_proof_valid, false)
    or lower(v_existing_device_key_hash) <> lower(trim(coalesce(p_submitted_public_key_sha256, '')))
  ) then
    return jsonb_build_object('ok', false, 'msg', 'DEVICE_KEY_MISMATCH', 'http_status', 200);
  end if;

  v_max_devices := coalesce(v_license.max_devices, 1);

  if not v_existing_device_found then
    select * into v_new_device_rate
    from public.check_new_device_rate_limit(
      v_key,
      greatest(coalesce(p_new_device_limit, 20), 1),
      greatest(coalesce(p_new_device_window_seconds, 3600), 60)
    );

    if not coalesce(v_new_device_rate.allowed, false) then
      perform public.sunny_verify_audit(
        v_key,
        jsonb_build_object(
          'ip', v_ip,
          'device', v_device,
          'ok', false,
          'msg', 'RATE_LIMIT',
          'kind', 'NEW_DEVICE',
          'current_count', v_new_device_rate.current_count,
          'backend', 'cloudflare-native'
        )
      );
      perform public.sunny_verify_maybe_block_enumeration(
        v_ip, v_key,
        p_enum_failure_5m_limit,
        p_enum_distinct_10m_limit,
        p_enum_block_minutes
      );
      return jsonb_build_object(
        'ok', false,
        'msg', 'RATE_LIMIT',
        'http_status', 429,
        'retry_after_seconds', greatest(coalesce(p_new_device_window_seconds, 3600), 60)
      );
    end if;

    select count(*)::integer
    into v_device_count
    from public.license_devices
    where license_id = v_license.id;

    if v_device_count >= v_max_devices then
      perform public.sunny_verify_audit(
        v_key,
        jsonb_build_object(
          'ip', v_ip,
          'device', v_device,
          'ok', false,
          'msg', 'DEVICE_LIMIT',
          'used_devices', v_device_count,
          'max_devices', v_max_devices,
          'backend', 'cloudflare-native'
        )
      );
      perform public.sunny_verify_maybe_block_enumeration(
        v_ip, v_key,
        p_enum_failure_5m_limit,
        p_enum_distinct_10m_limit,
        p_enum_block_minutes
      );
      return jsonb_build_object(
        'ok', false,
        'msg', 'DEVICE_LIMIT',
        'http_status', 200,
        'used_devices', v_device_count,
        'max_devices', v_max_devices
      );
    end if;

    if lower(coalesce(v_license.app_code, '')) = 'fake-lag'
       or v_key like 'FAKELAG-%' then
      begin
        select * into v_fake_lag
        from public.increment_fake_lag_license_use(
          v_license.id,
          'fake-lag',
          trim(coalesce(p_ip_hash, ''))
        );
      exception
        when others then
          v_fake_lag_error := sqlstate;
          perform public.sunny_verify_audit(
            v_key,
            jsonb_build_object(
              'ip', v_ip,
              'device', v_device,
              'ok', false,
              'msg', 'SERVER_ERROR',
              'reason', 'FAKE_LAG_QUOTA_RPC_FAILED',
              'sqlstate', v_fake_lag_error,
              'backend', 'cloudflare-native'
            )
          );
          return jsonb_build_object('ok', false, 'msg', 'SERVER_ERROR', 'http_status', 500);
      end;

      if not coalesce(v_fake_lag.ok, false) then
        perform public.sunny_verify_audit(
          v_key,
          jsonb_build_object(
            'ip', v_ip,
            'device', v_device,
            'ok', false,
            'msg', coalesce(v_fake_lag.msg, 'FAKE_LAG_RULE_BLOCKED'),
            'app_code', 'fake-lag',
            'backend', 'cloudflare-native'
          )
        );
        perform public.sunny_verify_maybe_block_enumeration(
          v_ip, v_key,
          p_enum_failure_5m_limit,
          p_enum_distinct_10m_limit,
          p_enum_block_minutes
        );
        return jsonb_build_object(
          'ok', false,
          'msg', coalesce(v_fake_lag.msg, 'FAKE_LAG_RULE_BLOCKED'),
          'http_status', 200
        );
      end if;
    end if;
  end if;

  -- Upsert after every rejection gate. The license-row lock prevents a device
  -- count race, and ON CONFLICT preserves first_seen.
  insert into public.license_devices as target(
    license_id,
    device_id,
    device_name,
    last_seen,
    device_public_key_spki,
    device_public_key_sha256,
    device_key_bound_at
  )
  values (
    v_license.id,
    v_device,
    nullif(trim(coalesce(p_device_name, '')), ''),
    v_now,
    case when coalesce(p_proof_valid, false) then p_submitted_public_key else null end,
    case when coalesce(p_proof_valid, false) then p_submitted_public_key_sha256 else null end,
    case when coalesce(p_proof_valid, false) then v_now else null end
  )
  on conflict (license_id, device_id)
  do update set
    last_seen = excluded.last_seen,
    device_name = coalesce(excluded.device_name, target.device_name),
    device_public_key_spki = case
      when target.device_public_key_sha256 is null
       and excluded.device_public_key_sha256 is not null
      then excluded.device_public_key_spki
      else target.device_public_key_spki
    end,
    device_public_key_sha256 = case
      when target.device_public_key_sha256 is null
       and excluded.device_public_key_sha256 is not null
      then excluded.device_public_key_sha256
      else target.device_public_key_sha256
    end,
    device_key_bound_at = case
      when target.device_public_key_sha256 is null
       and excluded.device_public_key_sha256 is not null
      then excluded.device_key_bound_at
      else target.device_key_bound_at
    end
  returning target.id, trim(coalesce(target.device_public_key_sha256, ''))
  into v_device_id, v_bound_device_key_hash;

  v_starts_on_first_use :=
    coalesce(v_license.start_on_first_use, false)
    or coalesce(v_license.starts_on_first_use, false);
  v_effective_first_used_at := coalesce(v_license.first_used_at, v_license.activated_at);
  v_effective_expires_at := v_license.expires_at;
  v_effective_duration_seconds := public.license_effective_duration_seconds(
    v_license.duration_seconds,
    v_license.duration_days
  );

  if v_starts_on_first_use then
    if v_effective_duration_seconds is null or v_effective_duration_seconds <= 0 then
      perform public.sunny_verify_audit(
        v_key,
        jsonb_build_object(
          'ip', v_ip,
          'device', v_device,
          'ok', false,
          'msg', 'LICENSE_MISCONFIGURED',
          'backend', 'cloudflare-native'
        )
      );
      perform public.sunny_verify_maybe_block_enumeration(
        v_ip, v_key,
        p_enum_failure_5m_limit,
        p_enum_distinct_10m_limit,
        p_enum_block_minutes
      );
      return jsonb_build_object('ok', false, 'msg', 'LICENSE_MISCONFIGURED', 'http_status', 200);
    end if;

    if v_effective_first_used_at is not null and v_effective_expires_at is null then
      v_effective_expires_at := v_effective_first_used_at
        + (v_effective_duration_seconds * interval '1 second');
      update public.licenses
      set expires_at = v_effective_expires_at
      where id = v_license.id
        and expires_at is null;
    end if;

    if v_effective_first_used_at is null then
      v_effective_first_used_at := v_now;
      v_effective_expires_at := v_now
        + (v_effective_duration_seconds * interval '1 second');
      update public.licenses
      set
        first_used_at = v_now,
        activated_at = v_now,
        expires_at = v_effective_expires_at
      where id = v_license.id;
    end if;
  end if;

  v_started := v_effective_first_used_at is not null;
  if v_effective_expires_at is not null then
    v_remaining_seconds := greatest(
      0,
      floor(extract(epoch from (v_effective_expires_at - v_now)))::bigint
    );
  elsif v_starts_on_first_use and not v_started then
    v_remaining_seconds := greatest(coalesce(v_effective_duration_seconds, 0), 0);
  else
    v_remaining_seconds := 0;
  end if;

  -- Atomic per-device generation. No global build-row write lock is needed.
  update public.license_devices
  set
    session_generation = session_generation + 1,
    last_seen = v_now
  where id = v_device_id
  returning session_generation
  into v_session_generation;

  if v_session_generation is null or v_session_generation <= 0
     or v_build.exp_generation is null or v_build.exp_generation <= 0
     or v_build.not_before is null
     or v_build.expires_at is null
     or v_build.expires_at <= v_build.not_before
     or v_now < v_build.not_before
     or v_now >= v_build.expires_at then
    perform public.sunny_verify_audit(
      v_key,
      jsonb_build_object(
        'ip', v_ip,
        'device', v_device,
        'ok', false,
        'msg', 'SERVER_ERROR',
        'reason', 'LEASE_FIELDS_INVALID',
        'backend', 'cloudflare-native'
      )
    );
    return jsonb_build_object('ok', false, 'msg', 'SERVER_ERROR', 'http_status', 503);
  end if;

  v_server_epoch := floor(extract(epoch from v_now))::bigint;

  if coalesce(p_audit_success, true) then
    perform public.sunny_verify_audit(
      v_key,
      jsonb_build_object(
        'ip', v_ip,
        'device', v_device,
        'device_name', nullif(trim(coalesce(p_device_name, '')), ''),
        'ok', true,
        'license_id', v_license.id,
        'device_row', v_device_id,
        'server_sig_alg', 'ECDSA-P256-SHA256-V3',
        'server_key_id', 'sunny-p256-2026-07-b',
        'session_id_prefix', left(coalesce(p_session_id_prefix, ''), 8),
        'backend', 'cloudflare-native'
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'msg', 'OK',
    'expires_at', v_effective_expires_at,
    'max_devices', v_max_devices,
    'started', v_started,
    'remaining_seconds', v_remaining_seconds,
    'server_epoch', v_server_epoch,
    'session_generation', v_session_generation,
    'exp_generation', v_build.exp_generation,
    'build_not_before', floor(extract(epoch from v_build.not_before))::bigint,
    'build_expires_at', floor(extract(epoch from v_build.expires_at))::bigint,
    'device_key_bound', v_bound_device_key_hash <> ''
  );
exception
  when others then
    perform public.sunny_verify_audit(
      v_key,
      jsonb_build_object(
        'ip', v_ip,
        'device', nullif(v_device, ''),
        'ok', false,
        'msg', 'SERVER_ERROR',
        'reason', 'NATIVE_VERIFY_RPC_EXCEPTION',
        'sqlstate', sqlstate,
        'backend', 'cloudflare-native'
      )
    );
    return jsonb_build_object('ok', false, 'msg', 'SERVER_ERROR', 'http_status', 503);
end;
$$;

revoke all on function public.verify_key_v10_1_atomic(
  text,text,text,text,text,text,bigint,text,text,text,integer,text,
  boolean,boolean,text,text,boolean,integer,integer,integer,integer,
  integer,integer,integer,integer,integer,text,boolean
) from public, anon, authenticated;

grant execute on function public.verify_key_v10_1_atomic(
  text,text,text,text,text,text,bigint,text,text,text,integer,text,
  boolean,boolean,text,text,boolean,integer,integer,integer,integer,
  integer,integer,integer,integer,integer,text,boolean
) to service_role;

notify pgrst, 'reload schema';

commit;
