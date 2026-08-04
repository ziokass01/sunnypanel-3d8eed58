#!/usr/bin/env bash
set -Eeuo pipefail

if ! command -v supabase >/dev/null 2>&1; then
  echo "Không tìm thấy Supabase CLI." >&2
  exit 1
fi

PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
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

echo "[1/3] Link project bằng Database password..."
SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" \
  supabase link \
    --project-ref "$PROJECT_REF" \
    --password "$SUPABASE_DB_PASSWORD"

echo "[2/3] Xem trước migration sẽ được áp dụng..."
SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" \
  supabase db push \
    --linked \
    --password "$SUPABASE_DB_PASSWORD" \
    --dry-run

echo "[3/3] Push migration..."
SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" \
  supabase db push \
    --linked \
    --password "$SUPABASE_DB_PASSWORD" \
    --yes

echo "Hoàn tất db push."
