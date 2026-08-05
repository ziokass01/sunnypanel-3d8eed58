#!/usr/bin/env bash
set -Eeuo pipefail

# Safe deploy for a restored/live SunnyPanel project whose Git repository still
# contains historical migration files absent from remote history.
#
# It NEVER uses --include-all and NEVER repairs remote history. Instead it:
#   1. backs up the local migration directory;
#   2. fetches remote-applied migration files;
#   3. temporarily quarantines only historical local-only files;
#   4. allows only the current production migration allowlist;
#   5. dry-runs and then pushes those migrations;
#   6. restores the original working tree on exit.

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

EXPECTED_VERIFY_SHA256="${EXPECTED_VERIFY_SHA256:-a82e42bc02ae6df3295c8ce349e5179de02ca492937103b99769410376a00254}"
MIN_SAFE_PENDING_VERSION="${MIN_SAFE_PENDING_VERSION:-20260804120000}"
ALLOWED_PENDING_VERSIONS="${ALLOWED_PENDING_VERSIONS:-20260804120000 20260804160000 20260805020000 20260805030000}"
PROJECT_REF="${SUPABASE_PROJECT_REF:-${PROJECT_REF:-}}"

for command_name in supabase python3 sha256sum; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Không tìm thấy $command_name." >&2
    exit 1
  }
done

[ -f tools/migration_list_parser.py ] || {
  echo "Thiếu tools/migration_list_parser.py trong repo root." >&2
  exit 1
}
[ -f supabase/functions/verify-key/index.ts ] || {
  echo "Thiếu verify-key/index.ts." >&2
  exit 1
}

actual_verify_sha="$(sha256sum supabase/functions/verify-key/index.ts | awk '{print $1}')"
if [ "$actual_verify_sha" != "$EXPECTED_VERIFY_SHA256" ]; then
  echo "DỪNG: verify-key khác bản V10.1 đang chạy." >&2
  echo "Expected: $EXPECTED_VERIFY_SHA256" >&2
  echo "Actual:   $actual_verify_sha" >&2
  exit 1
fi

if [ -z "$PROJECT_REF" ]; then
  printf 'Nhập SUPABASE_PROJECT_REF: '
  IFS= read -r PROJECT_REF
fi
[ -n "$PROJECT_REF" ] || {
  echo "SUPABASE_PROJECT_REF đang rỗng." >&2
  exit 1
}

if [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then
  printf 'Nhập Database password của project: '
  IFS= read -rs SUPABASE_DB_PASSWORD
  printf '\n'
  export SUPABASE_DB_PASSWORD
fi

TEMP_ROOT="$(mktemp -d)"
MIGRATION_BACKUP="$TEMP_ROOT/migrations-original"
PENDING_HASH_FILE="$TEMP_ROOT/pending-hashes.txt"
mkdir -p "$MIGRATION_BACKUP"
cp -a supabase/migrations/. "$MIGRATION_BACKUP/"

restore_worktree() {
  local status=$?
  rm -rf supabase/migrations
  mkdir -p supabase/migrations
  cp -a "$MIGRATION_BACKUP/." supabase/migrations/
  rm -rf "$TEMP_ROOT"
  unset SUPABASE_DB_PASSWORD
  exit "$status"
}
trap restore_worktree EXIT INT TERM

is_allowed() {
  local wanted="$1"
  local item
  for item in $ALLOWED_PENDING_VERSIONS; do
    [ "$item" = "$wanted" ] && return 0
  done
  return 1
}

migration_files_for_version() {
  local version="$1"
  local file
  shopt -s nullglob
  local matches=(
    "supabase/migrations/${version}.sql"
    supabase/migrations/${version}_*.sql
  )
  shopt -u nullglob
  for file in "${matches[@]}"; do
    [ -f "$file" ] && printf '%s\n' "$file"
  done
}

SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" \
  supabase link \
    --project-ref "$PROJECT_REF" \
    --password "$SUPABASE_DB_PASSWORD"

LIST_BEFORE="$(SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" \
  supabase migration list --linked --password "$SUPABASE_DB_PASSWORD" 2>&1)" || {
  printf '%s\n' "$LIST_BEFORE" >&2
  exit 1
}

mapfile -t local_before < <(
  printf '%s\n' "$LIST_BEFORE" | python3 tools/migration_list_parser.py local-only
)

