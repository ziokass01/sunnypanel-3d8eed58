# PHASE10 live deploy checklist

Mục tiêu của lượt này:
- Không đụng `free`, `rent`, `reset`
- Giữ `PUBLIC_BASE_URL` cho miền public gốc
- App domain dùng `VITE_APP_BASE_URL`
- Bổ sung policy `consume_priority` để app gửi `wallet_kind=auto` thì server tự quyết định thứ tự trừ credit

## 1. Env cần có
Frontend:
- `VITE_PUBLIC_BASE_URL=https://mityangho.id.vn`
- `VITE_ADMIN_ORIGIN=https://admin.mityangho.id.vn`
- `VITE_APP_BASE_URL=https://app.mityangho.id.vn`

Edge Functions:
- `PUBLIC_BASE_URL=https://mityangho.id.vn`
- `ALLOWED_ORIGINS=https://mityangho.id.vn,https://admin.mityangho.id.vn,https://app.mityangho.id.vn`
- `RUNTIME_OPS_ADMIN_KEY=...`

## 2. DB migrate
Chạy migration mới:
- `20260406093000_server_app_wallet_consume_priority.sql`

Kỳ vọng sau migrate:
- bảng `server_app_wallet_rules` có cột `consume_priority`
- `find-dumps` mặc định là `soft_first`

## 3. Deploy functions
Deploy lại tối thiểu:
- `server-app-runtime`
- `server-app-runtime-ops`

Lý do:
- runtime consume mới đọc `consume_priority`
- ops UI vẫn cần test `account_snapshot` / `redeem_preview`

## 4. Smoke test web
### app domain
- `app.mityangho.id.vn/apps/find-dumps/config`
- `app.mityangho.id.vn/apps/find-dumps/runtime`

### kiểm tra UI config
- Wallet rules có dropdown `Ưu tiên trừ credit khi app gửi auto`
- Chọn `Credit thường trước, premium sau`
- Lưu thành công

### kiểm tra runtime
- tab simulator hiển thị note auto wallet theo policy app
- `health` trả 200
- `redeem_preview` qua ops trả 200
- `account_snapshot` qua ops trả 200

## 5. Kỳ vọng logic consume
Khi feature `requires_credit=true` và app gửi `wallet_kind=auto`:
- nếu policy là `soft_first`: thử trừ soft trước, thiếu mới premium
- nếu policy là `premium_first`: thử trừ premium trước, thiếu mới soft
- nếu app ép `wallet_kind=soft` hoặc `premium` thì server theo wallet đó

## 6. Regression không được vỡ
- `mityangho.id.vn/free`
- `mityangho.id.vn/rent`
- `mityangho.id.vn/reset-key`

## 7. Ghi chú
- `PUBLIC_BASE_URL` không đổi sang app domain
- route `Mở workspace` đã bị loại khỏi luồng chính
- admin tổng chỉ còn `Cấu hình app` và `Runtime app`
