-- Fake Lag v2.6 release policy seed
-- Safe/idempotent: bumps server-side default policy so old APKs can be blocked from panel.

insert into public.server_app_version_policies (
  app_code, enabled, force_update_enabled, min_version_name, min_version_code,
  latest_version_name, latest_version_code, update_url, update_title, update_message,
  allowed_package_names, allowed_signature_sha256, block_unknown_signature, blocked_version_codes, notes
)
values (
  'fake-lag', true, true, '2.6', 8,
  '2.6', 8, 'https://mityangho.id.vn/free',
  'Yêu cầu cập nhật',
  'Phiên bản Fake Lag bạn đang dùng đã cũ hoặc đã bị chặn. Vui lòng cập nhật bản mới để tiếp tục sử dụng.',
  array['com.fakelag.cryhard8']::text[],
  array['2DEB73EF73E9B31C84C3D100076BC4D65C8C853AAB5ED7CD1E24DE51A4CDCC33']::text[],
  false,
  array[1,2,3,4,5,6,7]::integer[],
  'Seed v2.6/code 8. Bật block_unknown_signature sau khi đã test APK ký bằng keystore JKS 2048.'
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
  allowed_signature_sha256 = case
    when coalesce(array_length(public.server_app_version_policies.allowed_signature_sha256, 1), 0) = 0 then excluded.allowed_signature_sha256
    else public.server_app_version_policies.allowed_signature_sha256
  end,
  blocked_version_codes = (
    select array_agg(distinct code order by code)
    from unnest(coalesce(public.server_app_version_policies.blocked_version_codes, array[]::integer[]) || excluded.blocked_version_codes) as code
  ),
  notes = excluded.notes,
  updated_at = now();
