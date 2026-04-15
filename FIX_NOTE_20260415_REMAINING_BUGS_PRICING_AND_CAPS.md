# FIX NOTE 2026-04-15

## Đã xử lý

### 1) Gia hạn 1 / 7 / 30 ngày hiện sai giá
- Root cause: `server-app-runtime` chỉ trả `unlock_soft_cost` / `unlock_premium_cost` cho 1 ngày.
- App có field 7d / 30d nhưng server không bơm vào state.
- Đã sửa `resolveFeatureUnlockMeta()` để trả thêm:
  - `unlock_soft_cost_7d`
  - `unlock_premium_cost_7d`
  - `unlock_soft_cost_30d`
  - `unlock_premium_cost_30d`

### 2) Lâu lâu admin bị đá sang `Not authorized`
- Root cause: hook role chỉ tin RPC hiện tại. Khi RPC chập chờn hoặc refresh session lệch nhịp, UI hiểu nhầm là user mất quyền.
- Đã thêm cache role theo `user.id` trong `localStorage`.
- Ưu tiên hiện role đã biết trước, sau đó RPC chạy lại để refresh.

### 3) Server key Find Dumps chưa sync 100% với trang free
- Root cause: tab `Server key` chỉ lưu `server_app_reward_packages`, nhưng không đẩy default package / credit ngược sang `licenses_free_key_types`.
- Đã sửa save flow của `AdminServerAppKeys.tsx`:
  - key type mode `credit` sẽ nhận `default_credit_code` + `default_wallet_kind`
  - key type mode `package` sẽ nhận `default_package_code`

### 4) Tối ưu lại giá và chống lạm phát credit
- Đã thêm `soft_balance_cap` + `premium_balance_cap` vào `server_app_plans`
- Classic:
  - dùng floor reset kiểu cũ
  - giữ tối đa 5 soft
- Go / Plus / Pro:
  - cộng dồn theo ngày
  - nhưng chặn ở mức cap của plan
  - không tăng vô hạn nếu user không dùng

## Giá mặc định mới cho Find Dumps

### Plan
- Classic: 5 soft/ngày, cap 5
- Go: 6 soft/ngày + 0.1 vip/ngày, cap 30 / 1
- Plus: 20 soft/ngày + 0.5 vip/ngày, cap 200 / 10
- Pro: 50 soft/ngày + 1 vip/ngày, cap 1000 / 30

### Credit key
- Credit thường: 5
- Credit VIP: 0.3
- hết hạn sau 72 giờ

### Feature cost
- Batch search: 0.2 soft
- Export text: 0.05 soft
- Export JSON: 0.1 soft
- Browser + pseudo: 0.5 soft / 0.05 vip
- Full scan: 1 soft / 0.1 vip
- Dumps so.c: 1.5 soft / 0.15 vip

## File chính đã sửa
- `supabase/functions/_shared/server_app_runtime.ts`
- `src/hooks/use-panel-role.ts`
- `src/pages/AdminServerAppKeys.tsx`
- `src/pages/AdminServerAppCharge.tsx`
- `src/lib/serverAppPolicies.ts`
- `supabase/migrations/20260415095000_find_dumps_plan_caps_and_price_rebalance.sql`

## Lưu ý
- Cơ chế cap hiện tại là **cap số dư tích lũy**, không phải cap tổng số credit đã phát cả tháng.
- Đây là đúng với bài toán user không dùng thì không được phình số dư mãi.
- Nếu sau này cần cap theo **tổng grant trong toàn entitlement window**, phải làm phase riêng bằng log grant hoặc counter riêng.
