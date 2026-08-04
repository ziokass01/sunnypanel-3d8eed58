# Hotfix 2026-04-07: lỗi Invalid JWT ở Runtime Session và Trash

## Triệu chứng vừa gặp
- `Revoke session thất bại`
- `Invalid JWT (401)` ở tab Session
- `Xóa vĩnh viễn thất bại`
- `Invalid JWT` ở tab Trash

## Kết luận nguyên nhân
Lỗi này nằm ở frontend khi gọi function `server-app-runtime-ops`.

Code cũ lấy token theo kiểu:
- gọi `supabase.auth.getSession()`
- chỉ cần thấy `access_token` còn tồn tại là dùng luôn
- **không kiểm tra token đã hết hạn hay sắp hết hạn chưa**

Hậu quả:
- UI vẫn đang mở bình thường
- query bảng có thể vẫn hiển thị được
- nhưng khi bấm action admin như `revoke_session`, `restore_session`, `hard_delete_session`, `hard_delete_entitlement` thì function nhận phải bearer token cũ và trả `Invalid JWT (401)`

## Hướng sửa đã làm
Tạo helper mới: `src/lib/admin-auth.ts`

Helper này làm 3 việc:
1. Kiểm tra session hiện tại có token **thật sự còn tươi** không, dựa trên `expires_at`
2. Nếu token đã cũ / sắp hết hạn thì chủ động `refreshSession()` trước khi gọi function admin
3. Nếu lần gọi đầu tiên vẫn dính `401` hoặc `Invalid JWT`, tự refresh token và retry **1 lần**

## File đã sửa
- `src/lib/admin-auth.ts`  ← file mới
- `src/pages/AdminServerAppRuntime.tsx`
- `src/pages/AdminServerAppTrash.tsx`

## Hành vi sau fix
Các action admin runtime/trash sẽ không còn lấy mù token cũ từ localStorage nữa.

Cụ thể các nút sau được hưởng fix:
- Revoke session
- Mở lại session
- Revoke entitlement
- Mở lại entitlement
- Cleanup
- Adjust wallet
- Xóa vĩnh viễn session
- Xóa vĩnh viễn entitlement

## Ghi chú quan trọng
Nếu sau khi deploy mà vẫn báo `Invalid JWT` thì lúc đó lỗi không còn nằm ở frontend nữa, mà phải kiểm tra một trong các điểm sau:
- user admin hiện tại đã bị sign out thật
- refresh token trong browser đã hỏng
- secret/env của Supabase function đang lệch project
- function `server-app-runtime-ops` trên môi trường live chưa được deploy đúng bản

## Cách test lại
1. đăng nhập lại admin một lần cho sạch session
2. vào `admin/apps`
3. vào app detail
4. vào tab `Session`
5. bấm `Revoke session`
6. thử `Mở lại`
7. vào `Trash`
8. bấm `Xóa vĩnh viễn`

Nếu cả 3 thao tác trên qua được thì lỗi JWT phía frontend đã được xử lý đúng.
