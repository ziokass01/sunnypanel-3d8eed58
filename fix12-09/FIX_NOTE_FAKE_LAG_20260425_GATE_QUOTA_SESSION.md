# Fake Lag gate/quota/session fix - 2026-04-25

## Đã sửa

1. Link4M callback không còn dùng `edge-runtime.supabase.com/free/gate`.
   - `free-start`, `free-gate`, `free-config` ưu tiên `FREE_PUBLIC_BASE_URL`, `PUBLIC_BASE_URL`, fallback `https://mityangho.id.vn`.
   - Nếu request chạy trực tiếp từ Supabase Edge Runtime thì không lấy host đó làm gate URL public.

2. Quota `/free` của Fake Lag lấy từ `Server app → Fake Lag → Server key`.
   - `free-config` đọc `license_access_rules` cho `fake-lag`.
   - Khi lưu Server key Fake Lag, app-host đồng bộ sang `server_app_settings`.
   - Tránh việc trang `/free` hiện 3 trong khi Server key Fake Lag đã chỉnh 50.

3. Auth không trừ lượt verify khi cùng thiết bị đăng nhập lại/refresh.
   - `fake-lag-auth` chỉ gọi RPC tăng lượt khi bind thiết bị mới.
   - Tránh lỗi rớt session hoặc báo hết lượt sau khi đã login.

4. Unlock key an toàn hơn.
   - Unlock sẽ set `is_active=true` và `deleted_at=null`.
   - Key lỡ nằm trash/soft-delete sẽ không còn bị kẹt trạng thái.

## Deploy

```bash
npx supabase db push
npx supabase functions deploy free-config --no-verify-jwt
npx supabase functions deploy free-start --no-verify-jwt
npx supabase functions deploy free-gate --no-verify-jwt
npx supabase functions deploy free-reveal --no-verify-jwt
npx supabase functions deploy fake-lag-auth --no-verify-jwt
```
