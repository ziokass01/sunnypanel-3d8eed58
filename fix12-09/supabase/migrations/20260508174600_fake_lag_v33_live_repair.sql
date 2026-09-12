update public.server_app_version_policies
set
  enabled = true,
  force_update_enabled = true,
  min_version_name = '3.3',
  min_version_code = 13,
  latest_version_name = '3.3',
  latest_version_code = 13,
  update_url = 'https://mityangho.id.vn/free',
  update_title = 'Yêu cầu cập nhật',
  update_message = 'Đã cập nhật Fake Lag V3.3. Vui lòng tải bản mới để tiếp tục sử dụng.',
  allowed_package_names = array['com.fakelag.sunnymod']::text[],
  allowed_signature_sha256 = array[
    'A22085D77401CBEB79F98B6B5ADAFC071F208B7EEAAF763E19428E3AD3E29812'
  ]::text[],
  allowed_apk_sha256 = array[
    '7F9B068F185D58C919E95EFF594C4EC0F9641870C81EE7EC5BFC2F4988AFA0DC'
  ]::text[],
  allowed_so_sha256 = array[
    '8DC6E1320CFB3872C5C0E3194C4CE6FF3FFCCC87C0C6D34595EC96D138CB8A25',
    '5CC48456F27BD63E03DEDC39DE016E667D9C686BB2583198B4310E1E80D5CAC6'
  ]::text[],
  allowed_dex_crc = array['84B0E841']::text[],
  require_client_integrity = true,
  block_unknown_signature = false,
  require_signature_match = false,
  block_missing_identity = true,
  blocked_version_codes = array_remove(coalesce(blocked_version_codes, array[]::integer[]), 13),
  blocked_version_names = array_remove(coalesce(blocked_version_names, array[]::text[]), '3.3'),
  blocked_build_ids = array_remove(coalesce(blocked_build_ids, array[]::text[]), 'fl-2026-05-07-v13-v33-hardening'),
  login_token_ttl_seconds = 900,
  engine_token_ttl_seconds = 600,
  heartbeat_seconds = 90
where app_code = 'fake-lag';

insert into public.license_access_rules (
  app_code,
  key_prefix,
  default_duration_seconds,
  max_devices_per_key,
  max_ips_per_key,
  max_verify_per_key,
  public_enabled,
  allow_reset,
  notes
)
values (
  'fake-lag',
  'FAKELAG',
  86400,
  1,
  999999,
  999999,
  true,
  true,
  'V3.3 live repair'
)
on conflict (app_code) do update
set
  key_prefix = 'FAKELAG',
  public_enabled = true,
  allow_reset = true,
  max_ips_per_key = 999999,
  max_verify_per_key = 999999,
  updated_at = now(),
  notes = 'V3.3 live repair';

update public.licenses
set
  app_code = 'fake-lag',
  is_active = true,
  deleted_at = null,
  max_ips = 999999,
  max_verify = 999999
where upper(key) like 'FAKELAG-%';

delete from public.license_ip_bindings
where license_id in (
  select id from public.licenses
  where upper(key) like 'FAKELAG-%'
);

update public.server_app_security_blocks
set enabled = false,
    blocked_until = null,
    last_seen_at = now()
where app_code = 'fake-lag';
