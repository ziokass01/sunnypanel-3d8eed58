# FREE RATE LIMIT FIX (Production)

## Triệu chứng
`/free` bấm **Get Key** trả lỗi đỏ `RATE_LIMIT_CHECK_FAILED` hoặc `SERVER_RATE_LIMIT_MISCONFIG`.

## Nguyên nhân
Edge Function `free-start` gọi RPC `check_free_ip_rate_limit`, nhưng production DB đang thiếu/mismatch object rate-limit (function/table/policy), thường do migration chưa chạy đầy đủ.

## Cách fix nhanh (owner)
1. Mở **Supabase Dashboard → SQL Editor**.
2. Mở file migration mới trong repo: `supabase/migrations/20260205170000_free_rate_limit_and_admin_controls.sql`.
3. Copy toàn bộ SQL trong file và chạy 1 lần trên production.
4. Test lại `/free`.

> Migration này là **idempotent**: có thể chạy lại an toàn, tự tạo (nếu thiếu) table/index/RLS/policy/RPC cho IP + fingerprint rate-limit.

## Kết quả sau khi áp dụng
- `free-start` không còn fail vì thiếu `check_free_ip_rate_limit`.
- Có thêm lớp chống spam theo fingerprint (`check_free_fp_rate_limit`) khi client gửi fingerprint.
- Có bảng log `licenses_free_security_logs` để audit các trường hợp rate-limit/blocklist.
- Nếu DB chưa apply migration, frontend sẽ báo thân thiện: “Server đang cấu hình thiếu, vui lòng thử lại sau”.
