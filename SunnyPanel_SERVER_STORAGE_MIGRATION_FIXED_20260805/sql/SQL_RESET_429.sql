-- SQL_RESET_429.sql
-- Chạy trong Supabase SQL Editor khi IP/key đang bị 429 do test spam.
-- Thay YOUR_IP và SUNNY-XXXX-XXXX-XXXX bằng giá trị thật, hoặc chỉ chạy phần SELECT để xem lý do.

-- 1) Xem 50 log verify gần nhất để biết 429 thuộc loại nào: IP_ONLY / key+ip / NEW_DEVICE / IP_BLOCKED.
SELECT created_at, license_key, detail
FROM public.audit_logs
WHERE action = 'VERIFY'
ORDER BY created_at DESC
LIMIT 50;

-- 2) Mở khóa IP đang bị block tạm thời.
-- DELETE FROM public.blocked_ips
-- WHERE ip = 'YOUR_IP';

-- 3) Xóa counter rate-limit hiện tại cho IP/key sau khi đã sửa app không spam request.
-- DELETE FROM public.verify_ip_rate_limits
-- WHERE ip = 'YOUR_IP';

-- DELETE FROM public.verify_rate_limits
-- WHERE license_key = upper('SUNNY-XXXX-XXXX-XXXX');

-- DELETE FROM public.verify_new_device_rate_limits
-- WHERE license_key = upper('SUNNY-XXXX-XXXX-XXXX');

-- 4) Dọn nonce cũ.
DELETE FROM public.request_nonces
WHERE expires_at < now();
