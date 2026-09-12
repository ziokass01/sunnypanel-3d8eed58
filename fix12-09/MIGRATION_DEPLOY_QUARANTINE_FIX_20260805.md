# Migration deploy quarantine fix — 2026-08-05

## Lỗi đã sửa

1. GitHub Actions thiếu `tools/migration_list_parser.py` nên parser không chạy.
2. Parser cũ không nhận dạng output có backtick/ký tự trang trí, làm báo sai rằng không có migration pending.
3. Repository còn nhiều migration lịch sử local-only trước migration cuối trên remote. `db push` từ chối và gợi ý `--include-all`.

## Cơ chế mới

- Không dùng `migration repair`.
- Không dùng `db push --include-all`.
- Backup toàn bộ `supabase/migrations` vào thư mục tạm.
- Fetch migration đã áp dụng từ remote.
- Tạm di chuyển các migration lịch sử local-only, nhỏ hơn `20260804120000`, ra khỏi thư mục mà CLI đọc.
- Chỉ cho phép bốn version production:
  - `20260804120000`
  - `20260804160000`
  - `20260805020000`
  - `20260805030000`
- Chạy dry-run rồi mới push.
- Restore working tree local khi script kết thúc.
- Khóa SHA-256 `verify-key/index.ts` để không làm lệch menu V10.1.

## Ý nghĩa

Các migration lịch sử local-only không bị xóa khỏi Git và không bị đánh dấu giả trong remote history. Chúng chỉ bị quarantine trên runner trong lúc deploy, vì server production đang chạy và mục tiêu hiện tại chỉ là áp dụng các migration mới đã kiểm tra.
