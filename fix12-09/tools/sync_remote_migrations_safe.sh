#!/usr/bin/env bash
set -Eeuo pipefail

# One-time, non-destructive sync for a restored/live Supabase project.
# This script only fetches migration files stored in remote history.
# It does not change the database and does not run db push.

if ! command -v supabase >/dev/null 2>&1; then
  echo "Không tìm thấy Supabase CLI." >&2
  exit 1
fi

PROJECT_REF="${SUPABASE_PROJECT_REF:-${PROJECT_REF:-}}"
if [ -z "$PROJECT_REF" ]; then
  printf 'Nhập SUPABASE_PROJECT_REF: '
  IFS= read -r PROJECT_REF
fi
if [ -z "$PROJECT_REF" ]; then
  echo "SUPABASE_PROJECT_REF đang rỗng." >&2
  exit 1
fi

if [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then
  printf 'Nhập Database password của project: '
  IFS= read -rs SUPABASE_DB_PASSWORD
  printf '\n'
  export SUPABASE_DB_PASSWORD
fi

cleanup() {
  unset SUPABASE_DB_PASSWORD
}
trap cleanup EXIT

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="migration-history-backup/${stamp}"
mkdir -p "$backup_dir"
cp -a supabase/migrations "$backup_dir/migrations"

echo "Đã backup local migrations tại: $backup_dir/migrations"

echo "[1/4] Link project bằng Database password..."
SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" \
  supabase link --project-ref "$PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"

echo "[2/4] Fetch migration files từ remote history (không sửa database)..."
SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" \
  supabase migration fetch --linked

echo "[3/4] So sánh local và remote..."
set +e
SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" \
  tools/migration_history_guard.sh
status=$?
set -e

echo "[4/4] Git status sau khi fetch:"
git status --short -- supabase/migrations || true

if [ "$status" -eq 0 ]; then
  echo "Lịch sử remote/local đã đồng bộ; migration pending nếu có đã qua cổng an toàn."
  exit 0
fi
if [ "$status" -eq 2 ]; then
  echo "CLI không fetch đủ migration remote. Không sửa history và không db push." >&2
  exit 2
fi
if [ "$status" -eq 3 ]; then
  echo "Đã fetch xong nhưng còn migration local cũ không có trên remote." >&2
  echo "Không db push. Giữ nguyên backup và gửi output migration list để đối chiếu." >&2
  exit 3
fi

exit "$status"
