# Deploy backend functions (Sunny License Manager)

Mục tiêu: tránh lỗi trình duyệt **“Failed to fetch”** khi gọi backend functions từ domain production (CORS preflight / gateway auth chặn trước khi vào code), và đảm bảo flow FREE chạy ổn.

> Ghi chú: Các lệnh dưới đây dành cho trường hợp bạn deploy thủ công bằng CLI. Trong Lovable Cloud, functions sẽ được deploy theo môi trường khi bạn publish, nhưng **nguyên tắc “no-verify-jwt” cho các endpoint gọi từ browser** vẫn là bắt buộc để OPTIONS không bị chặn.

## 1) Chốt đúng project

- Backend URL cho auth/admin: `VITE_SUPABASE_URL = https://<PROJECT_REF>.supabase.co`
- Backend URL cho function gateway: `VITE_PUBLIC_API_BASE_URL = https://mityangho.id.vn/api`
- Khi deploy bằng CLI: luôn truyền `--project-ref <PROJECT_REF>` đúng với backend URL.

## 2) Deploy các function cần gọi từ browser với `--no-verify-jwt`

Các endpoint gọi từ browser sẽ có **OPTIONS preflight**. Nếu verify-jwt bật, gateway có thể trả 401 trước khi code chạy ⇒ thiếu CORS headers ⇒ browser hiện **Failed to fetch**.

### Admin endpoints

```bash
supabase functions deploy admin-free-test --project-ref <PROJECT_REF> --no-verify-jwt
supabase functions deploy free-admin-test  --project-ref <PROJECT_REF> --no-verify-jwt
supabase functions deploy admin-free-block --project-ref <PROJECT_REF> --no-verify-jwt
supabase functions deploy admin-free-delete-session --project-ref <PROJECT_REF> --no-verify-jwt
supabase functions deploy admin-free-delete-issued  --project-ref <PROJECT_REF> --no-verify-jwt
```

### Public FREE flow

```bash
supabase functions deploy free-config  --project-ref <PROJECT_REF> --no-verify-jwt
supabase functions deploy free-start   --project-ref <PROJECT_REF> --no-verify-jwt
supabase functions deploy free-resolve --project-ref <PROJECT_REF> --no-verify-jwt
supabase functions deploy free-gate    --project-ref <PROJECT_REF> --no-verify-jwt
supabase functions deploy free-reveal  --project-ref <PROJECT_REF> --no-verify-jwt
supabase functions deploy free-close   --project-ref <PROJECT_REF> --no-verify-jwt
```

## 3) Checklist xác nhận trên trình duyệt

- Mở DevTools → Network:
  - `OPTIONS /admin-free-test` trả `204` và có `Access-Control-Allow-Origin` đúng domain
  - `POST /admin-free-test` trả `200` hoặc `401/403` nhưng **có JSON + CORS headers**

## 4) Troubleshooting nhanh

- Nếu FE báo `ADMIN_AUTH_REQUIRED`: bạn chưa đăng nhập hoặc token chưa được truyền khi gọi `admin-*`.
- Nếu FE báo `Failed to fetch` và có `tried URLs:` trong message:
  - kiểm tra deploy đúng tên function (`/admin-free-test` vs `/free-admin-test`)
  - kiểm tra đã deploy vào đúng project-ref
  - kiểm tra domain production nằm trong allowlist CORS.
