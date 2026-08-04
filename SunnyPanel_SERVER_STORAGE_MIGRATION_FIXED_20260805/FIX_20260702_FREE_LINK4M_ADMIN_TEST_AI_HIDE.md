# Fix 2026-07-02 — Free Link4M, Admin Test và ẩn SunnyMod AI card

## Phạm vi

Chỉ sửa luồng web Free Key và hai card SunnyMod Coding AI ở trang `/` và `/free`.
Không đổi `verify-key`, login app, rent, AI backend hoặc dữ liệu key hiện có.

## Các lỗi đã sửa

### 1. `SHORTLINK_CREATE_FAILED`

- Link4M API cũ lưu dạng `https://link4m.co/api-shorten/` hoặc không có `/v2` được tự chuẩn hóa về:

```text
https://link4m.co/api-shorten/v2
```

- Backend hỗ trợ thêm các tên field JSON phổ biến của shortlink.
- Thêm timeout 12 giây để request không treo.
- Khi có nhiều provider đang bật, backend thử provider kế tiếp nếu provider được chọn lỗi.
- Provider lỗi được ghi `last_error` + tăng `fail_count`; provider chạy thành công được xóa lỗi và reset `fail_count`.
- Token trong lỗi được che trước khi lưu/log.

Điều này đặc biệt quan trọng khi bảng đang có nhiều dòng Legacy/Link4M và một token cũ đã hết hiệu lực: một dòng hỏng sẽ không làm toàn bộ Get Key thất bại nếu còn dòng khác hoạt động.

### 2. `LICENSE_INSERT_FAILED` trong Admin Test

- Free Fire Admin Test nay tạo key `SUNNY-XXXX-XXXX-XXXX`, giống luồng phát key thật.
- Không còn gửi `NULL` vào `max_ips` / `max_verify` trên schema đã đặt hai cột này `NOT NULL`.
- `free-reveal` cũng dùng payload tương thích schema tương tự.

### 3. Session auto-close bị hiển thị như lỗi

Hai mã dọn phiên bình thường sau không còn hiện đỏ trong bảng Session:

```text
AUTO_CLOSE_STALE_PENDING
AUTO_CLOSE_OLD_SAME_FP
```

Dữ liệu backend vẫn được giữ nguyên để không mất dấu vết vận hành.

### 4. Ẩn SunnyMod Coding AI

Đã ẩn card SunnyMod Coding AI tại:

```text
/
/free
```

Route `/coding-ai` và backend AI không bị xóa hoặc thay đổi.

## Deploy

```bash
npm ci
npm run build

supabase db push
supabase functions deploy admin-free-shortlinks --no-verify-jwt
supabase functions deploy free-start --no-verify-jwt
supabase functions deploy free-gate --no-verify-jwt
supabase functions deploy free-reveal --no-verify-jwt
supabase functions deploy free-admin-test --no-verify-jwt
supabase functions deploy admin-free-test --no-verify-jwt
```

Sau đó deploy frontend theo hệ thống hosting hiện tại.

Nếu không dùng `supabase db push`, chạy file này trong SQL Editor:

```text
supabase/migrations/20260702153000_free_link4m_endpoint_normalize.sql
```

## Kiểm tra đã chạy

```text
npx tsc --noEmit                 PASS
npm test                         12/12 PASS
npm run build                    PASS
ESBuild parse 5 Edge Functions  PASS
ESLint các file đã sửa           0 error (1 warning cũ trong FreeLanding)
```
