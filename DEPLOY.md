# DEPLOY.md (Sunny License Manager)

## TL;DR
- Lovable **deploy frontend** (React/Vite).
- Backend (database schema + backend functions + secrets) cần được deploy qua **Lovable Cloud / CLI**.

---

## 1) Secrets bắt buộc (Backend)
Thiếu secrets sẽ gây:
- `/free` báo **FREE_NOT_READY**
- `/admin/free-keys` bấm Test bị **401/500**

Cần có tối thiểu:
- `SUPABASE_SERVICE_ROLE_KEY` (bắt buộc cho backend functions FREE)
- `PUBLIC_BASE_URL=https://mityangho.id.vn`
- `ADMIN_EMAILS=<comma-separated admin emails>`

Khuyến nghị:
- `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` (nếu bật anti-bot)

---

## 2) Migrations FREE cần có
Các lỗi kiểu `SERVER_RATE_LIMIT_MISCONFIG` xảy ra khi database **thiếu table/RPC** cho FREE rate-limit.

Trong repo hiện có các migration FREE quan trọng (xem thư mục `supabase/migrations/`), tiêu biểu:
- `20260203093000_free_key_types_and_settings.sql`
- `20260205170000_free_rate_limit_and_admin_controls.sql`
- `20260205193000_fix_free_rate_limit_rpc_and_admin_ops.sql`
- `20260206150000_free_schema_runtime_fix.sql`
- `20260207123000_fix_free_rate_limit_signatures_and_view.sql`

> Lưu ý: chỉ cần **db push** là sẽ apply đúng thứ tự timestamp.

---

## 3) Deploy backend bằng CLI
### Link project
```bash
supabase link --project-ref <PROJECT_REF>
```

### Apply migrations
```bash
supabase db push
```

### Deploy backend functions
```bash
supabase functions deploy free-config free-start free-gate free-reveal free-close \
  admin-free-test admin-free-block admin-free-delete-issued admin-free-delete-session
```

---

## 4) Checklist sau deploy (Acceptance)
1) `/admin/free-keys` → bấm **Test**: không 401.
2) `/free` → Get Key → redirect Link4M → `/free/gate`:
   - chưa đủ delay → `TOO_FAST` và bị đá về `/free`.
   - đủ delay → qua `/free/claim?...`.
3) `/free/claim` tự hiện key, reload không mint key mới, copy/timeout quay về `/free`.
