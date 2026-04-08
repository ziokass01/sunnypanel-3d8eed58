# DEPLOY.md (Sunny License Manager)

## Root cause (deploy mismatch)
Live site không phản ánh code mới thường đến từ **frontend deploy mismatch**, không phải do thiếu route/component trong repo:
- Build chạy từ sai branch/sai project/sai root directory nên artifacts không phải từ `main` của repo này.
- `index.html` bị cache quá lâu nên browser giữ entry cũ, không tải bundle mới.
- Custom domain có thể đang trỏ sang project deploy khác với project chứa commit mới.

Repo hiện đã có đầy đủ các phần public/admin liên quan Reset Key/Reset Settings/Reset Logs. Vì vậy ưu tiên số 1 là khóa chặt cấu hình deploy frontend để luôn build đúng nguồn.

---

## Bất biến production (KHÔNG đổi)
- Public domain: `https://mityangho.id.vn`
- Admin domain: `https://admin.mityangho.id.vn`
- Route đang dùng:
  - `/`
  - `/free`
  - `/rent`
  - `/reset-key`
  - `/settings/reset-key`
  - `/settings/reset-logs`
- Supabase project ref: `ijvhlhdrncxtxosmnbtt`
- Key format: `SUNNY-XXXX-XXXX-XXXX`

---

## Frontend production checklist (bắt buộc)
### 1) Source mapping
- Git repo: `ziokass01/sunnypanel-3d8eed58`
- Production branch: `main`
- Root directory: `.` (repo root)
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `dist`

### 2) Domain mapping
- `mityangho.id.vn` và `admin.mityangho.id.vn` phải cùng map vào **đúng 1 frontend project production** build từ branch `main` nêu trên.
- Không map custom domain sang preview project hoặc project clone.

### 3) Chống stale frontend
- Bắt buộc trả header cho HTML entry:
  - `/index.html` → `Cache-Control: no-store, max-age=0, must-revalidate`
- File đã có trong repo:
  - `public/_headers` (static hosts hỗ trợ `_headers`)
  - `vercel.json` (Vercel)
  - `netlify.toml` (Netlify)

### 4) SPA routing fallback
- Mọi route frontend phải fallback về `/index.html` để tránh 404 khi F5 trực tiếp:
  - `/reset-key`
  - `/settings/reset-key`
  - `/settings/reset-logs`

---

## Env frontend (.env)
Dùng đúng project production hiện tại:

```env
VITE_SUPABASE_PROJECT_ID=ijvhlhdrncxtxosmnbtt
VITE_SUPABASE_URL=https://ijvhlhdrncxtxosmnbtt.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<...>

# Optional - define exact admin hostnames
VITE_ADMIN_HOSTS=admin.mityangho.id.vn

# Optional - required only if you turn on require_turnstile
VITE_TURNSTILE_SITE_KEY=<...>
```

---

## Backend checklist (Supabase)
### Link đúng project
```bash
supabase link --project-ref ijvhlhdrncxtxosmnbtt
```

### Deploy DB + functions
```bash
supabase db push

supabase functions deploy free-config free-start free-gate free-reveal free-close free-resolve \
  admin-free-test admin-free-settings admin-free-block admin-free-unblock reset-key verify-key
```

### Secrets tối thiểu
- `SUPABASE_SERVICE_ROLE_KEY`
- `PUBLIC_BASE_URL=https://mityangho.id.vn`
- `ADMIN_EMAILS=<comma-separated emails>`

Turnstile (chỉ khi cần bật require_turnstile):
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`

---

## Quy trình redeploy frontend chuẩn
1. Đảm bảo code đã merge vào `main`.
2. Trigger production deploy từ `main` (không dùng preview URL làm production).
3. Purge cache/CDN của 2 custom domains.
4. Hard refresh trình duyệt (hoặc mở private window).
5. Verify trực tiếp:
   - Public `/` có 3 card: Thuê Website, Key Free, Reset Key.
   - Public có route `/reset-key` hoạt động.
   - Admin sidebar có `Reset Settings`, `Reset Logs`.

---

## Acceptance smoke tests
- `npm run build` pass.
- Public host render đúng card + route mới.
- Admin host render đúng menu mới.
- `/settings/reset-key` & `/settings/reset-logs` load bình thường.
- Bật `require_turnstile` chỉ khi frontend có `VITE_TURNSTILE_SITE_KEY` và backend có secret tương ứng.
