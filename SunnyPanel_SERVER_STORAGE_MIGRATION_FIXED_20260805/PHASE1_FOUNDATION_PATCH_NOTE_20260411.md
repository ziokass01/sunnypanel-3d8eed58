# Phase 1 foundation patch note - 2026-04-11

## Đã làm trong lượt này

### App Android
- Sửa luồng **Mở khóa chức năng** để gọi đúng action `unlock_feature` thay vì dùng nhầm `consume`.
- Chuẩn hóa wallet khi mở khóa:
  - `premium -> vip`
  - `soft -> normal`
- Mở rộng rule **Export ra ngoài** để nhận cả:
  - `export_plain`
  - `export_text`
  - `export_json`
  - `workspace_export_result`
  - `ida_workspace_export`
- Vá `Export text` để đi qua guard / credit tương tự `Export JSON`.
- Vá map feature server trong hub để:
  - `export_plain`
  - `export_text`
  đều mở đúng luồng export text.
- Sửa icon nút quay lại của **Hướng dẫn** và **Liên hệ & hỗ trợ** sang mũi tên gọn hơn.

### Repo / server app-host
- Bổ sung fallback trong runtime shared layer để **không nổ đỏ PGRST205** khi bảng unlock chưa được migrate:
  - `server_app_feature_unlock_rules`
  - `server_app_feature_unlocks`
- Cập nhật `Cụm chức năng app` để tách rõ hơn:
  - `Export text`
  - `Export JSON`
  - `Convert image`
  - `Encode / Decode`
  - `Hex edit`
- Cập nhật seed/default title của `export_plain` thành **Export text**.
- Thêm migration mới:
  - `20260411024500_phase1_feature_catalog_alignment.sql`
  để đồng bộ catalog phase 1 và mở rộng guard export.
- Giữ nguyên repo zip **không kèm node_modules**.

## File chính đã đổi

### App
- `app/src/main/java/com/example/application/runtime/RuntimeApiClient.java`
- `app/src/main/java/com/example/application/runtime/FeatureAccessRegistry.java`
- `app/src/main/java/com/example/application/ui/activity/FeatureAccessActivity.java`
- `app/src/main/java/com/example/application/ui/activity/AppHubActivity.java`
- `app/src/main/java/com/example/application/ui/activity/MainActivity.java`
- `app/src/main/res/layout/activity_guide.xml`
- `app/src/main/res/layout/activity_support.xml`
- `app/src/main/res/drawable/ic_arrow_back_24.xml`

### Repo
- `src/lib/serverAppPolicies.ts`
- `src/pages/AdminServerAppCharge.tsx`
- `src/pages/AdminServerAppDetail.tsx`
- `supabase/functions/_shared/server_app_runtime.ts`
- `supabase/migrations/20260411024500_phase1_feature_catalog_alignment.sql`

## Cách dùng sau khi thay code

### Repo
1. Chép file repo đã vá vào repo hiện tại.
2. **Không copy `node_modules`**.
3. Deploy migration mới trước.
4. Deploy lại edge function `server-app-runtime`.
5. Mở admin `Charge / Credit Rules` để kiểm tra các dòng feature mới và cụm unlock export.

### App
1. Chép file app đã vá vào project hiện tại.
2. Build lại APK.
3. Mở **Mở khóa chức năng** rồi bấm làm mới.
4. Kiểm tra:
   - toast đỏ `PGRST205` có còn không
   - export text có còn lọt khỏi guard/credit không
   - nút quay lại ở Hướng dẫn / Hỗ trợ đã gọn hơn chưa

## Những gì CHƯA làm trong lượt này
- Chưa dựng phase 2 UI thật:
  - Diff 2 dump
  - Query remap
- Chưa dựng phase 3 batch engine thật.
- Chưa làm stream file lớn cho Encode / Decode.
  - Ý này đã được ghi nhận cho slice sau.
- Chưa viết lại toàn bộ nội dung hướng dẫn chi tiết cho từng công cụ.
  - Hiện chỉ sửa nút back foundation, chưa thay toàn bộ bài hướng dẫn.

## Lưu ý
- Nếu project Supabase live chưa chạy migration unlock thì app giờ sẽ **không nổ đỏ như trước**, nhưng unlock center sẽ hiện trạng thái chờ / rỗng cho tới khi DB có bảng thật.
- `export_plain` được giữ lại để tránh lệch DB cũ, nhưng title hiển thị đã đổi thành **Export text**.
