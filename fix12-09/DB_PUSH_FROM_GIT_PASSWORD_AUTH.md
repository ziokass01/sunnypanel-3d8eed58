# Sửa lỗi `cli_login_postgres` khi chạy Supabase DB Push

## Nguyên nhân

Lỗi xảy ra trước khi migration chạy. Supabase CLI đang dùng luồng đăng nhập không mật khẩu và cố tạo role tạm `cli_login_postgres`. Database đã restore có quan hệ role không tương thích nên lệnh `grant postgres to cli_login_postgres` thất bại.

Bản sửa ép `supabase link` và `supabase db push` dùng Database password. Luồng này không cần tạo role đăng nhập tạm và không yêu cầu chạy migration bằng SQL Editor.

## GitHub Secrets bắt buộc

Vào repository GitHub → Settings → Secrets and variables → Actions và khai báo:

- `SUPABASE_ACCESS_TOKEN`: Personal Access Token của tài khoản Supabase.
- `SUPABASE_PROJECT_REF`: project reference, không phải tên thư mục Git.
- `SUPABASE_DB_PASSWORD`: Database password trong Supabase Dashboard → Project Settings → Database.

Không nhập connection string, anon key, service-role key hoặc mật khẩu cũ của project trước khi restore vào `SUPABASE_DB_PASSWORD`.

## Tự động từ Git

Workflow `.github/workflows/supabase-functions.yml` sẽ chạy theo thứ tự:

1. Link project bằng Database password.
2. Chạy `db push --dry-run`.
3. Chạy `db push` thật.
4. Chỉ khi migration thành công mới cấu hình secret và deploy Edge Functions.

Nếu migration lỗi, job dừng và không deploy function mới.

## Chạy thủ công trên Termux/Ubuntu

Từ thư mục repository:

```bash
chmod +x tools/db_push_password_auth.sh
./tools/db_push_password_auth.sh
```

Hoặc dùng trực tiếp:

```bash
read -rsp "Database password: " SUPABASE_DB_PASSWORD; echo
export SUPABASE_DB_PASSWORD
supabase link --project-ref "PROJECT_REF_CUA_BAN" --password "$SUPABASE_DB_PASSWORD"
supabase db push --linked --password "$SUPABASE_DB_PASSWORD" --dry-run
supabase db push --linked --password "$SUPABASE_DB_PASSWORD" --yes
unset SUPABASE_DB_PASSWORD
```

## Điều không được làm

- Không chạy `supabase migration repair` tự động hoặc dùng `--include-all` khi chưa kiểm tra migration history; có thể khiến migration cũ được đánh dấu sai hoặc chạy lại trên server đang hoạt động.
- Không thêm SQL sửa role vào migration ứng dụng. Lỗi role chỉ thuộc luồng đăng nhập CLI.
- Không đổi `verify-key/index.ts` trong bản sửa này.
