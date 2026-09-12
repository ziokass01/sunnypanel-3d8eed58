# FIX NOTE 2026-04-15 - runtime unlock sync / duplicate unlock / plan bootstrap

## Đã sửa

### 1) Unlock feature báo `FEATURE_NOT_FOUND`
- Nguyên nhân: flow `unlock_feature` đang charge credit bằng cách gọi `consumeRuntimeFeature(featureCode=accessCode)`.
- `accessCode` như `unlock_batch_tools` / `unlock_export_tools` không nằm trong bảng `server_app_features`, nên server nổ `FEATURE_NOT_FOUND`.
- Đã sửa: tách riêng nhánh charge cho unlock access, không còn ép access code đi qua catalog feature thường nữa.

### 2) Unlock feature bị lỗi `23505 duplicate key value violates unique constraint server_app_feature_unlocks_active_unique`
- Nguyên nhân: query tìm unlock active cũ chưa bắt được các bản ghi có `device_id` rỗng / null / lệch format.
- Hậu quả: server tưởng chưa có row nên insert mới, đụng unique index.
- Đã sửa:
  - normalize `device_id`
  - query active unlock linh hoạt hơn
  - khi insert vẫn đụng `23505`, server fallback sang tìm row hiện có rồi update lại thay vì chết luôn

### 3) Đồng bộ gói dễ tụt về `classic`
- Đã tăng chuẩn hóa `account_ref` về lowercase ở các đường lookup chính:
  - reusable session
  - entitlement active
  - wallet balance
  - bootstrap state
- Mục tiêu: giảm lỗi dữ liệu legacy khác hoa/thường làm mất entitlement khi cài lại app hoặc bootstrap lại session.

### 4) App bị lệch dữ liệu giữa Ví và Mở khóa chức năng
- Đã sửa:
  - `FeatureAccessActivity` dùng `syncBoundAccount(...)` giống AppHub để không bám nhầm account cũ
  - màn Mở khóa dùng `heartbeat()` nếu đã có session thay vì luôn `fetchCatalog()`
  - AppHub sau khi save state sẽ bind lại từ cache merged để UI đồng nhất với prefs hiện tại

### 5) App gửi unlock request tương thích hơn
- App giờ gửi cả `feature_code` và `access_code` cho action `unlock_feature`.
- Repo runtime nhận `feature_code || access_code` để tương thích bản cũ / bản mới.

## File chính đã sửa
- `supabase/functions/_shared/server_app_runtime.ts`
- `supabase/functions/server-app-runtime/index.ts`
- `app/src/main/java/com/example/application/runtime/RuntimeApiClient.java`
- `app/src/main/java/com/example/application/runtime/RuntimeApiException.java`
- `app/src/main/java/com/example/application/runtime/RuntimePrefs.java`
- `app/src/main/java/com/example/application/ui/activity/FeatureAccessActivity.java`
- `app/src/main/java/com/example/application/ui/activity/AppHubActivity.java`

## Sau khi nhận file
1. Push repo
2. Deploy lại function `server-app-runtime`
3. Build sạch app rồi cài lại
4. Test lại:
   - refresh ví
   - vào Mở khóa chức năng
   - mở `Binary Workspace`, `Batch Search`, `Export`
   - kiểm tra còn báo `FEATURE_NOT_FOUND` / `23505` không
   - xóa app, cài lại, login lại, kiểm tra plan còn đúng không
