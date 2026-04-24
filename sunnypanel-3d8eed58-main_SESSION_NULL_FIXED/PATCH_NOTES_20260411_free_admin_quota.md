# Patch notes 2026-04-11

## Đã sửa
- Nới `key_type_code` để admin test get key không còn `BAD_REQUEST` với code dài.
- Sửa flow `/free` cho Find Dumps:
  - chỉ bung lựa chọn khi admin bật ở `AdminFreeKeys`
  - nếu admin tắt bung, user chỉ vượt key và dùng mặc định đã chốt
- Thêm quota FREE theo từng app trong `server_app_settings`:
  - `free_daily_limit_per_fingerprint`
  - `free_daily_limit_per_ip`
- `/free` hiển thị remaining quota theo app đang chọn.
- `free-reveal` enforce quota theo app thay vì chỉ đọc limit global.
- `free-start` fallback an toàn khi DB chưa có cột mới.
- Admin auth bền hơn:
  - hỗ trợ `ADMIN_EMAILS`, `ADMIN_EMAIL`, `ADMIN_MAIL`, `ADMIN_EMAIL_SECRET`
  - nếu email admin hợp lệ nhưng role chưa có, function sẽ tự seed `user_roles(admin)`.

## Cần làm sau khi kéo repo
1. Chạy migration mới:
   - `supabase/migrations/20260411130000_free_key_types_expand_and_server_app_quota.sql`
2. Deploy lại các functions:
   - `free-config`
   - `free-start`
   - `free-reveal`
   - `admin-free-test`
   - `free-admin-test`
   - `server-app-runtime-ops`
3. Nếu dùng admin email secret, đảm bảo đã set ít nhất một trong các env:
   - `ADMIN_EMAILS`
   - `ADMIN_EMAIL`
   - `ADMIN_MAIL`
   - `ADMIN_EMAIL_SECRET`
4. Turnstile site/secret vẫn là env ngoài repo. Repo không thể tự giữ secret sau mỗi lần deploy host mới.
