# FIX NOTE 2026-04-16 - Redeem limit IP / device / account

## Lỗi gốc
Logic cũ đếm số lần dùng redeem theo `server_app_sessions.redeem_key_id`.

Cách này sai vì:
- cùng một session có thể redeem nhiều lần nhưng bảng session chỉ có 1 dòng
- lúc thì limit bị tụt xuống 1 vì số session/history không phản ánh đúng số lần redeem thật
- lúc khác có thể lọt vô hạn trong cùng session nếu chỉ dựa vào 1 dòng session

## Bản sửa
Đã đổi sang cơ chế **1 dòng = 1 lần redeem thật**.

### Thêm mới
- `public.server_app_redeem_key_uses`
- `public.server_app_reserve_redeem_use(...)`
- `public.server_app_release_redeem_use(...)`

### Cách hoạt động mới
`server_app_reserve_redeem_use(...)` sẽ:
1. lock dòng key trong `server_app_redeem_keys`
2. kiểm tra `max_redemptions`
3. kiểm tra giới hạn theo:
   - account
   - device
   - ip
4. insert 1 dòng usage thật vào `server_app_redeem_key_uses`
5. tăng `redeemed_count`

Nếu các bước sau của redeem bị lỗi thì runtime sẽ gọi `server_app_release_redeem_use(...)` để:
- xóa dòng usage vừa reserve
- trừ lại `redeemed_count`

## File đã sửa
- `supabase/functions/_shared/server_app_runtime.ts`
- `supabase/migrations/20260416170000_redeem_use_reservation_fix.sql`

## Điều rất quan trọng
Muốn fix có tác dụng thật, phải làm đủ 2 bước:
1. chạy migration mới
2. deploy lại function `server-app-runtime`

## Test nên làm ngay
### Case 1
- tổng redeem: 2000
- IP: 2000
- account: 2
- device: 2

Kỳ vọng:
- cùng 1 account dùng đúng 2 lần thì lần 3 lỗi `REDEEM_KEY_ACCOUNT_LIMIT_REACHED`
- cùng 1 device dùng đúng 2 lần thì lần 3 lỗi `REDEEM_KEY_DEVICE_LIMIT_REACHED`

### Case 2
- tổng redeem: 2000
- IP: 1
- account: 1
- device: 1

Kỳ vọng:
- cùng account/device/ip chỉ dùng đúng 1 lần
- lần 2 phải bị chặn, không được lọt vô hạn

### Case 3
- tổng redeem: 2
- account/device/ip = 0

Kỳ vọng:
- chỉ được dùng tổng cộng 2 lần
- lần 3 lỗi `REDEEM_KEY_LIMIT_REACHED`

## Ghi chú
Bản zip gửi đi là repo phẳng, không kèm `node_modules`, không lồng folder.
