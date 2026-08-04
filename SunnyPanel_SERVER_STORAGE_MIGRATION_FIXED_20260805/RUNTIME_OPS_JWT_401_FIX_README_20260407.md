# Fix JWT 401 cho app-domain runtime/trash

## Chốt nguyên nhân lần này
Lỗi hiện tại không còn nằm ở vòng lặp chuyển hướng admin/app nữa.

Điểm nghẽn còn lại là nhánh `server-app-runtime-ops`:
- frontend app-domain có thể giữ JWT cũ / lệch project / hết hạn ở local storage của riêng host `app.`
- workflow deploy cũ đẩy toàn bộ function theo kiểu chung, nên `server-app-runtime` và `server-app-runtime-ops` có thể lên live mà không giữ đúng trạng thái `verify_jwt = false`
- kết quả là bấm `Revoke session` hoặc `Xóa vĩnh viễn` vẫn bật `Invalid JWT`

## Những gì đã sửa trong repo này
### 1) Frontend
File `src/lib/admin-auth.ts`
- kiểm tra JWT có đúng format hay không
- kiểm tra token có còn thuộc đúng Supabase project hiện tại hay không
- nếu token cũ / lệch project / sắp hết hạn thì tự `refreshSession()` trước
- gọi thêm `supabase.auth.getUser(accessToken)` để xác nhận token sống thật trước khi bắn sang `server-app-runtime-ops`
- nếu vẫn hỏng thì báo rõ là cần đăng xuất / đăng nhập lại trên đúng host hiện tại

### 2) GitHub Actions / deploy
Hai workflow:
- `.github/workflows/supabase-functions.yml`
- `.github/workflows/supabase-deploy.yml`

đã được đổi từ kiểu:
- `supabase functions deploy --project-ref ...`

sang kiểu:
- deploy từng function thường riêng
- deploy riêng `server-app-runtime`
- deploy riêng `server-app-runtime-ops`
- ép cả hai function runtime dùng `--no-verify-jwt`

### 3) Secrets
Workflow giờ set thêm:
- `RUNTIME_OPS_ADMIN_KEY`

## Sau khi push repo này
1. Push lên GitHub
2. Chờ workflow chạy xong
3. Ở `app.mityangho.id.vn`, đăng xuất
4. Đăng nhập lại ngay trên host `app.`
5. Test lại:
   - Runtime -> Revoke session
   - Runtime -> Mở lại
   - Trash -> Xóa vĩnh viễn

## Nếu sau đó vẫn còn `Invalid JWT`
Lúc đó gần như chắc chắn live đang chạy build/function cũ hoặc secret live chưa đồng bộ.
Nên kiểm tra ngay:
- GitHub Actions có chạy bước `Deploy runtime functions with verify_jwt disabled` hay chưa
- secret `RUNTIME_OPS_ADMIN_KEY` đã có trong GitHub Secrets chưa
- function live có đúng project ref không
