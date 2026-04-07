# Fix report 2026-04-07

## Mục tiêu fix
- Cắt vòng lặp redirect giữa `admin.` và `app.`.
- Đưa luồng Server App quay lại chạy ổn định trong admin host.
- Giữ lại logic runtime/trash hiện có, nhưng làm token admin bền hơn bằng refresh session trước khi báo hết phiên.

## File đã sửa
1. `src/App.tsx`
2. `src/auth/AuthGate.tsx`
3. `src/lib/appWorkspace.ts`
4. `src/pages/AdminServerApps.tsx`
5. `src/pages/AdminServerAppDetail.tsx`
6. `src/shell/AppWorkspaceShell.tsx`
7. `src/pages/AdminServerAppRuntime.tsx`
8. `src/pages/AdminServerAppTrash.tsx`

## Nội dung chính
### 1) Route Server App về lại admin host
- Bỏ luồng admin -> app domain trong `App.tsx`.
- Dùng `AppWorkspaceShell` ngay dưới `/admin/apps/:appCode`.
- Giữ các nhánh con:
  - `/admin/apps/:appCode/config`
  - `/admin/apps/:appCode/runtime`
  - `/admin/apps/:appCode/trash`
- Thêm alias `/apps/:appCode/*` để tự đổi về đường dẫn admin chuẩn, tránh bookmark cũ bị chết.

### 2) App host không còn giữ luồng chính
- Nếu mở app host hoặc link cũ thuộc `/apps/...`, hệ thống sẽ đổi về admin host tương ứng.
- Mục tiêu là chặn loop domain và gom toàn bộ auth/session về một origin.

### 3) AuthGate làm lại đơn giản
- Không còn nhánh ép từ app host về admin login ở `AuthGate`.
- Chỉ còn đúng hành vi chuẩn: chưa có user thì về `/login?next=...`.

### 4) Nút trong giao diện đổi sang admin path
- `AdminServerApps.tsx` mở cấu hình/runtime bằng `buildAdminAppUrl(...)`.
- `AdminServerAppDetail.tsx` đổi link runtime sang `/admin/apps/.../runtime`.
- `AppWorkspaceShell.tsx` đổi toàn bộ nav sang `/admin/apps/...`.

### 5) Token runtime/trash bền hơn
- `getAdminAuthToken()` ở runtime/trash giờ thử `refreshSession()` nếu `getSession()` chưa có access token.
- Giảm lỗi `ADMIN_AUTH_REQUIRED` kiểu hụt token ngắn hạn sau refresh.

## Kết quả kiểm tra
- `npm run build`: thành công.
- `npm test`: không chốt được vì sandbox Vitest bị rơi giữa chừng, không phải lỗi TypeScript/build của repo.

## Cách test tay đề xuất
1. Đăng nhập admin.
2. Vào `admin/apps`.
3. Bấm từng app -> `Cấu hình app`.
4. Chuyển sang `Runtime app` và `Trash` trong cùng admin host.
5. Kiểm tra không còn bị đá qua lại giữa 2 domain.
6. Thử revoke/restore/hard delete để xác nhận token admin hoạt động ổn.
