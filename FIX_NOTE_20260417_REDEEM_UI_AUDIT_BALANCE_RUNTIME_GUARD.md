# Fix note 2026-04-17

## Đã sửa

### 1) Lỗi redeem bị báo SQL ambiguous
- Thêm migration mới:
  - `supabase/migrations/20260417093000_redeem_rpc_and_wallet_guard_fix.sql`
- Fix hàm:
  - `public.server_app_reserve_redeem_use(...)`
  - `public.server_app_release_redeem_use(...)`
- Đã qualify rõ alias bảng `server_app_redeem_keys` để không còn lỗi:
  - `column reference "redeemed_count" is ambiguous`

### 2) Create Redeem chia rõ 2 khu key
- File sửa:
  - `src/pages/AdminServerAppRedeem.tsx`
- Danh sách mã được tách làm 2:
  - `Mã admin tạo`
  - `Key free từ mityangho.id.vn/free`
- Mỗi khu có ô tìm kiếm riêng
- Có nút block / mở lại / xóa ngay trong danh sách
- Ba phần `Thông tin mã` + `Giới hạn` + `Phần thưởng & logic` đã gộp vào một khu chỉnh cho dễ dùng
- Khu danh sách được đưa xuống sau phần chỉnh/logic như yêu cầu

### 3) Audit Log thêm tab top số dư
- File sửa:
  - `src/pages/AdminServerAppAudit.tsx`
- Thêm tab `Top số dư`
- Có ô tìm theo mail / account / device
- Xếp hạng từ số dư cao xuống thấp
- Hiển thị soft / VIP / tổng

### 4) Chặn tài khoản âm vẫn tiêu hao credit
- File sửa:
  - `supabase/functions/_shared/server_app_runtime.ts`
- Runtime giờ không cho tiêu hao tiếp nếu ví đang âm ở wallet bị charge
- Thêm code lỗi rõ hơn:
  - `NEGATIVE_SOFT_BALANCE_LOCKED`
  - `NEGATIVE_PREMIUM_BALANCE_LOCKED`
- Đồng thời bỏ kiểu fallback tiêu hao tiếp vào âm trong `consumeRuntimeFeature`

## Việc cần làm sau khi up repo
1. Chạy migration mới
2. Deploy lại function `server-app-runtime`
3. Test lại 3 case:
   - redeem key không còn báo ambiguous
   - limit 1/2/100 hoạt động đúng
   - tài khoản âm không dùng tiếp được feature tốn credit

## Lưu ý
- File zip này là dạng phẳng ở root repo
- Không kèm `node_modules`
- Không kèm `dist`
