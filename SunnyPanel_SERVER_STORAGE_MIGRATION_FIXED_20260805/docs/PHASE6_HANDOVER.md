# Phase 6 handover

## Mục tiêu nhịp này
Phase 6 tập trung vào phần **hardening / kill switch / analytics runtime** cho server app.

## Đã làm xong
### 1. Runtime controls
Thêm bảng và UI để quản lý:
- bật tắt toàn bộ runtime
- bật tắt riêng `catalog/me`, `redeem`, `consume`, `heartbeat`
- đặt `maintenance_notice`
- đặt `min_client_version`
- chặn theo `blocked_client_versions`
- chặn theo `blocked_accounts`
- chặn theo `blocked_devices`
- chặn theo `blocked_ip_hashes`
- giới hạn số lần redeem mỗi ngày theo account / device

### 2. Runtime events
Thêm bảng log runtime event mới để theo dõi:
- action nào chạy
- ok / fail
- code lỗi
- account/device/feature/wallet kind
- client version
- ip hash
- meta JSON

### 3. Function hardening
`server-app-runtime` giờ đã:
- đọc runtime controls trước khi xử lý action
- trả lỗi khi runtime hoặc action bị tắt
- chặn client version thấp hơn mức tối thiểu
- chặn client version nằm trong blocklist
- chặn account / device / ip hash nằm trong blocklist
- giới hạn redeem theo ngày bằng log event runtime
- ghi log success / fail cho các action runtime chính

### 4. Admin runtime page
Trang `/admin/apps/:appCode/runtime` giờ có thêm:
- tab `Controls`
- tab `Events`

## Các tệp đã sửa / thêm
### Migration
- `supabase/migrations/20260405150000_server_app_runtime_phase6_hardening.sql`

### Edge Function / shared runtime
- `supabase/functions/_shared/server_app_runtime.ts`
- `supabase/functions/server-app-runtime/index.ts`

### Frontend admin
- `src/pages/AdminServerAppRuntime.tsx`

### Tài liệu bàn giao
- `docs/PHASE6_HANDOVER.md`

## Cần test ngay sau khi deploy xong
### Test 1: kill switch
1. Vào `Server app -> app cần test -> Runtime admin -> Controls`
2. Tắt `Runtime enabled`
3. Lưu
4. Gọi app/runtime thử `me` hoặc `redeem`
5. Kỳ vọng: bị chặn với mã kiểu `RUNTIME_DISABLED`
6. Bật lại để dùng tiếp

### Test 2: chặn redeem riêng
1. Tắt `Redeem`
2. Lưu
3. Gọi `redeem`
4. Kỳ vọng: bị chặn với mã `REDEEM_DISABLED`
5. Bật lại

### Test 3: min client version
1. Đặt `Min client version = 1.0.5`
2. Gọi runtime bằng `client_version = 1.0.4`
3. Kỳ vọng: bị chặn `CLIENT_VERSION_TOO_OLD`
4. Gọi lại bằng `1.0.5` hoặc cao hơn
5. Kỳ vọng: qua được

### Test 4: blocked client versions
1. Thêm `1.0.9` vào `Blocked client versions`
2. Lưu
3. Gọi runtime bằng `client_version = 1.0.9`
4. Kỳ vọng: bị chặn `CLIENT_VERSION_BLOCKED`

### Test 5: blocked accounts / devices
1. Thêm 1 `account_ref` vào `Blocked accounts`
2. Redeem hoặc consume bằng account đó
3. Kỳ vọng: `ACCOUNT_BLOCKED`
4. Làm tương tự với `Blocked devices`
5. Kỳ vọng: `DEVICE_BLOCKED`

### Test 6: events log
1. Gọi `catalog`, `redeem`, `consume`, `heartbeat` vài lần
2. Vào tab `Events`
3. Kỳ vọng: thấy dòng log mới, có `OK/FAIL`, code lỗi, account/device/client version

### Test 7: daily redeem limit
1. Đặt `Redeem tối đa mỗi account / ngày = 1`
2. Dùng 1 account redeem key hợp lệ 1 lần
3. Redeem lần 2 trong cùng ngày
4. Kỳ vọng: `REDEEM_DAILY_ACCOUNT_LIMIT`

## Còn lại sau phase 6
- gắn app Android thật vào flow runtime mới
- nếu cần thì thêm job tách riêng để dọn / tổng hợp event
- hardening sâu hơn nữa nếu muốn, ví dụ RPC transaction hóa consume / redeem hoặc session TTL động
