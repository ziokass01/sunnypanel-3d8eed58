# Fix runtime Free Key: Link4M Cloudflare + LICENSE_INSERT_FAILED

## Hai lỗi thực tế

### 1. `SHORTLINK_CREATE_FAILED`

Response lưu trong provider là trang HTML Cloudflare `Just a moment...`, không phải JSON API Link4M. Vì vậy parser không lấy được `shortenedUrl`.

Bản sửa:

- Chuẩn hóa Link4M sang `/api-shorten/v2`.
- Phát hiện Cloudflare challenge/HTML và chỉ lưu mã ngắn `LINK4M_CLOUDFLARE_CHALLENGE`, không nhét cả trang HTML vào panel.
- Thử các provider còn lại và legacy provider.
- Khi **toàn bộ provider chỉ lỗi tạm thời** (Cloudflare, mạng, timeout, HTTP 429/5xx), dùng direct emergency gate để trang GetKey không chết.
- Direct emergency gate được kích hoạt ngay (`min_delay_seconds = 0`) để không tự đốt token bằng `GATE_TOO_EARLY`.
- Sai token/cấu hình không được coi là lỗi tạm thời và vẫn fail-closed.
- Có thể tắt emergency mode bằng Supabase secret:

```text
FREE_SHORTLINK_FAIL_OPEN=false
```

### 2. `LICENSE_INSERT_FAILED`

Bảng `public.licenses` đã được bổ sung cột qua nhiều migration, nên các project có thể lệch schema/default hoặc PostgREST còn cache cũ. Một payload insert cố định có thể lỗi dù key `SUNNY-XXXX-XXXX-XXXX` hợp lệ.

Bản sửa:

- Thêm RPC DB `public.insert_free_license_compat(...)`, chỉ cấp quyền cho `service_role`.
- RPC insert trực tiếp trong Postgres và vẫn chạy trigger kiểm tra định dạng key.
- Edge Function có fallback nhiều schema nếu migration/RPC chưa có.
- Dùng chung helper cho:
  - `free-admin-test`
  - `free-reveal` thật
- Không lặp 12 lần khi gặp schema/constraint error; chỉ tạo key mới khi thật sự trùng unique key.
- Admin Test hiển thị `detail` và danh sách variant insert để lần sau thấy đúng lỗi DB thay vì chỉ có mã chung.

## File chính thay đổi

```text
src/pages/AdminFreeKeys.tsx
supabase/functions/_shared/cors.ts
supabase/functions/_shared/license-insert.ts
supabase/functions/free-admin-test/index.ts
supabase/functions/free-reveal/index.ts
supabase/functions/free-start/index.ts
supabase/functions/free-gate/index.ts
supabase/migrations/20260702180000_free_runtime_link4m_and_license_insert_repair.sql
```

## Deploy bắt buộc

Chạy workflow thủ công một lần:

```text
GitHub → Actions → Manual Supabase DB Push + Edge Functions
→ Run workflow
→ run_db_push = true
```

Migration phải chạy để tạo RPC và đồng bộ defaults. Sau đó workflow sẽ deploy lại Edge Functions.

Nếu migration history của project đang kẹt, mở Supabase SQL Editor và chạy:

```text
RUN_IN_SUPABASE_SQL_EDITOR_20260702_LINK4M_LICENSE_FIX.sql
```

rồi chạy workflow `Deploy Supabase Edge Functions` lại.

## Kiểm tra đã chạy

```text
Vite production build: PASS
Vitest: 12/12 PASS
ESLint file UI sửa: PASS
Deno check 5 file Edge/shared sửa: PASS
PostgreSQL parser cho migration: PASS
```
