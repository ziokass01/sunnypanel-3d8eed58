-- Fake Lag v2.8 dynamic challenge + client integrity pinning support.
-- Safe additive migration: does not enable fail-closed integrity by itself.

alter table public.server_app_version_policies
  add column if not exists require_client_integrity boolean not null default false,
  add column if not exists allowed_apk_sha256 text[] not null default '{}',
  add column if not exists allowed_so_sha256 text[] not null default '{}',
  add column if not exists allowed_dex_crc text[] not null default '{}';

update public.server_app_version_policies
set
  require_client_integrity = coalesce(require_client_integrity, false),
  allowed_apk_sha256 = coalesce(allowed_apk_sha256, '{}'),
  allowed_so_sha256 = coalesce(allowed_so_sha256, '{}'),
  allowed_dex_crc = coalesce(allowed_dex_crc, '{}')
where app_code = 'fake-lag';
