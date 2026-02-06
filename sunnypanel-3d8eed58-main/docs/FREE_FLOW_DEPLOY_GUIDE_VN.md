# Hướng dẫn deploy & fix triệt để Free GetKey (mityangho.id.vn)

>Tài liệu này dành cho flow:
>
> - `/free` (chọn loại key → bấm **Get Key**)
> - Redirect sang Link4M rút gọn: `https://link4m.com/PkY7X`
> - Link4M redirect về `/free/gate` (đã vượt link)
> - `/free/gate` kiểm tra đã vượt link + tạo **claim_token**
> - `/free/claim` bấm **Verify** lần nữa → hiện key → bấm **Copy** để chốt

## 1) Nguyên nhân lỗi bạn đang gặp

Các lỗi như:

- `SERVER_RATE_LIMIT_MISCONFIG`
- `RATE_LIMIT_CHECK_FAILED`
- `/free` báo: **"Server đang cấu hình thiếu, vui lòng thử lại sau."**

Gần như chắc chắn là do **DB production chưa có đủ object phục vụ Free flow**:
table/rpc/index/RLS… mà các Edge Function (`free-start`, `free-gate`, `free-reveal`, `admin-free-test`) đang gọi.

➡️ Chỉ sửa Frontend sẽ không hết: phải **apply migration SQL**.

## 2) Việc cần làm (chỉ 1 lần)

### Bước A — Apply SQL migrations cho Free flow

Vào Supabase Dashboard → **SQL Editor** → chạy lần lượt 2 file SQL dưới đây (copy toàn bộ nội dung và Run):

1. `supabase/migrations/20260203093000_free_key_types_and_settings.sql`
   - tạo settings & key types cho free

2. `supabase/migrations/20260206101500_free_license_system_hardening.sql`
   - tạo tables rate-limit (IP/FP), blocklist, logs
   - tạo RPC `check_free_ip_rate_limit`, `check_free_fp_rate_limit`
   - bổ sung cột cần thiết cho `licenses_free_sessions`

> Hai file này đã được viết theo kiểu **idempotent** (có `IF NOT EXISTS`/`OR REPLACE`) → chạy lại cũng không hỏng.

### Bước B — Redeploy Edge Functions

Sau khi chạy SQL, cần redeploy các functions (để lấy schema mới + tránh cache):

- `free-config`
- `free-start`
- `free-gate`
- `free-reveal`
- `free-close`
- `admin-free-test`

Bạn deploy bằng cách nào cũng được:

**Cách 1 (CLI):**

```bash
supabase functions deploy free-config
supabase functions deploy free-start
supabase functions deploy free-gate
supabase functions deploy free-reveal
supabase functions deploy free-close
supabase functions deploy admin-free-test
```

**Cách 2 (Dashboard):** vào **Edge Functions** → chọn từng function → Deploy.

### Bước C — Set đúng Secrets/Env cho Edge Functions

Vào Supabase Dashboard → **Edge Functions → Secrets** và đảm bảo có:

- `PUBLIC_BASE_URL = https://mityangho.id.vn`
- `ADMIN_EMAILS = <email admin của bạn>` (nếu bạn dùng admin panel)

> Nếu `ADMIN_EMAILS` không set, có thể bị 401 ở trang admin khi chạy test.

## 3) Cấu hình Link4M đúng theo domain bạn

Mục tiêu:

1) User ở `/free` bấm **Get Key** → redirect tới `https://link4m.com/PkY7X`

2) Sau khi vượt Link4M xong, Link4M phải redirect về:

`https://mityangho.id.vn/free/gate`

3) `/free/gate` xong sẽ đưa user về:

`https://mityangho.id.vn/free/claim?claim=...`

Trong Admin → Free GetKey Settings:

- **Link4M outbound URL**: `https://link4m.com/PkY7X`
- **Gate callback**: `https://mityangho.id.vn/free/gate`
- **Claim base**: `https://mityangho.id.vn/free/claim`

## 4) Quy tắc chống bug key vô hạn (đã chỉnh)

Flow đúng theo yêu cầu của bạn:

- `/free/claim` luôn yêu cầu bấm **Verify**.
  - Nếu user reload trang → vẫn phải bấm Verify lại.
  - Server sẽ trả **cùng 1 key** nếu key đã được reveal trước đó (idempotent).
- Khi bấm **Copy**:
  - gọi `free-close` để chốt session
  - xoá token local
  - quay về `/free`
- Nếu user treo trang không Copy:
  - sau `return_after_seconds` sẽ tự quay về `/free`.

## 5) Checklist test (để biết đã "fix 100%")

1) Mở `https://mityangho.id.vn/free`
   - Không còn báo "Server đang cấu hình thiếu".
   - Dropdown key type có dữ liệu.

2) Bấm Get Key → phải sang `link4m.com/PkY7X`.

3) Vượt link → về `https://mityangho.id.vn/free/gate`
   - đợi countdown → tự chuyển sang `/free/claim?...`.

4) Ở `/free/claim`:
   - bấm Verify → hiện key
   - reload trang → quay lại nút Verify
   - bấm Verify lại → key **không đổi**
   - bấm Copy → bị đẩy về `/free`
   - quay lại `/free/claim` với claim cũ → không tạo key mới

Nếu vướng vẫn lỗi, xem log tại:

- Supabase → Edge Functions logs (free-start/free-gate/free-reveal)
- bảng `public.licenses_free_security_logs` (nếu migration đã apply)
