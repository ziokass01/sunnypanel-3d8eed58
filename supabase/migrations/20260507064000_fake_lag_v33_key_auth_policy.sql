-- Fake Lag V3.3 / versionCode 13 key-auth hotfix.
-- Scope: only fake-lag version policy + fake-lag key prefix rule.
-- Purpose:
--   * allow the new client identity versionName=3.3/versionCode=13;
--   * keep old clients blocked by min_version_code=13;
--   * prevent key-auth false negative while testing a new APK signature/hash;
--   * keep generated public Fake Lag keys on the FAKELAG prefix.

alter table if exists public.server_app_version_policies
  add column if not exists enabled boolean default true,
  add column if not exists force_update_enabled boolean default true,
  add column if not exists min_version_name text,
  add column if not exists min_version_code integer,
  add column if not exists latest_version_name text,
  add column if not exists latest_version_code integer,
  add column if not exists update_url text,
  add column if not exists update_title text,
  add column if not exists update_message text,
  add column if not exists allowed_package_names text[] default '{}'::text[],
  add column if not exists blocked_version_codes integer[] default '{}'::integer[],
  add column if not exists blocked_version_names text[] default '{}'::text[],
  add column if not exists blocked_build_ids text[] default '{}'::text[],
  add column if not exists require_client_integrity boolean default false,
  add column if not exists block_unknown_signature boolean default false,
  add column if not exists require_signature_match boolean default false,
  add column if not exists block_missing_identity boolean default true,
  add column if not exists login_token_ttl_seconds integer default 900,
  add column if not exists engine_token_ttl_seconds integer default 180,
  add column if not exists heartbeat_seconds integer default 90;

insert into public.server_app_version_policies (
  app_code,
  enabled,
  force_update_enabled,
  min_version_name,
  min_version_code,
  latest_version_name,
  latest_version_code,
  update_url,
  update_title,
  update_message,
  allowed_package_names,
  blocked_version_codes,
  blocked_version_names,
  blocked_build_ids,
  require_client_integrity,
  block_unknown_signature,
  require_signature_match,
  block_missing_identity,
  login_token_ttl_seconds,
  engine_token_ttl_seconds,
  heartbeat_seconds
)
values (
  'fake-lag',
  true,
  true,
  '3.3',
  13,
  '3.3',
  13,
  'https://mityangho.id.vn/free',
  'Yêu cầu cập nhật',
  'Đã cập nhật Fake Lag V3.3. Vui lòng tải bản mới để tiếp tục sử dụng.',
  array['com.fakelag.sunnymod']::text[],
  '{}'::integer[],
  '{}'::text[],
  '{}'::text[],
  false,
  false,
  false,
  true,
  900,
  180,
  90
)
on conflict (app_code) do update set
  enabled = excluded.enabled,
  force_update_enabled = excluded.force_update_enabled,
  min_version_name = excluded.min_version_name,
  min_version_code = excluded.min_version_code,
  latest_version_name = excluded.latest_version_name,
  latest_version_code = excluded.latest_version_code,
  update_url = excluded.update_url,
  update_title = excluded.update_title,
  update_message = excluded.update_message,
  allowed_package_names = excluded.allowed_package_names,
  blocked_version_codes = array_remove(coalesce(public.server_app_version_policies.blocked_version_codes, '{}'::integer[]), 13),
  blocked_version_names = array_remove(coalesce(public.server_app_version_policies.blocked_version_names, '{}'::text[]), '3.3'),
  blocked_build_ids = '{}'::text[],
  require_client_integrity = false,
  block_unknown_signature = false,
  require_signature_match = false,
  block_missing_identity = true,
  login_token_ttl_seconds = excluded.login_token_ttl_seconds,
  engine_token_ttl_seconds = excluded.engine_token_ttl_seconds,
  heartbeat_seconds = excluded.heartbeat_seconds;

update public.license_access_rules
set key_prefix = 'FAKELAG',
    public_enabled = true,
    updated_at = now(),
    notes = coalesce(notes, '') || E'\nV3.3 hotfix: force Fake Lag public keys to FAKELAG prefix.'
where app_code = 'fake-lag';
