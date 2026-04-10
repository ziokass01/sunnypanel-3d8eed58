# Phase 4 slice 02 handover

## Làm ở nhịp này
1. Giữ nguyên migration core phase 4 đã thêm trước đó
2. Thêm Edge Function public mới: `server-app-runtime`
3. Thêm shared helper runtime: `_shared/server_app_runtime.ts`
4. Tách workflow deploy để giảm lặp lại lỗi migration mismatch

## Function `server-app-runtime` hiện làm được gì
### `catalog`
Trả về:
- app info
- app settings
- current plan (guest plan nếu chưa có session)
- entitlement hiện tại nếu có session hợp lệ
- wallet balance nếu có session hợp lệ
- feature list + cost hiệu lực theo plan hiện tại

### `me`
Hiện tại dùng cùng shape với `catalog` để app đọc trạng thái runtime.

### `heartbeat`
- nhận `app_code`, `session_token`, `client_version`
- update `last_seen_at`
- ghi `ip_hash`
- trả về runtime state mới nhất

### `logout`
- đổi session sang `logged_out`
- set `revoke_reason = client_logout`

### Chưa làm
- `redeem`
- `consume`
- refill/reset job
- admin pages runtime

## Deploy an toàn hơn
### Workflow mới
- `.github/workflows/supabase-functions.yml`
- `.github/workflows/supabase-deploy.yml`

### Ý nghĩa
- Push thường chỉ deploy function, không đụng DB
- DB push chỉ chạy manual
- Muốn mở khóa DB push phải gõ đúng tên migration mới nhất
- Có `--dry-run` trước push thật

## Chỗ cần làm tiếp ngay sau nhịp này
1. `redeem` logic thật
2. tạo session thật sau redeem
3. `consume` logic thật + transaction log
4. daily refill/reset
5. admin UI runtime
6. gắn app Android
