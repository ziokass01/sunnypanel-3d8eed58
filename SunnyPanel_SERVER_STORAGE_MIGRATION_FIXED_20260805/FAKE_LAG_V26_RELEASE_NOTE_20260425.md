# Fake Lag v2.6 release note - 2026-04-25

## Nội dung đã sửa

- Sửa lỗi frontend Runtime app: `toIntLines is not defined` khi bấm lưu Runtime app / Version guard.
- Bổ sung migration seed chính sách Fake Lag v2.6: versionName `2.6`, versionCode `8`, block code cũ `1..7`.
- Seed SHA-256 release JKS 2048 mới: `2D:EB:73:EF:73:E9:B3:1C:84:C3:D1:00:07:6B:C4:D6:5C:8C:85:3A:AB:5E:D7:CD:1E:24:DE:51:A4:CD:CC:33`.

## Deploy

```bash
npx supabase link --project-ref uvqgpgkaxpiczasfwzgm
npx supabase db push
npx supabase functions deploy fake-lag-check --no-verify-jwt
npx supabase functions deploy fake-lag-auth --no-verify-jwt
```

Sau khi test APK v2.6/code 8 đăng nhập ổn, mới bật `block_unknown_signature` trong Runtime app để chặn app repack/ký lạ.
