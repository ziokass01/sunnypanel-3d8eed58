# Backend setup (FREE flow) — run without CLI

Mục tiêu: để flow FREE chạy ổn định:
`/free -> Link4M outbound -> /free/gate -> /free/claim`

## 1) Secrets bắt buộc (Lovable Cloud)
Thiết lập các secrets sau trong Backend (không hardcode trong source):
- `PUBLIC_BASE_URL=https://mityangho.id.vn`
- `ADMIN_EMAILS=mquyet399@gmail.com`
- `SUPABASE_SERVICE_ROLE_KEY` (bắt buộc cho các backend functions)

Tuỳ chọn:
- `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` (anti-bot)

## 2) Apply migrations bằng SQL Editor (không cần CLI)
Vào Backend -> Run SQL (chọn đúng môi trường Live khi làm production), chạy các file trong `supabase/migrations/` theo thứ tự timestamp.

Các file FREE tối thiểu (theo tài liệu hiện có trong repo):
- `20260205101000_free_schema.sql`
- `20260205170000_free_rate_limit_and_admin_controls.sql`
- `20260206150000_free_schema_runtime_fix.sql`

Nếu thiếu các RPC/bảng rate-limit, `/free` sẽ báo `SERVER_RATE_LIMIT_MISCONFIG`.

## 3) Cấu hình Link4M outbound template
Trong Admin -> Free settings -> `free_outbound_url`:
- BẮT BUỘC dùng placeholder:
  - `{GATE_URL_ENC}` (khuyến nghị)
  - hoặc `{GATE_URL}`

Ví dụ:
- `https://link4m.co/st?api=YOUR_TOKEN&url={GATE_URL_ENC}`
- `https://link4m.co/st?api=YOUR_TOKEN&url=?redirect={GATE_URL_ENC}`

Nếu URL là Link4M nhưng thiếu placeholder, backend sẽ trả lỗi:
- `OUTBOUND_URL_TEMPLATE_INVALID`

## 4) Delay tối thiểu (TOO_FAST)
- Nếu tắt delay trong Admin UI, hệ thống sẽ lưu `free_min_delay_seconds = 0`.
- Khi `free_min_delay_seconds = 0`, gate sẽ bỏ qua check `TOO_FAST`.

## 5) Chẩn đoán nhanh
- Trang `/admin/free-keys` có:
  - `Ping backend (free-config)` để kiểm tra gọi backend/CORS
  - `Admin Test GetKey` hiển thị payload + response

