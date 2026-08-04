SUNNYPANEL — MIGRATION HISTORY SYNC / APPLY NOW — 05-08-2026

Tình trạng từ ảnh:
- supabase link bằng Database password đã thành công.
- migration repair --status reverted đã thất bại trước khi kết nối DB, nên chưa sửa history.
- tools/migration_history_guard.sh và tools/sync_remote_migrations_safe.sh chưa có trong repo vì patch trước chưa được chép.

CÀI PATCH:
1. Giải nén ZIP.
2. Chạy:
   bash APPLY_PATCH_TERMUX.sh ~/sunnypanel-3d8eed58

ĐỒNG BỘ CÁC MIGRATION REMOTE VỀ GIT, KHÔNG SỬA DATABASE:
   cd ~/sunnypanel-3d8eed58
   export SUPABASE_PROJECT_REF="PROJECT_REF_CUA_BAN"
   tools/sync_remote_migrations_safe.sh

Sau khi fetch:
   git status --short -- supabase/migrations
   SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" supabase migration list --linked --password "$SUPABASE_DB_PASSWORD"

Chỉ tiếp tục khi:
- không còn cột REMOTE mà cột LOCAL trống;
- migration local pending cũ hơn 20260804120000 không xuất hiện;
- pending dự kiến chỉ là 20260804120000 và 20260804160000.

Sau đó commit toàn bộ migration vừa fetch + workflow + tools và push Git.
Workflow sẽ dừng trước deploy nếu history vẫn lệch.

KHÔNG chạy:
- migration repair --status reverted hàng loạt
- db push --include-all
- db reset --linked

verify-key không nằm trong patch này và không bị sửa.
