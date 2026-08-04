# Phase 10.3 - Mobile auth wiring

## Thêm mới
- Edge function `mobile-auth-email`
- Web routes `/mobile-auth/google` và `/mobile-auth/callback`
- App deep link `sunnymod://auth/callback`

## Flow Google
1. App mở `https://app.mityangho.id.vn/mobile-auth/google?return_to=sunnymod://auth/callback`
2. Web gọi Supabase OAuth Google
3. Sau callback, web lấy session rồi redirect về app bằng deep link
4. App lưu email / access token / refresh token vào `HubPrefs`

## Flow email
- `login` -> `mobile-auth-email` -> `/auth/v1/token?grant_type=password`
- `register` -> `mobile-auth-email` -> `/auth/v1/signup`
- `reset` -> `mobile-auth-email` -> `/auth/v1/recover`

## Env cần có
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` hoặc `SUPABASE_ANON_KEY`
- `APP_BASE_URL=https://app.mityangho.id.vn`

## Supabase Auth settings
- Bật Google provider
- Allowed redirect URLs phải có:
  - `https://app.mityangho.id.vn/mobile-auth/callback`
  - `https://admin.mityangho.id.vn/mobile-auth/callback` nếu cần test ở admin host
