# SESSION NULL FIX V4 - 2026-04-24

## Mục tiêu
Fix lỗi OAuth Google mobile callback rơi vào `session === null`.

## File đã sửa
- `src/pages/MobileGoogleCallback.tsx`

## Nguyên nhân
Bản cũ chỉ poll `supabase.auth.getSession()`. Trên mobile/webview, Supabase OAuth callback có thể trả:
- token ở URL hash: `#access_token=...&refresh_token=...`
- hoặc PKCE code ở query: `?code=...`

Nếu chỉ gọi `getSession()` khi SDK chưa kịp hydrate, app sẽ nhận `session` null và không có token để trả về deep link Android.

## Cách sửa
Callback mới xử lý theo thứ tự:
1. Nếu URL có `#access_token` + `refresh_token`, gọi `supabase.auth.setSession()`.
2. Nếu URL có `?code=...`, gọi `supabase.auth.exchangeCodeForSession(code)`.
3. Nếu vẫn chưa có, fallback poll `getSession()` nhiều lần hơn.
4. Khi có session, redirect về `sunnymod://auth/callback` kèm `access_token`, `refresh_token`, `email`, `user_id`.
