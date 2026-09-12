# Sửa lỗi `SIGNED_LEASE_PERSISTENT_ROLLBACK`

## Nguyên nhân

Client giữ mốc `session_generation` cao nhất trong file signed-lease anchor. Server trước đây lưu mốc đó ngay trên dòng `license_devices`; thao tác Remove/Reset devices xóa dòng, lần verify kế tiếp tạo lại từ `0` rồi tăng lên `1`. Khi `1` nhỏ hơn mốc đã lưu trên thiết bị, client chặn bằng `SIGNED_LEASE_PERSISTENT_ROLLBACK` dù key và chữ ký server đều hợp lệ.

## Bản sửa

- `20260912100000_session_high_water_repair.sql` lưu high-water theo `SHA256(key) + SHA256(device)` độc lập với dòng binding.
- Insert lại thiết bị luôn nhận mốc cũ; không thể hạ generation.
- Reset activation đưa generation của các binding hiện tại lên một recovery floor epoch-ms, giữ nguyên device binding và chỉ đặt lại countdown. Việc này tự phục hồi cả key đã từng bị tụt generation trước khi có ledger.
- `admin_repair_license_session` đẩy mốc lên epoch-millisecond cho các thiết bị đã mắc lỗi; không bao giờ hạ mốc hoặc tắt kiểm tra chống rollback.
- `20260912101000_panel_license_lifecycle.sql` gom Edit/Reset activation/Renew/Remove/Reset devices vào RPC nguyên tử.
- `20260912103000_penalty_reset_clears_bindings.sql` làm cho nút `-20%` xóa cả device và IP binding trong cùng transaction.

## Triển khai

Chạy các migration trong thư mục `supabase/migrations` sau migration V34 hiện tại. Với key đã bị kẹt, lấy đúng UUID và toàn bộ device ID mà client gửi rồi chạy:

```sql
select public.admin_repair_license_session(
  'LICENSE_UUID'::uuid,
  'FULL_DEVICE_ID'
);
```

Trang License detail cũng có nút `Repair session` cho admin khi binding vẫn còn trong danh sách. Nếu binding đã bị xóa, chạy RPC bằng device ID lấy từ log/client; lần verify kế tiếp sẽ tạo lại binding với high-water đã lưu.

Không xóa hàng loạt file `.s_v34k_*.dat`, không hạ `session_generation`, và không đổi `SIGNED_LEASE_PERSISTENT_ROLLBACK` thành thành công. Những thao tác đó chỉ che lỗi hoặc làm yếu cơ chế chống replay/rollback.

## Edit và reload tab

Edit countdown đã chạy giờ gửi qua RPC nguyên tử. Khi key đã chạy, trường Duration được hiểu là **thời gian còn lại tính từ lúc bấm Save**; nếu chỉ sửa note/max devices/Active thì thời gian không tự nhảy lại. Query client dùng một instance chung, không refetch khi focus **hoặc reconnect** sau khi Android đưa trình duyệt ra nền; auth cache chỉ bị xóa khi đổi tài khoản. Nếu Android thực sự kill/discard process của tab thì trình duyệt vẫn phải khởi tạo lại trang, điều đó không thể chặn hoàn toàn bằng React.

## Kiểm tra

`node --test customer-worker/*.test.js tests/*.test.mjs` đã chạy 40/40 test. Có thêm `npm run test:contracts` để chạy riêng 8 contract test không cần Vite. ZIP không kèm `node_modules`; sau khi cài dependency, chạy thêm `npm test` và `npm run build` trước khi deploy frontend.
