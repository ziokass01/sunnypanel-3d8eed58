-- Hotfix 2026-04-28: Find Dumps paid unlocks must be account-wide, and /free-start must not get stuck on old pending sessions.
-- Safe/idempotent; does not touch Fake Lag APK or server policy.

-- 1) Ensure feature unlock table has the columns used by panel/runtime hotfixes.
alter table if exists public.server_app_feature_unlocks
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists unlock_source text,
  add column if not exists trace_id text,
  add column if not exists device_id text;

-- 2) Make Find Dumps purchased unlocks account-wide.
-- Old rows were sometimes tied to a generated device_id, so reinstall/data clear/new session made paid unlocks appear locked.
update public.server_app_feature_unlocks
set device_id = null,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('account_wide_hotfix', true, 'account_wide_hotfix_at', now()),
    updated_at = now()
where app_code = 'find-dumps'
  and status = 'active'
  and device_id is not null;

-- 3) Repair cases where credit was charged for an unlock but the active unlock row was not visible/written.
-- This looks only at recent unlock_* consume transactions and creates the missing active account-wide unlock.
insert into public.server_app_feature_unlocks (
  app_code,
  access_code,
  account_ref,
  device_id,
  status,
  unlock_source,
  started_at,
  expires_at,
  trace_id,
  metadata,
  updated_at
)
select
  t.app_code,
  lower(t.feature_code),
  t.account_ref,
  null,
  'active',
  'repair_from_charged_unlock_transaction',
  coalesce(t.created_at, now()),
  greatest(
    now() + interval '1 hour',
    coalesce(t.created_at, now()) + make_interval(secs => coalesce(
      case when coalesce(t.metadata->>'duration_seconds','') ~ '^[0-9]+$' then (t.metadata->>'duration_seconds')::int else null end,
      r.unlock_duration_seconds,
      86400
    ))
  ),
  t.metadata->>'trace_id',
  jsonb_build_object(
    'repaired_by', '20260428120000_find_dumps_account_unlocks_and_free_start_no429',
    'wallet_transaction_id', t.id,
    'original_created_at', t.created_at,
    'soft_delta', t.soft_delta,
    'premium_delta', t.premium_delta
  ) || coalesce(t.metadata, '{}'::jsonb),
  now()
from public.server_app_wallet_transactions t
join public.server_app_feature_unlock_rules r
  on r.app_code = t.app_code
 and lower(r.access_code) = lower(t.feature_code)
where t.app_code = 'find-dumps'
  and lower(coalesce(t.feature_code,'')) like 'unlock_%'
  and coalesce(t.transaction_type,'') = 'consume'
  and (coalesce(t.soft_delta,0) < 0 or coalesce(t.premium_delta,0) < 0)
  and coalesce(t.created_at, now()) >= now() - interval '30 days'
  and not exists (
    select 1
    from public.server_app_feature_unlocks u
    where u.app_code = t.app_code
      and lower(u.access_code) = lower(t.feature_code)
      and u.account_ref = t.account_ref
      and u.status = 'active'
      and u.revoked_at is null
      and (u.expires_at is null or u.expires_at > now())
  );

-- 4) Close stale free sessions so old tabs/pending sessions do not create false 429 after a day.
update public.licenses_free_sessions
set status = 'closed',
    closed_at = coalesce(closed_at, now()),
    last_error = 'AUTO_CLOSE_STALE_PENDING_20260428'
where status in ('started','waiting','waiting_pass2','gate_ok')
  and revealed_at is null
  and created_at < now() - interval '45 minutes';

-- 5) Raise the waiting-session cushion. Business denials are now JSON 200; this prevents false hard outage.
update public.licenses_free_settings
set free_session_waiting_limit = greatest(coalesce(free_session_waiting_limit, 0), 10),
    updated_at = now()
where id = 1;
