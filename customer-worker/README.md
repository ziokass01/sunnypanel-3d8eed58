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
- `GATEWAY_SHARED_SECRET`: secret riêng giữa Worker và `verify-key`; phải trùng với `VERIFY_GATEWAY_SHARED_SECRET` trên Supabase
- `VERIFY_MAX_BODY_BYTES`: mặc định `8192`, giới hạn body riêng cho `verify-key`
- `API_MAX_BODY_BYTES`: mặc định `65536`, giới hạn body cho các function còn lại
- `UPSTREAM_TIMEOUT_MS`: mặc định `12000`, tối đa `30000`

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

`wrangler.jsonc` đã tắt `workers.dev` và preview URL để tránh tạo thêm đường dẫn public bỏ qua WAF của domain. Binding `VERIFY_RATE_LIMITER` giới hạn `120` request/phút/IP ngay tại Cloudflare trước khi request chạm Supabase.

## Lớp bảo vệ đã có

- `verify-key` chỉ nhận `POST` và route phải khớp chính xác.
- Body `verify-key` bị chặn khi vượt 8 KiB, kể cả request truyền theo stream.
- Header `x-gateway-*` do client gửi lên luôn bị xóa và Worker ký lại bằng IP thật Cloudflare.
- Request bị rate-limit không tạo invocation Supabase.
- Upstream quá 12 giây bị hủy; lỗi không trả URL/project Supabase.
- Response JSON hợp lệ từ `verify-key` được chuyển nguyên trạng, không đổi schema verify của menu.

## Lưu ý vận hành

- Không bật Managed Challenge hoặc JavaScript Challenge cho `/api/verify-key`: menu native không giải được challenge trình duyệt.
- Có thể thêm Cloudflare WAF Rate Limiting Rule dạng Block cho đúng path `/api/verify-key`, method `POST`, ngưỡng ban đầu `120 request / 1 phút / IP`. Theo dõi false positive trước khi hạ thấp.
- DDoS phân tán cần WAF/Rate Limiting ở Cloudflare; rate-limit trong Supabase chỉ là lớp cuối và vẫn tốn invocation/database.

## Lưu ý

- Worker này không thay thế `supabase.auth` ở frontend. Auth/session vẫn đang đi trực tiếp qua project Supabase trong repo hiện tại.
- Nếu đổi project, nhớ deploy functions + migrations + secrets đồng bộ ở project mới.
