# Phase 1 patch summary

## English
This patch adds the first safe layer for multi-app free key management without breaking the running rent flow.

Completed in this package:
- Added `Server app` entry under `Reset Logs`
- Added `AdminServerAppsPage` with app cards for `Free Fire` and `Find Dumps`
- Added admin route `/admin/apps`
- Softened `Audit logs` to load recent windows first to avoid timeout on large tables
- Added migration for `licenses_free_key_types`:
  - `app_code`
  - `app_label`
  - `key_signature`
  - `allow_reset`
- Updated free key type frontend to support app/signature/reset flag
- Updated free config/frontend types to carry app/signature/reset metadata
- Updated free reveal flow to stamp metadata into `licenses.note`
- Updated reset-key edge function to block reset when note says `ALLOW_RESET=0`
- Updated public `/free` UI to hide reset button when the key type does not allow reset

Not fully implemented in this phase:
- Separate premium app server pages for Classic / Go / Plus / Pro / Credit
- Gift / reward tab in the Android app
- Credit wallet logic and entitlement APIs

## Tiếng Việt
Bản vá này thêm lớp đầu tiên an toàn cho việc quản lý key free nhiều app mà không đụng sai sang flow rent đang chạy.

Đã làm trong gói này:
- Thêm tab `Server app` dưới `Reset Logs`
- Thêm `AdminServerAppsPage` với card cho `Free Fire` và `Find Dumps`
- Thêm route admin `/admin/apps`
- Giảm tải `Audit logs` theo cửa sổ gần đây để tránh timeout khi bảng log quá lớn
- Thêm migration cho `licenses_free_key_types`:
  - `app_code`
  - `app_label`
  - `key_signature`
  - `allow_reset`
- Sửa frontend `Free keys` để hỗ trợ app/chữ ký/cờ reset
- Sửa type free config/frontend để mang metadata app/chữ ký/reset
- Sửa flow `free-reveal` để đóng dấu metadata vào `licenses.note`
- Sửa edge function `reset-key` để chặn reset khi note có `ALLOW_RESET=0`
- Sửa UI public `/free` để ẩn nút reset nếu loại key đó không cho reset

Chưa làm hết ở phase này:
- Trang server app riêng cho Classic / Go / Plus / Pro / Credit
- Tab quà tặng / nhập key trong app Android
- Ví credit và entitlement API
