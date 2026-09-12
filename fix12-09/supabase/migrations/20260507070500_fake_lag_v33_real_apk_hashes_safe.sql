-- Fake Lag V3.3 / versionCode 13 real APK hash allowlist.
-- Generated from user-built APK: /storage/emulated/0/My file/SunnyMod - Fake Lag_3.3.apk
-- APK  = 7F9B068F185D58C919E95EFF594C4EC0F9641870C81EE7EC5BFC2F4988AFA0DC
-- SO64 = 8DC6E1320CFB3872C5C0E3194C4CE6FF3FFCCC87C0C6D34595EC96D138CB8A25
-- SO7  = 5CC48456F27BD63E03DEDC39DE016E667D9C686BB2583198B4310E1E80D5CAC6
-- DEX  = 84B0E841
-- Signature SHA256 was not pasted in the chat, so this migration keeps signature matching non-strict.
-- Scope: fake-lag only.

do $$
declare
  v_apk text := '7F9B068F185D58C919E95EFF594C4EC0F9641870C81EE7EC5BFC2F4988AFA0DC';
  v_so64 text := '8DC6E1320CFB3872C5C0E3194C4CE6FF3FFCCC87C0C6D34595EC96D138CB8A25';
  v_so7 text := '5CC48456F27BD63E03DEDC39DE016E667D9C686BB2583198B4310E1E80D5CAC6';
  v_dex text := '84B0E841';
begin
  if not exists (
    select 1 from public.server_app_version_policies where app_code = 'fake-lag'
  ) then
    insert into public.server_app_version_policies (app_code, enabled)
    values ('fake-lag', true);
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='server_app_version_policies'
      and column_name='allowed_apk_sha256'
  ) then
    execute
      'update public.server_app_version_policies
       set allowed_apk_sha256 = (
         select array_agg(distinct upper(x))
         from unnest(coalesce(allowed_apk_sha256, array[]::text[]) || array[$1]::text[]) as t(x)
       )
       where app_code = $2'
    using v_apk, 'fake-lag';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='server_app_version_policies'
      and column_name='allowed_so_sha256'
  ) then
    execute
      'update public.server_app_version_policies
       set allowed_so_sha256 = (
         select array_agg(distinct upper(x))
         from unnest(coalesce(allowed_so_sha256, array[]::text[]) || array[$1, $2]::text[]) as t(x)
       )
       where app_code = $3'
    using v_so64, v_so7, 'fake-lag';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='server_app_version_policies'
      and column_name='allowed_dex_crc'
  ) then
    execute
      'update public.server_app_version_policies
       set allowed_dex_crc = (
         select array_agg(distinct upper(x))
         from unnest(coalesce(allowed_dex_crc, array[]::text[]) || array[$1]::text[]) as t(x)
       )
       where app_code = $2'
    using v_dex, 'fake-lag';
  end if;

  -- Keep legacy expected_* columns in sync when they exist.
  if exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='server_app_version_policies'
      and column_name='expected_apk_sha256'
  ) then
    execute 'update public.server_app_version_policies set expected_apk_sha256 = $1 where app_code = $2'
    using v_apk, 'fake-lag';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='server_app_version_policies'
      and column_name='expected_so_sha256'
  ) then
    execute 'update public.server_app_version_policies set expected_so_sha256 = $1 where app_code = $2'
    using v_so64, 'fake-lag';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='server_app_version_policies'
      and column_name='expected_dex_crc'
  ) then
    execute 'update public.server_app_version_policies set expected_dex_crc = $1 where app_code = $2'
    using v_dex, 'fake-lag';
  end if;

  -- Move live policy to V3.3/V13 and block older app versions.
  if exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='server_app_version_policies'
      and column_name='min_version_name'
  ) then
    execute 'update public.server_app_version_policies set min_version_name=$1, latest_version_name=$1 where app_code=$2'
    using '3.3', 'fake-lag';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='server_app_version_policies'
      and column_name='min_version_code'
  ) then
    execute 'update public.server_app_version_policies set min_version_code=$1, latest_version_code=$1 where app_code=$2'
    using 13, 'fake-lag';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='server_app_version_policies'
      and column_name='force_update_enabled'
  ) then
    execute 'update public.server_app_version_policies set force_update_enabled=true, enabled=true where app_code=$1'
    using 'fake-lag';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='server_app_version_policies'
      and column_name='allowed_package_names'
  ) then
    execute
      'update public.server_app_version_policies
       set allowed_package_names = (
         select array_agg(distinct lower(x))
         from unnest(coalesce(allowed_package_names, array[]::text[]) || array[$1]::text[]) as t(x)
       )
       where app_code = $2'
    using 'com.fakelag.sunnymod', 'fake-lag';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='server_app_version_policies'
      and column_name='blocked_version_codes'
  ) then
    execute
      'update public.server_app_version_policies
       set blocked_version_codes = array_remove(coalesce(blocked_version_codes, array[]::integer[]), 13)
       where app_code = $1'
    using 'fake-lag';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='server_app_version_policies'
      and column_name='blocked_version_names'
  ) then
    execute
      'update public.server_app_version_policies
       set blocked_version_names = array_remove(coalesce(blocked_version_names, array[]::text[]), ''3.3'')
       where app_code = $1'
    using 'fake-lag';
  end if;

  -- Signature SHA256 was not provided. Do not fail users on unknown signature yet.
  if exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='server_app_version_policies'
      and column_name='require_client_integrity'
  ) then
    execute 'update public.server_app_version_policies set require_client_integrity = true where app_code = $1'
    using 'fake-lag';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='server_app_version_policies'
      and column_name='block_unknown_signature'
  ) then
    execute 'update public.server_app_version_policies set block_unknown_signature = false where app_code = $1'
    using 'fake-lag';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='server_app_version_policies'
      and column_name='require_signature_match'
  ) then
    execute 'update public.server_app_version_policies set require_signature_match = false where app_code = $1'
    using 'fake-lag';
  end if;

  update public.license_access_rules
  set key_prefix = 'FAKELAG',
      public_enabled = true,
      updated_at = now()
  where app_code = 'fake-lag';

  raise notice 'Fake Lag V3.3/V13 real APK hashes allowed: APK %, SO64 %, SO7 %, DEX %', v_apk, v_so64, v_so7, v_dex;
end $$;
