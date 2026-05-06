-- Hotfix 2026-05-06: expired Find Dumps feature unlocks must stop behaving as active.
-- Symptoms:
--   1) Admin control center still shows expired feature unlock rows as ON.
--   2) Buying/renewing the same feature can hit duplicate active unique rows because expired rows kept status='active'.
-- Scope: server_app_feature_unlocks only. Does not touch Fake Lag APK/policies.

alter table if exists public.server_app_feature_unlocks
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- 1) Immediate repair for existing stale rows.
update public.server_app_feature_unlocks
set status = 'expired',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'expired_by', '20260506120000_find_dumps_feature_unlock_expiry_cleanup',
      'expired_by_reason', 'expires_at_already_passed',
      'expired_by_at', now(),
      'previous_status', status
    ),
    updated_at = now()
where lower(app_code) = 'find-dumps'
  and status = 'active'
  and revoked_at is null
  and expires_at is not null
  and expires_at <= now();

-- 2) Reusable cleanup RPC. Runtime/admin can call this before reading or writing unlocks.
create or replace function public.expire_stale_server_app_feature_unlocks(
  p_app_code text default null,
  p_account_ref text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  update public.server_app_feature_unlocks
  set status = 'expired',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'expired_by', 'expire_stale_server_app_feature_unlocks',
        'expired_by_reason', 'expires_at_already_passed',
        'expired_by_at', now(),
        'previous_status', status
      ),
      updated_at = now()
  where status = 'active'
    and revoked_at is null
    and expires_at is not null
    and expires_at <= now()
    and (p_app_code is null or lower(app_code) = lower(trim(p_app_code)))
    and (p_account_ref is null or lower(account_ref) = lower(trim(p_account_ref)));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.expire_stale_server_app_feature_unlocks(text, text) to authenticated;
grant execute on function public.expire_stale_server_app_feature_unlocks(text, text) to service_role;

-- 3) Guard future writes: before inserting/updating an unlock, expire stale rows for that same account.
-- This frees the account-wide active unique index so a new purchase/renewal can create a fresh active row.
create or replace function public.server_app_feature_unlocks_expire_stale_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.expire_stale_server_app_feature_unlocks(new.app_code, new.account_ref);

  -- Do not allow a row with an already-past expires_at to remain active.
  if new.status = 'active'
     and new.revoked_at is null
     and new.expires_at is not null
     and new.expires_at <= now() then
    new.status := 'expired';
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'expired_by', 'server_app_feature_unlocks_expire_stale_before_write',
      'expired_by_reason', 'new_expires_at_already_passed',
      'expired_by_at', now()
    );
    new.updated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_server_app_feature_unlocks_expire_stale_before_write on public.server_app_feature_unlocks;
create trigger trg_server_app_feature_unlocks_expire_stale_before_write
before insert or update of app_code, account_ref, access_code, status, expires_at, revoked_at
on public.server_app_feature_unlocks
for each row
execute function public.server_app_feature_unlocks_expire_stale_before_write();

-- 4) Index helps the cleanup path without changing existing uniqueness semantics.
create index if not exists idx_server_app_feature_unlocks_active_expiry_cleanup
  on public.server_app_feature_unlocks(app_code, account_ref, expires_at)
  where status = 'active' and revoked_at is null and expires_at is not null;
