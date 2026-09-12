# Phase 4 slice 03 handover

## Làm tiếp ở nhịp này
Mục tiêu của nhịp này là làm nốt phần còn dang dở của `server-app-runtime` để app có thể chạy runtime flow cơ bản mà không cần đợi admin UI runtime hoàn chỉnh.

## Đã làm xong
### 1. `redeem`
Action `redeem` giờ làm được:
- nhận `app_code`, `redeem_key`, `account_ref`, `device_id`, `client_version`
- validate key runtime thật trong `server_app_redeem_keys`
- đọc package nếu key map sang `server_app_reward_packages`
- chặn key bị block, hết hạn, chưa tới giờ mở, quá lượt dùng
- kiểm tra giới hạn thiết bị trước khi ăn key
- tăng `redeemed_count`
- grant hoặc extend entitlement nếu key mang plan / duration
- top-up ví soft / premium nếu key mang credit
- rotate session cũ cùng device
- tạo `session_token` mới và trả luôn cho app

### 2. `consume`
Action `consume` giờ làm được:
- nhận `app_code`, `session_token`, `feature_code`, `wallet_kind`
- validate session và entitlement
- so plan hiện tại với `min_plan` của feature
- tính `effective_soft_cost` / `effective_premium_cost` theo multiplier của plan
- hỗ trợ `wallet_kind = auto | soft | premium`
- trừ ví và ghi `server_app_wallet_transactions`
- trả về `state` mới nhất sau khi tiêu hao

### 3. Daily wallet refresh kiểu runtime
Trong shared helper đã thêm reset nhẹ theo runtime:
- khi `me`, `catalog`, `redeem`, `consume` chạy thì ví sẽ tự check mốc reset theo `daily_reset_hour`
- nếu tới chu kỳ mới thì soft/premium balance được kéo lên theo rule đang bật
- có ghi transaction loại `reset`

## Action hỗ trợ hiện tại của function
- `catalog`
- `me`
- `redeem`
- `consume`
- `heartbeat`
- `logout`

## Còn lại sau nhịp này
1. Admin pages cho runtime:
   - Redeem keys
   - Entitlements
   - Wallet balances / transactions
   - Sessions
2. Refill/reset job riêng nếu muốn tách khỏi runtime lazy refresh
3. Android integration thật
4. Hardening / anti-abuse / analytics / kill switch

## Lưu ý kỹ thuật
- Nhịp này **không sửa workflow deploy nữa**
- Không đụng migration phase 1-3 cũ
- Chưa thêm migration mới trong nhịp này, chủ yếu hoàn thiện function đang dang dở
- Flow hiện tại là best-effort ở tầng function. Nếu sau này cần chống race mạnh hơn nữa thì nên gom redeem / consume vào RPC transaction phía Postgres
