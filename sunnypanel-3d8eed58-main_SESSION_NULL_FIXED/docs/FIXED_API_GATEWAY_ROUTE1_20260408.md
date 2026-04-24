# Fixed API gateway route 1

## Mục tiêu

- Frontend gọi API cố định: `https://mityangho.id.vn/api/...`
- Khi đổi project Supabase chỉ đổi upstream trong worker
- Giữ auth/admin trực tiếp qua `VITE_SUPABASE_URL` để tránh gãy session

## Những gì đã sửa

1. `src/lib/functions.ts`
   - Ưu tiên `VITE_PUBLIC_API_BASE_URL`
   - Nếu không có thì fallback về `VITE_SUPABASE_URL/functions/v1`

2. `customer-worker/index.js`
   - Đổi từ proxy verify riêng thành gateway chung cho Edge Functions
   - Hỗ trợ `/api/<function-name>`
   - Forward các header quan trọng như `Authorization`, `apikey`, `Hmac`

3. `supabase/config.toml`
   - Khai báo đủ các functions đang có trong repo để giảm nguy cơ sót khi deploy

4. Xóa toàn bộ file `nova-*` trong `public/`
   - Thay bằng `verify-gateway.html` và config generic

## Cách đổi qua lại 2 project

Tạo 2 profile:

```bash
cp project-switch/api-profile.template.local project-switch/project-a.api.local
cp project-switch/api-profile.template.local project-switch/project-b.api.local
```

Sau đó điền `ACTIVE_SUPABASE_URL` và `UPSTREAM_ANON_KEY` cho từng project.

Áp dụng profile:

```bash
./scripts/use-api-upstream.sh project-a
./scripts/api-upstream-status.sh
```

## Route public đề xuất

- `https://mityangho.id.vn/api/verify-key`
- `https://mityangho.id.vn/api/rent-verify-key`
- `https://mityangho.id.vn/api/free-start`
- `https://mityangho.id.vn/api/free-gate`
- `https://mityangho.id.vn/api/free-reveal`
- `https://mityangho.id.vn/api/free-resolve`
- `https://mityangho.id.vn/api/reset-key`
- `https://mityangho.id.vn/api/admin-rent`
- `https://mityangho.id.vn/api/admin-rent-integrations`
- `https://mityangho.id.vn/api/server-app-runtime`
- `https://mityangho.id.vn/api/server-app-runtime-ops`

## Điều cố ý chưa đổi

- `src/integrations/supabase/client.ts` vẫn dùng `VITE_SUPABASE_URL`
- `src/lib/admin-auth.ts` vẫn dựa vào Supabase auth trực tiếp

Lý do: auth/session Supabase gắn với từng project. Nếu đẩy auth vào trò đổi upstream ngay bây giờ, nguy cơ gãy session/admin cao hơn lợi ích.
