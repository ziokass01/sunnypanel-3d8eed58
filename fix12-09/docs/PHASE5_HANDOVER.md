# Phase 5 handover

## Đã làm
- Bỏ workflow `Manual Supabase DB Push (Safe)` khỏi repo.
- Giữ lại duy nhất workflow deploy Edge Functions.
- Thêm trang runtime admin cho từng app tại `/admin/apps/:appCode/runtime`.
- Thêm CRUD cho `server_app_redeem_keys`.
- Thêm nút revoke cho entitlement và session.
- Thêm phần xem wallet balances và wallet transactions.
- Thêm nút xóa cho `Feature flags` và `Reward / redeem packages` ở trang cấu hình app.
- Khi lưu feature/package, các item đã xóa ở UI sẽ bị xóa thật trong DB.

## Cần test sau khi pull/deploy
1. Vào `Server app` -> `Find Dumps` -> `Feature flags`
   - Thêm 1 feature mới rồi lưu.
   - Xóa feature đó rồi lưu lại.
   - Reload trang và kiểm tra feature đã biến mất thật.
2. Vào `Reward / redeem`
   - Thêm 1 package mới rồi lưu.
   - Xóa package đó rồi lưu lại.
   - Reload trang và kiểm tra package đã biến mất thật.
3. Vào `Runtime admin`
   - Thêm 1 redeem key mới rồi lưu.
   - Reload trang xem key còn đó.
   - Xóa key rồi lưu lại.
   - Reload trang xem key đã mất thật.
4. Nếu đã có user runtime:
   - Revoke 1 entitlement đang active.
   - Revoke 1 session đang active.
   - Kiểm tra app/runtime phản ứng đúng.

## Ghi chú
- Phase 5 hiện tập trung vào **màn quản trị runtime**.
- Wallet balances đang là màn xem nhanh, chưa làm phần điều chỉnh số dư thủ công.
