# VITE setup

## Biến cần set ở frontend

- `VITE_SUPABASE_PROJECT_ID=ijvhlhdrncxtxosmnbtt`
- `VITE_SUPABASE_URL=https://ijvhlhdrncxtxosmnbtt.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key của Supabase>`
- `VITE_ADMIN_HOSTS=admin.mityangho.id.vn`
- `VITE_TURNSTILE_SITE_KEY=<site key của Cloudflare Turnstile>` nếu bạn muốn bật Turnstile ở frontend

## Khi nào cần `VITE_TURNSTILE_SITE_KEY`

- Không bắt buộc cho login/panel thường.
- Chỉ cần khi bạn bật Turnstile ở trang public như `/reset-key` hoặc các form khác.

## Ở đâu để set

- Nếu deploy trên Vercel/Netlify/Lovable: thêm vào Environment Variables rồi redeploy frontend.
- Nếu chạy local: sửa file `.env` hoặc `.env.local`.

## Ví dụ

```env
VITE_SUPABASE_PROJECT_ID=ijvhlhdrncxtxosmnbtt
VITE_SUPABASE_URL=https://ijvhlhdrncxtxosmnbtt.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
VITE_ADMIN_HOSTS=admin.mityangho.id.vn
VITE_TURNSTILE_SITE_KEY=0x4AAAA...
```