# Hash only current production migrations. Historical files will be quarantined
# and are intentionally never executed.
for version in "${local_before[@]}"; do
  if is_allowed "$version"; then
    mapfile -t files < <(migration_files_for_version "$version")
    [ "${#files[@]}" -gt 0 ] || {
      echo "Không tìm thấy file cho migration pending $version" >&2
      exit 1
    }
    for file in "${files[@]}"; do
      printf '%s|%s\n' "$file" "$(sha256sum "$file" | awk '{print $1}')" \
        >> "$PENDING_HASH_FILE"
    done
  fi
done

echo "[1/5] Fetch migration history đã áp dụng từ remote..."
SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" \
  supabase migration fetch --linked

# Verify that fetch did not rewrite any current production migration.
if [ -f "$PENDING_HASH_FILE" ]; then
  while IFS='|' read -r file expected_hash; do
    [ -n "$file" ] || continue
    [ -f "$file" ] || {
      echo "Migration pending bị mất sau migration fetch: $file" >&2
      exit 1
    }
    actual_hash="$(sha256sum "$file" | awk '{print $1}')"
    [ "$actual_hash" = "$expected_hash" ] || {
      echo "Migration pending bị thay đổi sau migration fetch: $file" >&2
      exit 1
    }
  done < "$PENDING_HASH_FILE"
fi

echo "[2/5] Quarantine migration lịch sử local-only; không chạy SQL của chúng..."
LIST_AFTER_FETCH="$(SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" \
  supabase migration list --linked --password "$SUPABASE_DB_PASSWORD" 2>&1)" || {
  printf '%s\n' "$LIST_AFTER_FETCH" >&2
  exit 1
}
mapfile -t remote_only < <(
  printf '%s\n' "$LIST_AFTER_FETCH" | python3 tools/migration_list_parser.py remote-only
)
mapfile -t local_after_fetch < <(
  printf '%s\n' "$LIST_AFTER_FETCH" | python3 tools/migration_list_parser.py local-only
)

if [ "${#remote_only[@]}" -gt 0 ]; then
  echo "Remote vẫn có migration chưa fetch được:" >&2
  printf '  %s\n' "${remote_only[@]}" >&2
  exit 2
fi

QUARANTINE_DIR="$TEMP_ROOT/quarantined-legacy"
mkdir -p "$QUARANTINE_DIR"
for version in "${local_after_fetch[@]}"; do
  if [ "$version" -lt "$MIN_SAFE_PENDING_VERSION" ]; then
    mapfile -t files < <(migration_files_for_version "$version")
    [ "${#files[@]}" -gt 0 ] || {
      echo "Không tìm thấy file lịch sử local-only $version để quarantine." >&2
      exit 1
    }
    for file in "${files[@]}"; do
      mv "$file" "$QUARANTINE_DIR/"
      echo "  quarantined: $file"
    done
  elif ! is_allowed "$version"; then
    echo "DỪNG: migration mới chưa được allowlist: $version" >&2
    exit 4
  fi
done

echo "[3/5] Kiểm tra lịch sử sau quarantine..."
SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" \
  ALLOWED_PENDING_VERSIONS="$ALLOWED_PENDING_VERSIONS" \
  MIN_SAFE_PENDING_VERSION="$MIN_SAFE_PENDING_VERSION" \
  tools/migration_history_guard.sh

echo "[4/5] Dry-run đúng các migration production..."
DRY_RUN_OUTPUT="$(SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" \
  supabase db push \
    --linked \
    --password "$SUPABASE_DB_PASSWORD" \
    --dry-run 2>&1)" || {
  printf '%s\n' "$DRY_RUN_OUTPUT" >&2
  exit 1
}
printf '%s\n' "$DRY_RUN_OUTPUT"

if printf '%s\n' "$DRY_RUN_OUTPUT" | grep -q \
  "Found local migration files to be inserted before"; then
  echo "DỪNG: dry-run vẫn phát hiện migration lịch sử cũ." >&2
  exit 1
fi

if printf '%s\n' "$DRY_RUN_OUTPUT" | grep -q "Linked project is up to date"; then
  echo "Không có migration cần push."
  exit 0
fi

if [ "${1:-}" != "--yes" ]; then
  printf 'Gõ PUSH để áp dụng đúng danh sách dry-run ở trên: '
  IFS= read -r confirm
  [ "$confirm" = "PUSH" ] || {
    echo "Đã hủy; database không thay đổi."
    exit 0
  }
fi

echo "[5/5] Push migration; tuyệt đối không dùng --include-all..."
SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" \
  supabase db push \
    --linked \
    --password "$SUPABASE_DB_PASSWORD" \
    --yes

echo "Hoàn tất db push an toàn. Local migrations sẽ được restore bởi trap."
