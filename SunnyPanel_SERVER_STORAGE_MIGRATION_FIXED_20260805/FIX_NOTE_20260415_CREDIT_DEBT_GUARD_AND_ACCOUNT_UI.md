# FIX NOTE 2026-04-15

## Mục tiêu fix

1. Chặn lỗi âm credit vô hạn khi mua quyền mở khóa.
2. Cho phép tác vụ đang chạy vượt nhẹ 1-2 credit rồi ghi nợ, nhưng không cho spam tiếp khi đã âm.
3. Nếu soft không đủ mà premium còn, cho phép bù chéo theo tỉ lệ cost soft/premium.
4. Giảm lỗi hiển thị còn dính plan Pro cũ sau khi đổi sang account Classic.

## File sửa

- `supabase/functions/_shared/server_app_runtime.ts`
- `app/src/main/java/com/example/application/runtime/RuntimePrefs.java`

## Logic server mới

### A. Unlock / mua quyền truy cập

- Không còn cho phép âm credit khi mua mở khóa.
- Có thể thanh toán bằng:
  - soft đủ toàn phần
  - premium đủ toàn phần
  - soft + premium bù chéo theo tỉ lệ cost
- Nếu không đủ tiền thật thì trả `INSUFFICIENT_BALANCE` ngay.

### B. Consume / tiêu hao khi chạy chức năng

- Hỗ trợ các plan thanh toán:
  - soft đủ toàn phần
  - premium đủ toàn phần
  - soft + premium bù chéo theo tỉ lệ cost
  - nợ tối đa `2` credit cho 1 lượt consume nếu ví được chọn vẫn còn dương lúc bắt đầu
- Khi đã âm rồi, lượt tiêu tiếp theo sẽ không còn được vay tiếp nếu không có ví còn số dư.
- Mục tiêu là châm trước cho task đang chạy dở, không mở cửa cho cheat vô hạn.

## Logic app mới

- Khi state mới đã bound theo account + session thật, không còn ưu tiên giữ plan/wallet giàu từ cache cũ.
- Giảm khả năng đổi account sang Classic mà UI vẫn bám Pro cũ.

## Deploy

Deploy lại Edge Function:

- `server-app-runtime`

Build lại app từ source mới nếu muốn lấy luôn fix UI hiển thị.
