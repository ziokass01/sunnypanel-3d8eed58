# Phase 7 handover

## Mục tiêu nhịp này
Phase 7 tập trung vào phần **server-only QA + ops** để bạn test runtime ngay trên panel khi chưa có app Android thật.

## Đã làm xong
### 1. Runtime simulator ngay trong panel
Trang `/admin/apps/:appCode/runtime` có thêm tab `Simulator` để gọi trực tiếp Edge Function `server-app-runtime` với các action:
- `catalog`
- `me`
- `redeem`
- `consume`
- `heartbeat`
- `logout`

Simulator giữ lại `session_token` sau khi redeem thành công để bạn test tiếp heartbeat / consume / logout mà không cần app.

### 2. Runtime ops / cleanup
Thêm Edge Function admin-only `server-app-runtime-ops` với 2 action:
- `cleanup`: expire session quá hạn theo timeout phase 7 và xóa event quá retention days
- `adjust_wallet`: cộng / trừ ví thủ công và ghi transaction `admin_adjust`

Trang runtime admin có thêm tab `Ops` để gọi 2 action này ngay từ web.

### 3. Session timeout controls
Thêm 3 setting mới trong `server_app_runtime_controls`:
- `session_idle_timeout_minutes`
- `session_max_age_minutes`
- `event_retention_days`

`server-app-runtime` giờ sẽ tự coi session là hết hạn nếu:
- quá lâu không heartbeat
- hoặc sống quá lâu so với max age

### 4. Cleanup logic phía server
Cleanup không còn là thao tác tay trong đầu nữa. Giờ có thể bấm chạy ngay trong panel để:
- expire session cũ
- dọn event quá hạn giữ lại

### 5. Workflow
Bỏ hẳn workflow `.github/workflows/supabase-deploy.yml` khỏi repo như yêu cầu. Repo chỉ còn workflow deploy Edge Functions.

## Tệp đã sửa / thêm rõ ràng
### Migration
- `supabase/migrations/20260405210000_server_app_runtime_phase7_ops_and_simulator.sql`

### Shared runtime / logic server
- `supabase/functions/_shared/server_app_runtime.ts`

### Edge Function mới
- `supabase/functions/server-app-runtime-ops/index.ts`
- `supabase/functions/server-app-runtime-ops/config.toml`

### Frontend admin
- `src/pages/AdminServerAppRuntime.tsx`

### Workflow
- xóa `/.github/workflows/supabase-deploy.yml`

### Tài liệu
- `docs/PHASE7_HANDOVER.md`

## Bạn cần test gì ngay bây giờ
Vì chưa có app, Phase 7 test hoàn toàn bằng server/panel:

### Test 1: simulator catalog
1. Vào `Server app -> app -> Runtime admin -> Simulator`
2. Action = `catalog`
3. Bấm `Chạy simulator`
4. Kỳ vọng: có JSON trả về app/settings/features

### Test 2: simulator redeem -> token
1. Action = `redeem`
2. Nhập `account_ref`, `device_id`, `redeem_key`, `client_version`
3. Chạy
4. Kỳ vọng: trả về `session_token`
5. Token tự đổ lại vào form

### Test 3: simulator consume
1. Sau khi có token, đổi action = `consume`
2. Nhập `feature_code`
3. Bấm chạy
4. Kỳ vọng: nếu plan + credit hợp lệ thì trừ ví và có transaction mới

### Test 4: wallet adjust
1. Vào tab `Ops`
2. Nhập `account_ref`
3. Nhập `soft_delta` hoặc `premium_delta`
4. Bấm `Cập nhật ví`
5. Kỳ vọng: tab `Wallets` và `Transactions` có thay đổi

### Test 5: cleanup
1. Trong `Controls` đặt timeout / retention nhỏ nếu muốn thử nhanh
2. Vào `Ops`
3. Bấm `Chạy cleanup ngay`
4. Kỳ vọng: JSON trả về số session expired và event bị xóa

## Sau Phase 7 còn bao nhiêu phase nữa
### Nếu bám đúng nhịp nhanh nhất
Còn **2 phase lớn**:

#### Phase 8
Gắn app Android thật vào flow runtime mới:
- tab Quà tặng
- gọi redeem / me / consume / heartbeat / logout
- xử lý lưu token / trạng thái user / refresh session phía app

#### Phase 9
Đóng dự án / hoàn thiện cuối:
- test end-to-end app + server
- sửa bug vặt còn sót
- chốt deploy app
- tài liệu bàn giao cuối

## Chốt
- **Đến deploy app:** còn **1 phase lớn** nữa, tức **Phase 8**
- **Đến kết thúc toàn bộ:** còn **2 phase lớn**, tức **Phase 8 + Phase 9**
