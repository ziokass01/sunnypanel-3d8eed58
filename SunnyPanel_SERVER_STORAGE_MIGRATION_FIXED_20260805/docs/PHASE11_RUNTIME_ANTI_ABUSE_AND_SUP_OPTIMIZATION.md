# Phase 11 - runtime anti-abuse + Supabase quota optimization

## Mục tiêu
- Chặn spam redeem / consume / heartbeat theo IP, account, device.
- Khóa account bám theo device đầu hoặc IP đầu khi admin bật cờ.
- Giảm lãng phí quota Supabase bằng cách:
  - bỏ log success của `health` và `heartbeat` mặc định.
  - chuyển các phép đếm rate-limit từ `count(*)` trên bảng events sang bucket counters nhỏ hơn.

## File đã sửa
- `supabase/functions/_shared/server_app_runtime.ts`
- `supabase/functions/server-app-runtime/index.ts`
- `supabase/functions/server-app-runtime-ops/index.ts`
- `src/pages/AdminServerAppRuntime.tsx`
- `supabase/migrations/20260406150000_server_app_runtime_phase8_antibuse_and_quota.sql`

## Điểm chính đã thêm
### 1. Runtime controls mới
- `max_requests_per_10m_per_ip`
- `max_requests_per_10m_per_account`
- `max_requests_per_10m_per_device`
- `max_failed_redeems_per_hour_per_ip`
- `max_failed_redeems_per_hour_per_account`
- `max_failed_redeems_per_hour_per_device`
- `max_accounts_per_device`
- `max_devices_per_account`
- `lock_account_to_first_device`
- `lock_account_to_first_ip`
- `success_health_logs_enabled`
- `success_heartbeat_logs_enabled`

### 2. Bảng runtime mới
- `server_app_runtime_counter_buckets`
  - bucket 10 phút / 1 giờ / 1 ngày
  - theo subject: ip / account / device
  - giúp giảm query `count(*)` trên bảng event lớn
- `server_app_runtime_account_devices`
- `server_app_runtime_device_accounts`
- `server_app_runtime_account_bindings`

### 3. Runtime public được harden thêm
- rate limit request chung theo 10 phút
- rate limit redeem lỗi theo 1 giờ
- rate limit redeem thành công theo 1 ngày
- enforce account-device/IP binding khi redeem
- touch session / consume cũng update binding để khóa account theo server

### 4. Tối ưu quota Supabase
- `health` success mặc định không ghi event
- `heartbeat` success mặc định không ghi event
- rate limit đọc bucket counter thay vì quét cả event log

## Chưa làm ở phase này
- chưa thêm dashboard riêng cho counter buckets / account-device links
- chưa thêm tự động block vào danh sách blocked_accounts/blocked_devices khi vượt ngưỡng nhiều lần
- chưa thêm cache nội bộ ở app Android

## Thứ tự deploy
1. migration
2. function `server-app-runtime`
3. function `server-app-runtime-ops`
4. frontend `src/pages/AdminServerAppRuntime.tsx`

## Gợi ý default an toàn cho Find Dumps
- request/IP/10m = 120
- request/account/10m = 60
- request/device/10m = 60
- redeem fail/IP/1h = 12
- redeem fail/account/1h = 8
- redeem fail/device/1h = 8
- max accounts/device = 2
- max devices/account = 2
- lock account to first device = true nếu muốn khóa cứng
- lock account to first ip = false lúc đầu để đỡ false positive khi user đổi mạng
