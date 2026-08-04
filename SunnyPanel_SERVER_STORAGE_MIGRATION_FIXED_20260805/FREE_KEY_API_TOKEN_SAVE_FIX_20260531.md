# Free Key API/Token Save Fix 2026-05-31

Phạm vi: chỉ sửa phần Free Key admin + người dùng. Không sửa verify-key / rent-verify-key.

## Sửa chính

- Đổi UI provider rút gọn về đúng 2 ô bắt buộc:
  - `API`: ví dụ `https://link4m.co/api-shorten/v2`
  - `Token`: ví dụ token Link4M của admin
- Nút `Thêm API` tự điền sẵn API Link4M mặc định để tránh để trống.
- Khi lưu, frontend kiểm tra bắt buộc API + Token trước khi gửi.
- Bỏ lưu provider trực tiếp bằng Supabase client/RLS từ frontend.
- Thêm Edge Function admin-only `admin-free-shortlinks` dùng service role để list/save/delete provider, tránh lỗi lưu xong reload mất do RLS/schema cache/quyền client.
- Backend `free-start` vẫn đọc bảng `licenses_free_shortlink_providers` server-side và dùng API + Token để tạo shortlink.

## Cần deploy thêm function mới

```bash
supabase functions deploy admin-free-shortlinks
```

Vẫn cần chạy/deploy các phần cũ nếu chưa deploy:

```bash
supabase db push
supabase functions deploy free-start
supabase functions deploy free-gate
supabase functions deploy free-reveal
supabase functions deploy free-config
supabase functions deploy admin-free-shortlinks
```
