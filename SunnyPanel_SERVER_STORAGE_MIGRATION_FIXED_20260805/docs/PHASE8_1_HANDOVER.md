# Phase 8.1 handover

Đợt này tập trung vào việc **di chuyển giao diện**, tách từng app thành một workspace riêng, nhưng **không đổi logic runtime hiện tại** và vẫn nằm dưới quyền admin.

## Tệp đã sửa
- `src/App.tsx`
- `src/pages/AdminServerApps.tsx`
- `src/pages/AdminServerAppRuntime.tsx`
- `src/pages/AppWorkspaceDashboard.tsx`
- `src/shell/AppWorkspaceShell.tsx`
- `docs/PHASE8_1_HANDOVER.md`

## Những gì đã đổi
- Thêm route workspace riêng cho từng app:
  - `/apps/:appCode/dashboard`
  - `/apps/:appCode/internal`
  - `/apps/:appCode/runtime`
- Giữ quyền admin bằng cách bọc các route mới trong `AuthGate + PanelRoute + AdminRoute`
- `AdminServerApps` giờ mở vào workspace riêng thay vì đẩy thẳng vào màn admin cũ
- Route cũ:
  - `/admin/apps/:appCode`
  - `/admin/apps/:appCode/runtime`
  đã được chuyển hướng sang workspace mới
- Runtime page bỏ tìm kiếm tổng và đổi thành 3 ô tìm kiếm đúng chỗ:
  - tài khoản / thiết bị
  - redeem key
  - log / transaction / event
- Runtime page đổi nút quay lại về dashboard app workspace

## Cái cố ý không đụng
- Không đổi function Supabase
- Không đổi migration
- Không đụng flow redeem / consume / heartbeat / ops đang chạy
- Không đổi quyền admin hiện có

## Cách test nhanh
1. Vào `Server app`
2. Bấm `Mở workspace`
3. Kiểm tra 3 trang:
   - Dashboard app
   - Cấu hình nội bộ
   - Runtime admin
4. Ở Runtime:
   - ô tìm tài khoản phải lọc entitlements / wallets / sessions
   - ô tìm redeem key chỉ lọc redeem keys
   - ô tìm log phải lọc transactions / events
5. Thử mở đường dẫn cũ `/admin/apps/find-dumps` hoặc `/admin/apps/find-dumps/runtime`
   - phải tự chuyển sang workspace mới
