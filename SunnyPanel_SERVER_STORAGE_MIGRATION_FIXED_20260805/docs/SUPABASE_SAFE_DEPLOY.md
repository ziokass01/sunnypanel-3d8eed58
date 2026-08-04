# Supabase safe deploy

## Luồng thường ngày
- Push code lên `main` => workflow `Deploy Supabase Edge Functions` chạy
- Workflow này **không push DB**
- Dùng cho các lần sửa function / frontend / code runtime để tránh đụng lại lỗi migration history mismatch

## Khi nào mới dùng DB workflow
Chỉ dùng `Manual Supabase DB Push (Safe)` khi vừa thêm migration mới và đã chắc chắn local migration đang khớp remote history.

## Cách chạy an toàn
1. Mở workflow `Manual Supabase DB Push (Safe)`
2. Nhìn file migration mới nhất trong repo
3. Gõ **đúng nguyên tên file** vào ô `confirm_newest_local_migration`
4. Chạy workflow
5. Workflow sẽ:
   - `supabase migration list`
   - check tên migration mới nhất
   - `supabase db push --include-all --dry-run`
   - mới push thật nếu dry-run không nổ

## Vì sao phải tách ra
Lỗi kiểu dưới đây xuất hiện khi remote có version mà local repo không có hoặc migration history bị lệch:
- `Remote migration versions not found in local migrations directory`

Khi tách functions deploy khỏi DB deploy, việc sửa function không còn kéo theo nguy cơ dẫm lại bãi mìn migration.
