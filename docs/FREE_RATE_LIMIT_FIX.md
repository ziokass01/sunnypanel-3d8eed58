# FREE RATE LIMIT FIX (Production)

## Triệu chứng
`/free` bấm **Get Key** trả lỗi đỏ `RATE_LIMIT_CHECK_FAILED` hoặc `SERVER_RATE_LIMIT_MISCONFIG`.

## Nguyên nhân
Edge Function `free-start` gọi RPC `check_free_ip_rate_limit`, nhưng production DB đang thiếu/mismatch object rate-limit (function/table/policy), thường do migration chưa chạy đầy đủ.

## Cách fix nhanh (owner)
1. Mở **Supabase Dashboard → SQL Editor**.
2. Mở file migration mới trong repo: `supabase/migrations/20260205193000_fix_free_rate_limit_rpc_and_admin_ops.sql`.
3. Copy toàn bộ SQL trong file và chạy 1 lần trên production.
4. Test lại `/free`.

## Query kiểm tra nhanh sau khi apply
```sql
select proname from pg_proc where proname='check_free_ip_rate_limit';
select * from free_ip_rate_limits limit 1;
```

> Migration này là **idempotent**: có thể chạy lại an toàn, tự tạo (nếu thiếu) table/index/RLS/policy/RPC cho IP + fingerprint rate-limit.

## Kết quả sau khi áp dụng
- `free-start` không còn fail vì thiếu `check_free_ip_rate_limit`.
- Có thêm lớp chống spam theo fingerprint (`check_free_fp_rate_limit`) khi client gửi fingerprint.
- Có bảng log `licenses_free_security_logs` để audit các trường hợp rate-limit/blocklist.
- Nếu DB chưa apply migration, frontend sẽ báo thân thiện: “Server đang cấu hình thiếu, vui lòng thử lại sau”.
- Các function admin-only (`admin-free-test`, `admin-free-block`, `admin-free-delete-session`, `admin-free-delete-issued`) cần được deploy và bật `verify_jwt=true` trong `supabase/config.toml`.
- Với `assertAdmin`, cần set secret `ADMIN_EMAILS` (ví dụ: `mquyet399@gmail.com`) trong Supabase Edge Functions secrets, hoặc đảm bảo user có role `admin` qua RPC `has_role`.


## Bổ sung fix 401 cho trang `/admin/free-keys`
- Frontend đã được chuẩn hoá gọi `admin-free-test` qua `postFunction(..., { authToken })` để luôn đính kèm `Authorization: Bearer <JWT>`.
- Cần đảm bảo đã cấu hình secret cho Edge Functions:
  - `ADMIN_EMAILS` (danh sách email admin, phân tách dấu phẩy)
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Sau khi cập nhật secret, redeploy lại các hàm `admin-free-*`, `free-start`, `free-gate`, `free-reveal`.

## Migration tổng hợp khuyến nghị
Ngoài các migration trước đó, có thể chạy thêm file `supabase/migrations/20260206101500_free_license_system_hardening.sql` để đảm bảo đồng bộ toàn bộ object cho free-flow (rate-limit bảng/hàm, blocklist `blocked_until`, session columns, admin logs, compat view).
