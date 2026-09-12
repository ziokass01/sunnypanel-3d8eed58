# Patch note 2026-04-11: Find Dumps 403 + decimal server key + phase 1-2 sync

## Repo
- Đổi nút `Mở server web` của Find Dumps sang mở **đường nội bộ cùng host hiện tại** (`/admin/apps/:appCode/keys` hoặc `/apps/:appCode/keys`) để tránh 403 do nhảy chéo subdomain / mất phiên admin.
- Sửa trang `AdminServerAppKeys` để ô credit server key dùng nhập decimal kiểu text + `inputMode=decimal`, giữ được các trạng thái như `1.`, `1.2`, `1.23` trên mobile.
- Thêm fallback server-side cho `server_app_runtime` khi DB thiếu seed của Find Dumps:
  - plans phase 1
  - feature catalog phase 1-2
  - unlock rules phase 1-2
- Mở rộng template feature ở `AdminServerAppDetail` để khớp app phase 1-2 hơn.

## App
- Đồng bộ parser runtime cost từ `int` sang `double` để app không làm rơi số lẻ như `0.2`, `1.5` khi đọc catalog/runtime state từ server.
- Thêm formatter hiển thị cost gọn cho Runtime Center / App Hub / unlock flow.
