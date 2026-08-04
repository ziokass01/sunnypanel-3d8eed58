# Phase feature unlock repo foundation - 2026-04-10

## Mục tiêu
Đồng bộ repo web/app-host với app Android phase mở khóa chức năng:
- mở khóa là lớp quyền riêng, không thay cho tiêu hao credit
- Binary Workspace / batch diện rộng / export ngoài đều có thể bị khóa trước cửa
- khi đã mở khóa, lúc dùng tác vụ nặng vẫn tiếp tục trừ credit theo feature riêng

## Đã làm

### 1) Charge / Credit Rules có thêm cụm Mở khóa chức năng
- File: `src/pages/AdminServerAppCharge.tsx`
- Thêm query + save cho bảng `server_app_feature_unlock_rules`
- UI chỉnh được:
  - bật/tắt rule
  - yêu cầu mở khóa hay không
  - thời hạn mở khóa (giờ)
  - giá mở khóa thường / VIP
  - gói được mở free
  - danh sách feature bị guard bởi rule
  - cho gia hạn

### 2) Thêm policy nền ở client web
- File: `src/lib/serverAppPolicies.ts`
- Thêm `FIND_DUMPS_UNLOCKS`
- Giữ logic hiện tại nhưng có dữ liệu chuẩn để UI/route tham chiếu

### 3) Runtime trả tín hiệu mở khóa cho app
- File: `supabase/functions/_shared/server_app_runtime.ts`
- `buildRuntimeState()` giờ gắn thêm vào feature:
  - `unlock_required`
  - `unlocked`
  - `unlock_expires_at`
  - `unlock_label`
  - `unlock_feature_code`
  - `unlock_soft_cost`
  - `unlock_premium_cost`
- Điều này giúp app Android block đúng trước cửa theo rule server

### 4) Có action backend để mở khóa thật
- File: `supabase/functions/server-app-runtime/index.ts`
- Thêm action `unlock_feature`
- Runtime có thể:
  - kiểm tra session/account
  - check rule mở khóa
  - áp plan free nếu gói được miễn
  - trừ credit nếu cần
  - tạo/gia hạn entitlement mở khóa
  - trả lại state mới

### 5) Migration nền
- File: `supabase/migrations/20260410230000_feature_unlock_foundation.sql`
- Tạo bảng:
  - `server_app_feature_unlock_rules`
  - `server_app_feature_unlocks`
- Seed rule cho Find Dumps:
  - `unlock_binary_workspace`
  - `unlock_batch_tools`
  - `unlock_export_tools`
- Seed thêm feature runtime cho app Android:
  - `binary_scan_quick`
  - `binary_scan_full`
  - `ida_export_import`
  - `ida_workspace_save`
  - `ida_workspace_export`
  - `ida_workspace_restore`
  - `workspace_batch`
  - `workspace_note`
  - `workspace_export_result`
  - `workspace_browser`
  - `workspace_diff`
  - `profile_search`
  - cùng 3 feature unlock nền

## Ý nghĩa
- App Android không còn phải tự đoán rule mở khóa
- Repo web có chỗ chỉnh rule mở khóa thật
- Binary Workspace, batch diện rộng và export ngoài đã có đường đi thống nhất giữa admin -> runtime -> app

## Việc cần deploy sau khi nhận repo
1. Chạy migration mới
2. Deploy lại function:
   - `server-app-runtime`
3. Redeploy web/app-host

## Lưu ý
- Phase này là **repo foundation**
- UI app Android đã có nền mở khóa từ lượt trước
- phía app vẫn sẽ cần nhịp sau để gọi action `unlock_feature` hoàn chỉnh với popup 1 ngày / 7 ngày / 30 ngày nếu muốn đầy đủ hơn
