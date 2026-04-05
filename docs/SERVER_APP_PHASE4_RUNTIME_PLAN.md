# Server app Phase 4 runtime plan

## Mốc hiện tại
- Phase 1-3 đã có khung app, plan, feature, wallet rules, reward packages.
- File này bắt đầu Phase 4 bằng cách thêm **runtime tables core**.
- Làm theo additive-only. Không sửa migration cũ đã chạy.

## Đã thêm trong bước này
Migration mới:
- `supabase/migrations/20260405090000_server_app_runtime_phase4_core.sql`

Bảng mới:
- `server_app_redeem_keys`
- `server_app_entitlements`
- `server_app_wallet_balances`
- `server_app_wallet_transactions`
- `server_app_sessions`

Helper mới:
- `public.server_app_plan_rank(plan_code)` để so plan `classic/go/plus/pro` nhất quán ở backend.

## Ý nghĩa từng bảng
### 1. `server_app_redeem_keys`
Kho key runtime thật cho app. Một key có thể trỏ tới reward package hoặc tự mang plan/credit riêng.

### 2. `server_app_entitlements`
Quyền runtime thật của user theo `app_code + account_ref (+ device_id)`.
Đây là nơi app hỏi server để biết đang ở plan gì, còn hiệu lực không, đã bị revoke chưa.

### 3. `server_app_wallet_balances`
Số dư soft/premium thật theo user của từng app.

### 4. `server_app_wallet_transactions`
Log cộng trừ credit để audit và dựng lịch sử runtime.

### 5. `server_app_sessions`
Ghi nhận session/token hash để làm heartbeat, logout, revoke sync.

## Chưa làm trong bước này
- Edge Functions runtime cho app
- refill/reset jobs
- admin pages runtime
- Android integration
- consume-credit flow thật

## Thứ tự nên làm tiếp
1. Edge Function `server-app-runtime` hoặc nhóm function tách riêng cho:
   - redeem
   - me
   - features
   - balance
   - consume
   - heartbeat
   - logout
2. Tạo service-layer SQL/RPC hoặc gom logic trong function:
   - kiểm entitlement đang active
   - so min_plan với plan hiện tại
   - cộng/trừ wallet an toàn
   - rotate / revoke session an toàn
3. Admin pages cho runtime:
   - Redeem Keys
   - Entitlements
   - Wallets
   - Transactions
   - Sessions / revoke log
4. Job refill/reset theo `daily_reset_hour`
5. Gắn Android app SunnyMod với API runtime thật
6. Cuối cùng mới anti-abuse, analytics, kill switch

## Cảnh báo deploy
- Không sửa `20260404170000`, `20260404193000`, `20260404213000`
- Chỉ push migration mới
- Nếu deploy DB + function + frontend cùng lúc, thứ tự là:
  1. migration
  2. function
  3. frontend
- Không `repair` migration history nếu chưa xác nhận mismatch thật


## Đã thêm ở nhịp này
### Edge Function mới
- `supabase/functions/server-app-runtime/index.ts`
- `supabase/functions/_shared/server_app_runtime.ts`

### Action đã làm được
- `catalog`: trả về app settings, guest plan, plans/features đang bật, cost hiệu lực theo plan hiện tại
- `me`: alias cùng dữ liệu runtime state, có thể kèm `session_token` để đọc trạng thái hiện tại
- `heartbeat`: chạm session đang active và trả về runtime state mới nhất
- `logout`: khóa session thành `logged_out`

### Chưa làm ở function này
- `redeem`
- `consume`
- refill/reset job thật

## Sửa deploy để tránh nổ lại lỗi migration mismatch
- Tách workflow push thường ra thành `Deploy Supabase Edge Functions`
- Workflow DB còn lại là `Manual Supabase DB Push (Safe)`
- Muốn chạy DB push phải gõ đúng **tên migration mới nhất**
- Có bước `supabase db push --include-all --dry-run` trước khi push thật
- Mục tiêu là giảm tối đa việc bấm deploy rồi lặp lại lỗi mismatch history
