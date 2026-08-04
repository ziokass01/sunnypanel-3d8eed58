# FIX REPORT 2026-04-07 JWT RETRY V2

## Lỗi được xử lý
- `Revoke session thất bại - Invalid JWT (401)`
- `Xóa vĩnh viễn thất bại - Invalid JWT`

## Nguyên nhân thực tế
Frontend ở repo hiện tại vẫn đang lấy thẳng `supabase.auth.getSession().data.session?.access_token` rồi gửi ngay sang function `server-app-runtime-ops`.

Khi access token trong local session đã cũ / gần hết hạn, UI vẫn có thể đang mở bình thường nhưng action admin gửi lên edge function sẽ bị Supabase chặn với `Invalid JWT`.

## Cách sửa đã áp dụng
Tạo helper mới `src/lib/admin-auth.ts`:
- kiểm tra `expires_at`
- tự `refreshSession()` nếu token sắp hết hạn
- nếu request đầu tiên vẫn dính `Invalid JWT` / `401` thì refresh cưỡng bức và retry thêm 1 lần

## File đã sửa
1. `src/lib/admin-auth.ts`
2. `src/pages/AdminServerAppRuntime.tsx`
3. `src/pages/AdminServerAppTrash.tsx`

## Chi tiết patch
### `src/lib/admin-auth.ts`
- thêm `getFreshAdminAuthToken()`
- thêm `isInvalidJwtError()`
- thêm `postAdminRuntimeOps()`

### `src/pages/AdminServerAppRuntime.tsx`
- bỏ lấy token kiểu cũ cho các action runtime ops
- đổi toàn bộ action runtime sang `postAdminRuntimeOps(...)`

### `src/pages/AdminServerAppTrash.tsx`
- bỏ lấy token kiểu cũ cho hard delete
- đổi hard delete session / entitlement sang `postAdminRuntimeOps(...)`

## Trạng thái kiểm tra
- `npm ci`: OK
- `npm run build`: OK

## Gợi ý test sau khi push/deploy
1. đăng nhập admin lại một lần
2. vào `admin/apps/:appCode/runtime`
3. test `Revoke session`
4. vào `trash`
5. test `Xóa vĩnh viễn`

Nếu vẫn còn `Invalid JWT` sau bản này thì lỗi gần như không còn nằm ở đoạn frontend gọi function nữa, mà phải kiểm tra tiếp:
- function deploy live có đúng bản mới không
- session admin trong browser có bị hỏng hoàn toàn không
- domain live có đang chạy nhầm build cũ không
