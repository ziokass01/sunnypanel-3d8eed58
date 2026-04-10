# Phase app-host live wiring - 2026-04-10

## Đã nối backend chạy thật cho nhánh Find Dumps

### 1) Free-flow split thật theo app
- `free-start` nhận và lưu `app_code / package_code / credit_code / wallet_kind` vào `licenses_free_sessions`.
- `free-config` đọc `x-app-code` để lọc key types và quota theo app.
- `free-reveal` đọc lại selection từ session, không tin body client là nguồn duy nhất.
- Quota/ngày ở `free-config` và `free-reveal` đã tách theo `app_code` để Find Dumps không dùng chung bucket với Free Fire.

### 2) Find Dumps không mint license legacy nữa
- Với `app_code = find-dumps`, `free-reveal` sẽ mint **server_app_redeem_keys** thật.
- Key sinh ra là redeem code cho runtime app-host, có `max_redemptions = 1`.
- Key credit có `expires_at` tính từ lúc claim.
- Key package cũng có `expires_at` tính từ lúc claim.

### 3) Package / credit chạy theo runtime thật
- Đã thêm `entitlement_seconds` cho reward package và redeem key.
- Runtime shared sẽ ưu tiên `entitlement_seconds` trước `entitlement_days`.
- Với key package free-flow Find Dumps, metadata `claim_starts_entitlement = true` làm runtime tính **thời gian còn lại** từ lúc key được nhận, thay vì cho full thời lượng lúc redeem muộn.
- Key credit free-flow Find Dumps nạp vào ví thường/VIP bằng số thập phân thật.

### 4) Daily reset / package discount
- Đã cập nhật seed multiplier của plan Find Dumps theo discount thực:
  - classic 1.00
  - go 0.92
  - plus 0.80
  - pro 0.65
- Daily soft / premium credit của plan Find Dumps cũng được seed lại để runtime áp dụng thật.

### 5) Migration mới
- `20260410190000_find_dumps_live_free_flow_bridge.sql`
- Cần chạy migration này trước khi deploy functions mới.

## Cần deploy gì
1. Chạy migration mới.
2. Deploy lại các functions:
   - `free-config`
   - `free-start`
   - `free-reveal`
   - `server-app-runtime`
3. Redeploy web/app-host.

## Ghi chú
- Free Fire vẫn mint license legacy như cũ.
- Find Dumps đi qua `server_app_redeem_keys` để nối thẳng với runtime app-host.
- Đây là phần nối dây backend thật cho phase split hiện tại. UI có thể tinh chỉnh tiếp, nhưng xương sống đã không còn là mock/policy-only nữa.
