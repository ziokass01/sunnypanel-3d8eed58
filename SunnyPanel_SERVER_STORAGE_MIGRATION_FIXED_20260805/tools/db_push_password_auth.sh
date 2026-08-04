#!/usr/bin/env bash
set -Eeuo pipefail

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
  [ -n "${PENDING_HASH_FILE:-}" ] && rm -f "$PENDING_HASH_FILE"
}
trap cleanup EXIT

SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" \
  supabase link --project-ref "$PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"

# Save hashes of migrations that are pending before fetch. migration fetch may
# rewrite already-applied local files, but it must never change a pending file.
PENDING_HASH_FILE="$(mktemp)"
LIST_BEFORE="$(SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" \
  supabase migration list --linked --password "$SUPABASE_DB_PASSWORD" 2>&1)" || {
  printf '%s\n' "$LIST_BEFORE" >&2
  exit 1
}

mapfile -t pending_versions < <(printf '%s\n' "$LIST_BEFORE" | python3 tools/migration_list_parser.py local-only)
for local_version in "${pending_versions[@]}"; do
  shopt -s nullglob
  matches=(supabase/migrations/${local_version}_*.sql)
  shopt -u nullglob
  exact_file="supabase/migrations/${local_version}.sql"
  if [ -f "$exact_file" ]; then
    matches+=("$exact_file")
  fi
  if [ "${#matches[@]}" -eq 0 ]; then
    echo "Không tìm thấy file local cho migration pending $local_version" >&2
    exit 1
  fi
  for file in "${matches[@]}"; do
    printf '%s|%s\n' "$file" "$(sha256sum "$file" | awk '{print $1}')" >> "$PENDING_HASH_FILE"
  done
done

echo "[1/4] Đồng bộ các migration đã áp dụng từ remote history..."
# This only fetches migration files/history. It does not run SQL and does not
# repair the remote migration table.
SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" \
  supabase migration fetch --linked

while IFS='|' read -r file expected_hash; do
  [ -n "$file" ] || continue
  if [ ! -f "$file" ]; then
    echo "Migration pending bị mất sau migration fetch: $file" >&2
    exit 1
  fi
  actual_hash="$(sha256sum "$file" | awk '{print $1}')"
  if [ "$actual_hash" != "$expected_hash" ]; then
    echo "Migration pending bị thay đổi sau migration fetch: $file" >&2
    exit 1
  fi
done < "$PENDING_HASH_FILE"

echo "[2/4] Kiểm tra migration history và chặn migration cũ nguy hiểm..."
SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" tools/migration_history_guard.sh

echo "[3/4] Xem trước migration sẽ được áp dụng..."
DRY_RUN_OUTPUT="$(SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" \
  supabase db push --linked --password "$SUPABASE_DB_PASSWORD" --dry-run 2>&1)" || {
  printf '%s\n' "$DRY_RUN_OUTPUT" >&2
  exit 1
}
printf '%s\n' "$DRY_RUN_OUTPUT"

if printf '%s\n' "$DRY_RUN_OUTPUT" | grep -q "Linked project is up to date"; then
  echo "Không có migration cần push."
  exit 0
fi

if [ "${1:-}" != "--yes" ]; then
  printf 'Chỉ tiếp tục khi danh sách trên đúng. Gõ PUSH để xác nhận: '
  IFS= read -r confirm
  if [ "$confirm" != "PUSH" ]; then
    echo "Đã hủy; database không thay đổi."
    exit 0
  fi
fi

echo "[4/4] Push migration..."
SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" \
  supabase db push --linked --password "$SUPABASE_DB_PASSWORD" --yes

echo "Hoàn tất db push."
