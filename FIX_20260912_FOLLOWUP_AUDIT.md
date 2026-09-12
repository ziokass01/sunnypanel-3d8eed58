# Follow-up audit 2026-09-12

## Kết luận kiểm tra bản fix12-09 trước đó

Bản trước **chưa đáp ứng đầy đủ** các yêu cầu runtime đã nêu:

1. `SIGNED_LEASE_PERSISTENT_ROLLBACK`: high-water ledger đã đúng hướng nhưng chỉ `+1` khi Reset activation. Với key đã từng bị tụt generation trước migration, `+1` vẫn có thể thấp hơn anchor đang lưu trên client.
2. `pgcrypto`: `guard_license_session_generation()` và `admin_repair_license_session()` ép `search_path = public` nhưng gọi `digest()`, gây SQLSTATE `42883` trên Supabase nơi pgcrypto nằm ở schema `extensions`.
3. Edit key đã chạy: UI luôn gửi lại `duration_seconds`; backend lại tính expiry từ `first_used_at`. Vì vậy sửa note/device cũng có thể chạm logic thời gian, còn nhập cùng duration cũ thì trông như không cập nhật.
4. Đổi tab/đưa Chrome ra nền: `refetchOnWindowFocus` đã tắt nhưng `refetchOnReconnect` vẫn bật ở QueryClient và role query. Android thường phát reconnect khi quay lại foreground nên panel vẫn có thể refetch và trông như reload.

## Bản follow-up này sửa

- Migration `20260912104000_session_generation_and_edit_followup.sql`:
  - thêm `extensions` vào search path của helper pgcrypto;
  - mỗi binding mới/recreated nhận recovery floor epoch-ms, luôn cao hơn counter legacy;
  - một lần nâng toàn bộ binding hiện có lên recovery floor để tự cứu key đã kẹt từ trước;
  - Reset activation nâng generation lên recovery floor thay vì chỉ `+1`;
  - giữ `last_seen` đúng nghĩa: thao tác admin không giả thành verify mới;
  - started countdown khi Edit duration sẽ đặt expiry = thời điểm Save + duration mới.
- `LicenseEdit.tsx`:
  - key đã chạy hiển thị **remaining time**, không phải original duration;
  - chỉ gửi duration khi người dùng thực sự sửa ô duration; sửa note/max devices/Active không gia hạn key ngoài ý muốn.
- Query client:
  - tắt cả `refetchOnWindowFocus` và `refetchOnReconnect`;
  - role query cũng không refetch khi Android foreground/reconnect.
- Allowlist production đã thêm `20260912104000`.

## Giới hạn của lỗi reload

Patch loại bỏ reload/refetch do logic React Query của app. Nếu Android/Chrome thực sự **discard/kill process của tab** vì RAM/battery policy thì JavaScript không thể cấm trình duyệt khởi tạo lại trang. Trường hợp đó phải phân biệt bằng DevTools/navigation timing; đây không phải refetch do panel.

## Test

`node --test customer-worker/*.test.js tests/*.test.mjs` => **40/40 pass**.

Không sửa Build ID, ECDSA contract, client anti-rollback, secret Supabase hay contract `/api/verify-key`.
