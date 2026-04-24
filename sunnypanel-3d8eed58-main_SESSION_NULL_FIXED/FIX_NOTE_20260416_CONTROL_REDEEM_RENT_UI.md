# FIX NOTE 2026-04-16

## Đã làm

### 1) Trung tâm điều khiển
- Dựng lại `src/pages/AdminServerAppControl.tsx` theo hướng chạy thật với Supabase.
- Quét tài khoản theo:
  - Gmail / account_ref
  - device
  - IP / IP hash (best effort theo dữ liệu runtime đang có)
- Bắt buộc chọn đúng tài khoản trong danh sách kết quả rồi mới mở vùng quản lý.
- Cho sửa:
  - credit thường / VIP (cho phép âm)
  - gói hiện tại
  - ngày hết hạn bằng `datetime-local`
  - gia hạn nhanh `+1 / +7 / +30 ngày`
  - xóa hạn hiện tại
- Cho mở khóa / khóa lại feature theo `server_app_feature_unlock_rules` và `server_app_feature_unlocks`.
- Cho thao tác kỷ luật:
  - cấm tài khoản
  - khóa đăng nhập
  - mở khóa lại
  - xóa ví / entitlement / session / feature unlock của tài khoản
- Mọi thao tác nặng đều đi qua confirm dialog và ghi audit log.

### 2) Create Redeem riêng cho Find Dumps
- Dựng lại `src/pages/AdminServerAppRedeem.tsx` theo hướng lưu thật vào `server_app_redeem_keys`.
- Tách hẳn khỏi free admin cũ.
- Có đủ trường:
  - tạo mã tự do
  - tổng lượt redeem
  - mỗi IP tối đa
  - mỗi device tối đa
  - mỗi tài khoản tối đa
  - credit thường / VIP có thể âm
  - chọn gói go / plus / pro
- Thêm các toggle logic:
  - gói cao hơn thì áp dụng gói đó + credit
  - gói thấp hơn thì giữ gói hiện tại + credit
  - đúng gói thì mặc định chỉ cộng credit
  - cho phép gia hạn nếu trùng gói
  - nếu ngày của mã thấp hơn mức đang có thì không lấy ngày đó
- Chuyển phần `gift_tab_label` khỏi tab Config sang tab Create Redeem.

### 3) UI mua / gia hạn 1-7-30 ngày
- Giữ phần giá thật trong `src/pages/AdminServerAppCharge.tsx`.
- Bổ sung preview card bo góc đẹp cho `1 ngày / 7 ngày / 30 ngày`.
- Có badge gợi ý `Hot / Tiết kiệm / Ưu đãi`.
- Giá lấy từ đúng nhóm `server_app_feature_unlock_rules` đang chỉnh trong tab Charge.

### 4) Hiển thị ngày tháng năm rõ ràng
- Thêm `src/lib/dateFormat.ts`.
- Dùng format kiểu: `02 tháng 07 năm 2026 • 14:30` thay vì ISO thô.
- Áp vào các màn Control / Redeem / preview Charge.

### 5) Audit log admin riêng
- Thêm migration `supabase/migrations/20260416133000_admin_control_redeem_and_duration_cards.sql`
- Tạo bảng `public.server_app_admin_audit_logs`.
- Dùng để lưu thao tác admin control và redeem.

### 6) Mở cho redeem credit âm
- Trong migration mới, đổi constraint của `server_app_redeem_keys` để `soft_credit_amount` và `premium_credit_amount` được âm.
- Đồng thời thêm các cột limit / logic mới vào `server_app_redeem_keys`.

## File chính đã sửa
- `src/pages/AdminServerAppControl.tsx`
- `src/pages/AdminServerAppRedeem.tsx`
- `src/pages/AdminServerAppCharge.tsx`
- `src/pages/AdminServerAppDetail.tsx`
- `src/lib/dateFormat.ts`
- `src/lib/serverAppAdmin.ts`
- `supabase/migrations/20260416133000_admin_control_redeem_and_duration_cards.sql`

## Ghi chú
- Quét theo IP phụ thuộc dữ liệu runtime hiện có. Nếu backend chỉ lưu IP hash chứ không lưu raw IP, quét IP sẽ là best effort.
- Charge popup preview đã có card 1/7/30 ngày trong panel. Nếu muốn app Android hiện popup giống hệt thì còn phải nối phần app ở repo app riêng.
- Bản này đã build pass bằng `npm run build`.
