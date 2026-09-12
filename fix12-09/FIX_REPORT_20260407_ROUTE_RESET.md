# FIX REPORT 2026-04-07 · reset luồng app/admin

## Mục tiêu
- Bỏ cơ chế ép nhảy chéo giữa `admin.` và `app.`.
- Giữ toàn bộ `config / runtime / trash` chạy nội bộ theo route hiện tại của host.
- Vá lại phần lấy admin JWT để giảm lỗi `Invalid JWT (401)` ở runtime/trash.
- Không đóng gói `node_modules` vào file zip.

## File đã sửa
1. `src/App.tsx`
2. `src/auth/AuthGate.tsx`
3. `src/pages/Login.tsx`
4. `src/lib/appWorkspace.ts`
5. `src/pages/AdminServerApps.tsx`
6. `src/pages/AdminServerAppDetail.tsx`
7. `src/shell/AppWorkspaceShell.tsx`
8. `src/pages/AppWorkspaceDashboard.tsx`
9. `src/lib/admin-auth.ts` (mới)
10. `src/pages/AdminServerAppRuntime.tsx`
11. `src/pages/AdminServerAppTrash.tsx`

## Thay đổi chính
- Xóa logic redirect chéo host trong `App.tsx`.
- `AuthGate` không còn `window.location.replace` sang admin login.
- `LoginPage` chỉ redirect nội bộ cùng host, chặn absolute URL khác origin.
- Thêm helper build path nội bộ `/admin/apps/...` hoặc `/apps/...` theo ngữ cảnh route hiện tại.
- `AdminServerAppsPage` mở thẳng `config/runtime/trash` trong cùng host.
- `AppWorkspaceShell` dùng path nội bộ, không còn nút quay ngược sang host khác.
- Thêm `postAdminFunction()` để tự refresh JWT khi token cũ/hết hạn rồi retry một lần.
- Không tạo hoặc đóng gói `node_modules`.

## Hướng test tay
1. Mở `admin.../admin/apps`
2. Vào `find-dumps/runtime`
3. Test `Revoke session`
4. Test `Mở lại`
5. Vào `Trash`
6. Test `Xóa vĩnh viễn`
7. Kiểm tra không còn nhảy qua `app.` nữa
8. Kiểm tra F5 ở `runtime/config/trash` vẫn đứng đúng trang

## Ghi chú
- Nếu site live vẫn báo `Invalid JWT` sau khi đã deploy bản này, cần đăng xuất rồi đăng nhập lại một lần để lấy session mới.
- Nếu vẫn lỗi nữa thì lúc đó phải soi trực tiếp function đang deploy trên Supabase chứ không còn là redirect loop ở frontend nữa.
