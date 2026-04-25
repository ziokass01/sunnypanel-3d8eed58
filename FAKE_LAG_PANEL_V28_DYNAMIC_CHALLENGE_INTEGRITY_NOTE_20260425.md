# Fake Lag panel/server v2.8 dynamic challenge + integrity pinning

Đã thêm vào `fake-lag-auth`:

1. Server phát `server_challenge` động theo key/device/signature/build/mode.
2. Engine/heartbeat bắt buộc gửi `challenge_response` hợp lệ từ native.
3. Server phát `engine_grant` ngắn hạn; app packet-loop phụ thuộc grant này.
4. Server phát `server_watermark` riêng theo key/device để truy vết leak theo người test/key.
5. Server nhận và audit `apk_sha256`, `so_sha256`, `dex_crc`, `integrity_mix`.
6. Thêm policy optional:
   - `require_client_integrity`
   - `allowed_apk_sha256`
   - `allowed_so_sha256`
   - `allowed_dex_crc`

## Deploy

```bash
npx supabase link --project-ref uvqgpgkaxpiczasfwzgm
npx supabase db push
npx supabase functions deploy fake-lag-auth --no-verify-jwt
npx supabase functions deploy fake-lag-check --no-verify-jwt
```

## Cách pin checksum sau khi build APK release thật

Sau khi build/sign bản release và login/test 1 lần, xem audit `VERIFY` mới nhất của app Fake Lag để lấy:

- `apk_sha256`
- `so_sha256`
- `dex_crc`

Sau đó chạy SQL tương tự:

```sql
update public.server_app_version_policies
set
  require_client_integrity = true,
  allowed_apk_sha256 = array['APK_SHA256_RELEASE_THAT'],
  allowed_so_sha256 = array['SO_SHA256_RELEASE_THAT'],
  allowed_dex_crc = array['DEX_CRC_RELEASE_THAT']
where app_code = 'fake-lag';
```

Đừng bật `require_client_integrity` khi chưa có checksum release thật, vì sẽ tự chặn app hợp lệ.
