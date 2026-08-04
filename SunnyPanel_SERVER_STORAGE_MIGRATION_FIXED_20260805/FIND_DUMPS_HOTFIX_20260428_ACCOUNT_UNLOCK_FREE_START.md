# Find Dumps hotfix 2026-04-28

Mục tiêu: sửa đúng các lỗi vừa thấy sau khi dùng lại app ngày hôm sau, không chỉnh APK Fake Lag.

## Đã sửa

1. Feature unlock theo tài khoản, không khóa theo device_id nữa.
   - Trước đây `server_app_feature_unlocks` có thể gắn `device_id`.
   - Khi app restore account / đổi device id / xóa data, server không thấy unlock cũ nên app hiện lại `Cần mở` dù đã trừ credit.
   - Bản này đọc unlock theo `account_ref` và migration đưa unlock Find Dumps đang active về `device_id = null`.

2. Chống trừ credit nhưng unlock không mở.
   - `unlockRuntimeFeatureAccess` giờ có auto-refund nếu credit đã trừ nhưng ghi unlock lỗi.
   - Ghi metadata rõ `charged_soft`, `charged_premium`, `duration_seconds`, `account_wide`.

3. Repair dữ liệu cũ.
   - Migration tìm các giao dịch `consume` cho `unlock_*` 30 ngày gần nhất mà không có unlock active tương ứng.
   - Tự tạo lại unlock active theo tài khoản để cứu ca đã bị trừ credit nhưng vẫn khóa.

4. `/free-start` không trả HTTP 429 cho lỗi chờ/quota thông thường.
   - Tự đóng session pending quá cũ.
   - Nếu vẫn vượt pending limit thì trả JSON `ok:false` HTTP 200, không làm app/web hiểu nhầm backend sập.

5. Thêm đúng folder deploy `supabase/functions/server-app-runtime/index.ts` và `supabase/functions/free-start/index.ts`.

## Deploy

```bash
npx supabase link --project-ref uvqgpgkaxpiczasfwzgm
npx supabase db push
npx supabase functions deploy server-app-runtime --no-verify-jwt
npx supabase functions deploy free-start --no-verify-jwt
```

Nếu project Find Dumps riêng không phải `uvqgpgkaxpiczasfwzgm`, đổi đúng project-ref rồi chạy cùng lệnh.
