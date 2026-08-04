# Đồng bộ migration history an toàn cho project đã restore

## Vấn đề

`Remote migration versions not found in local migrations directory` nghĩa là bảng
`supabase_migrations.schema_migrations` trên project đang chạy có các version mà Git
hiện tại không có file tương ứng. Lỗi xảy ra trước khi migration mới được chạy.

Không chạy lệnh CLI gợi ý `migration repair --status reverted ...` trên production.
Lệnh đó xóa bản ghi lịch sử nhưng không hoàn tác schema, làm lịch sử sai lệch thêm.

## Một lần duy nhất trên máy quản trị

```bash
cd ~/sunnypanel-3d8eed58
git pull --ff-only
chmod +x tools/sync_remote_migrations_safe.sh tools/migration_history_guard.sh
export SUPABASE_PROJECT_REF="PROJECT_REF"
tools/sync_remote_migrations_safe.sh
```

Script sẽ:

1. Backup `supabase/migrations`.
2. Link bằng database password.
3. Dùng `supabase migration fetch --linked` để lấy file migration có trong remote history.
4. So sánh local/remote.
5. Không chạy `db push` và không sửa database.

Sau khi fetch, commit các file migration được tạo thêm:

```bash
git add supabase/migrations tools .github/workflows MIGRATION_HISTORY_SYNC_SAFE.md
git commit -m "Sync production migration history safely"
git push origin main
```

GitHub Actions chỉ chạy `db push` khi:

- Không còn remote-only migration.
- Không có local-only migration cũ hơn `20260804120000`.
- Migration pending chỉ thuộc đợt update an toàn hiện tại hoặc mới hơn.

## Tuyệt đối không dùng trên production

```bash
supabase migration repair --status reverted ...
supabase db push --include-all
supabase db reset --linked
```
