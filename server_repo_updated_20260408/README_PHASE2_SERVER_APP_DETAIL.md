# SunnyPanel Phase 2 - Server app detail

## English
This phase adds an internal admin page for each app under **Server app**.

### Included
- Route: `/admin/apps/:appCode`
- Page: `AdminServerAppDetailPage`
- New migration: `20260404193000_server_apps_phase2.sql`
- Internal configuration areas:
  - app settings
  - plans & credit
  - feature flags
- Safe additive approach: no rent logic touched

### Why
This is the second layer after **Free keys**.
Use it to prepare per-app settings for:
- Classic / Go / Plus / Pro
- soft credit / premium credit
- device & account limits
- gift tab label
- key persistence until admin revoke
- feature costs and required plan

### Deploy order
1. Run migration `20260404193000_server_apps_phase2.sql`
2. Deploy frontend
3. Open `/admin/apps`
4. Test `/admin/apps/find-dumps` and `/admin/apps/free-fire`

## Tiếng Việt
Phase này thêm màn quản lý nội bộ cho từng app dưới tab **Server app**.

### Đã thêm
- Route: `/admin/apps/:appCode`
- Trang: `AdminServerAppDetailPage`
- Migration mới: `20260404193000_server_apps_phase2.sql`
- Các vùng cấu hình nội bộ:
  - cấu hình app
  - gói & credit
  - feature flags
- Làm theo kiểu cộng thêm, không đụng sang logic rent

### Mục đích
Đây là tầng 2 sau **Free keys**.
Dùng để chuẩn bị cấu hình riêng cho từng app:
- Classic / Go / Plus / Pro
- credit thường / credit kim cương
- giới hạn thiết bị & tài khoản
- tên tab quà tặng
- key nhập đúng thì giữ tới khi admin revoke
- cost của từng tính năng và plan tối thiểu

### Thứ tự deploy
1. Chạy migration `20260404193000_server_apps_phase2.sql`
2. Deploy frontend
3. Mở `/admin/apps`
4. Test `/admin/apps/find-dumps` và `/admin/apps/free-fire`
