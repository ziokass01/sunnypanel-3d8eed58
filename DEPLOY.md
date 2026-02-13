# DEPLOY.md (Sunny License Manager)

## TL;DR
- Lovable chỉ **deploy frontend** (React/Vite).
- Backend (schema/migrations + backend functions + secrets) phải được deploy/cấu hình trong **Lovable Cloud** (CLI/Cloud View).

---

## 0) Chốt 1 backend project duy nhất (tránh “Failed to fetch”)
Nếu **project mismatch** (frontend gọi 1 project, backend functions/migrations lại ở project khác) thì browser sẽ báo **Failed to fetch**.

✅ Checklist:
- Frontend dùng `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`).
- Backend CLI phải `link` đúng **cùng project ref** trước khi `db push`/deploy functions.
- Không sửa tay `supabase/config.toml` trong môi trường Lovable Cloud; hãy đảm bảo CLI đang link đúng project ref.

---

## 1) CORS (trong backend settings)
Nếu browser báo **Failed to fetch** (không có HTTP status), thường là CORS bị chặn.

Trong backend → API → CORS Allowed Origins, thêm tối thiểu:
- `https://mityangho.id.vn`
- `https://www.mityangho.id.vn`
- `https://sunnypanel.lovable.app`
- `https://review--sunnypanel.lovable.app`

> Lưu ý: các môi trường preview/review của Lovable cũng cần được allow (tuỳ backend settings).

---

## 2) Secrets bắt buộc (Backend)
Thiếu secrets sẽ gây:
- `/free` báo **FREE_NOT_READY**
- `/admin/free-keys` bấm Test bị **UNAUTHORIZED/500**

Bắt buộc:
- `SUPABASE_SERVICE_ROLE_KEY`
- `PUBLIC_BASE_URL=https://mityangho.id.vn`
- `ADMIN_EMAILS=<comma-separated admin emails>`

Khuyến nghị (anti-bot):
- `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`

---

## 3) Migrations FREE cần có
Các lỗi kiểu `SERVER_RATE_LIMIT_MISCONFIG` xảy ra khi database **thiếu RPC/bảng** cho FREE rate-limit.

Tối thiểu cần có (chạy theo thứ tự timestamp bằng `db push`):
- `supabase/migrations/20260205101000_free_schema.sql`
- `supabase/migrations/20260205170000_free_rate_limit_and_admin_controls.sql`
- `supabase/migrations/20260206150000_free_schema_runtime_fix.sql`

---

## 4) Deploy backend bằng CLI
```bash
supabase link --project-ref <PROJECT_REF>

supabase db push

supabase functions deploy free-config free-start free-gate free-reveal free-close \
  admin-free-test admin-free-settings admin-free-block admin-free-unblock
```

---

## 5) Checklist sau deploy (Acceptance)
1) `/admin/free-keys` → bấm **Test**: không 401, nếu thiếu `ADMIN_EMAILS` phải báo `SERVER_MISCONFIG_MISSING_ADMIN_EMAILS`.
2) `/free` → load được config + key types, bấm **Get Key** hoạt động.
3) `/free/gate`:
   - chưa đủ delay → `TOO_FAST` và bị đá về `/free`.
   - đủ delay → qua `/free/claim?...`.
4) `/free/claim` reload không mint key mới, chỉ trả lại key đã reveal (idempotent).
