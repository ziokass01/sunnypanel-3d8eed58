# Fixed API gateway worker

Worker này đứng giữa frontend/public domain và Edge Functions thật của Supabase.

Mục tiêu:
- Frontend chỉ gọi một API cố định, ví dụ `https://mityangho.id.vn/api/...`
- Khi cần đổi project Supabase, chỉ đổi upstream trong worker
- Giữ auth/admin của Supabase riêng nếu bạn chưa refactor auth qua gateway

## Biến môi trường cần set

- `PUBLIC_API_BASE_URL`: URL public cố định, ví dụ `https://mityangho.id.vn/api`
- `ACTIVE_SUPABASE_URL`: URL project đang active, ví dụ `https://project-a.supabase.co`
- `ACTIVE_FUNCTIONS_BASE_URL`: tùy chọn. Nếu set thì worker sẽ dùng trực tiếp URL này thay vì tự ghép từ `ACTIVE_SUPABASE_URL`
- `UPSTREAM_ANON_KEY`: tùy chọn. Dùng khi request gửi vào worker không mang `apikey`
- `ALLOWED_ORIGINS`: danh sách origin được phép gọi, ngăn bằng dấu phẩy
- `ALLOWED_FUNCTIONS`: tùy chọn. Danh sách function được phép proxy, ngăn bằng dấu phẩy

## Route

- `GET /health` hoặc `GET /api/health`
- `GET|POST /api/<function-name>`
- `GET|POST /<function-name>`

Ví dụ:

- `POST /api/rent-verify-key`
- `POST /api/free-start`
- `POST /api/reset-key`
- `POST /api/admin-rent`
- `POST /api/server-app-runtime`

## Cách hoạt động

Worker sẽ forward request sang:

```
ACTIVE_FUNCTIONS_BASE_URL/<function-name>
```

hoặc nếu `ACTIVE_FUNCTIONS_BASE_URL` không có thì tự ghép:

```
ACTIVE_SUPABASE_URL/functions/v1/<function-name>
```

Worker sẽ giữ các header quan trọng nếu có:
- `Authorization`
- `apikey`
- `Hmac`
- `X-Client-Info`

## Gợi ý deploy nhanh với Cloudflare Worker

1. Tạo worker mới hoặc dùng worker hiện tại.
2. Dán file `index.js` vào.
3. Set các vars/secrets ở dashboard.
4. Tạo route public như `mityangho.id.vn/api/*` trỏ vào worker.
5. Kiểm tra `https://mityangho.id.vn/api/health`.

## Lưu ý

- Worker này không thay thế `supabase.auth` ở frontend. Auth/session vẫn đang đi trực tiếp qua project Supabase trong repo hiện tại.
- Nếu đổi project, nhớ deploy functions + migrations + secrets đồng bộ ở project mới.
