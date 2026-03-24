# Fix summary

## Files changed
- `src/lib/functions.ts`
  - giữ đúng cơ chế public function cho `/free-start`, `/free-gate`, `/free-reveal`, `/free-close`, `/free-config`, `/reset-key`
  - không tự gắn bearer JWT anon sai định dạng vào public function
- `src/shell/AdminShell.tsx`
  - user-like accounts thấy được `Trash` và `Audit logs`
- `src/features/licenses/licenses-api.ts`
  - sửa `hardDeleteLicense()` để ghi audit trước khi xoá vật lý license
  - tránh lỗi quyền khi key đã bị xoá khỏi bảng nhưng vẫn cần ghi `HARD_DELETE`
- `src/pages/AuditLogs.tsx`
  - thêm nhận diện `SOFT_DELETE` vào bộ lọc / thống kê / badge destructive
  - giúp log trash hiển thị đúng hơn

## Files added
- `supabase/migrations/20260324194500_user_audit_trash_and_public_free_fix.sql`
  - gỡ restrictive policy admin-only cũ trên `audit_logs`, `licenses`, `license_devices`
  - thêm policy cho user/moderator đọc audit log của key họ sở hữu
  - mở rộng `public.log_audit()` để user-like account ghi được `RESTORE`, `HARD_DELETE`
- `USER_AUDIT_TRASH_SETUP.sql`
  - helper SQL để gán panel role `user` cho tài khoản helper

## Next steps
1. Chạy migration mới `20260324194500_user_audit_trash_and_public_free_fix.sql`.
2. Nếu cần tài khoản phụ trợ, sửa email trong `USER_AUDIT_TRASH_SETUP.sql` rồi chạy file đó.
3. Redeploy frontend + migrate DB + deploy lại edge functions nếu production đang chạy bản cũ.
