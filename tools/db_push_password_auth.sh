#!/usr/bin/env bash
set -Eeuo pipefail

# Production-safe migration deploy for a restored/live Supabase project.
#
# The repository contains historical SQL files whose timestamps do not all
# exist in the restored project's migration history. Running `db push
# --include-all` would execute those old files again. To avoid that, this
# script builds a temporary deployment view from:
#   1. the exact migration history fetched from the linked remote project; and
#   2. only the explicitly allowlisted new migrations from this repository.
#
# The original supabase/migrations directory is restored on every exit path.
# It never uses migration repair, --include-all, or db reset.

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

EXPECTED_VERIFY_SHA256="${EXPECTED_VERIFY_SHA256:-a82e42bc02ae6df3295c8ce349e5179de02ca492937103b99769410376a00254}"
MIN_SAFE_PENDING_VERSION="${MIN_SAFE_PENDING_VERSION:-20260804120000}"
ALLOWED_PENDING_VERSIONS="${ALLOWED_PENDING_VERSIONS:-20260804120000 20260804160000 20260805020000 20260805030000 20260805210000 20260806123000 20260808073000 20260809093000}"
PROJECT_REF="${SUPABASE_PROJECT_REF:-${PROJECT_REF:-}}"

for command_name in supabase python3 sha256sum awk grep find sort mktemp; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Không tìm thấy $command_name." >&2
    exit 1
  }
done

[ -f tools/migration_list_parser.py ] || {
  echo "Thiếu tools/migration_list_parser.py trong repo root." >&2
  exit 1
}
[ -f tools/migration_history_guard.sh ] || {
  echo "Thiếu tools/migration_history_guard.sh trong repo root." >&2
  exit 1
}
[ -f supabase/functions/verify-key/index.ts ] || {
  echo "Thiếu verify-key/index.ts." >&2
  exit 1
}
[ -d supabase/migrations ] || {
  echo "Thiếu thư mục supabase/migrations." >&2
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
ORIGINAL_MIGRATIONS="$TEMP_ROOT/migrations-original"
mkdir -p "$ORIGINAL_MIGRATIONS"
cp -a supabase/migrations/. "$ORIGINAL_MIGRATIONS/"

restore_worktree() {
  local status=$?
  rm -rf supabase/migrations
  mkdir -p supabase/migrations
  cp -a "$ORIGINAL_MIGRATIONS/." supabase/migrations/
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

migration_version_from_name() {
  local base="$1"
  base="${base##*/}"
  if [[ "$base" =~ ^([0-9]{8,14})(_|\.sql$) ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
    return 0
  fi
  return 1
}

original_files_for_version() {
  local version="$1"
  find "$ORIGINAL_MIGRATIONS" -maxdepth 1 -type f \
    \( -name "${version}.sql" -o -name "${version}_*.sql" \) \
    -print | sort
}

remote_has_version() {
  local wanted="$1"
  local file version
  while IFS= read -r -d '' file; do
    version="$(migration_version_from_name "$file" || true)"
    [ "$version" = "$wanted" ] && return 0
  done < <(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -print0)
  return 1
}

SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" \
  supabase link \
    --project-ref "$PROJECT_REF" \
    --password "$SUPABASE_DB_PASSWORD"

echo "[1/6] Tạo checkout migration sạch từ đúng remote history..."
rm -rf supabase/migrations
mkdir -p supabase/migrations
# Feeding 'y' keeps this non-interactive across CLI versions that may still ask
# for overwrite confirmation. The directory is empty, so no repository file can
# be overwritten here.
printf 'y\n' | SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" \
  supabase migration fetch --linked

remote_file_count="$(find supabase/migrations -maxdepth 1 -type f -name '*.sql' | wc -l | tr -d ' ')"
[ "$remote_file_count" -gt 0 ] || {
  echo "DỪNG: migration fetch không tạo được remote snapshot." >&2
  exit 2
}
echo "  Đã fetch $remote_file_count migration remote vào checkout tạm."

echo "[2/6] Ghép chỉ các migration production được allowlist..."
for version in $ALLOWED_PENDING_VERSIONS; do
  if remote_has_version "$version"; then
    echo "  đã có trên remote: $version"
    continue
  fi

  mapfile -t matches < <(original_files_for_version "$version")
  if [ "${#matches[@]}" -eq 0 ]; then
    # An allowlisted migration may already have been retired from this release;
    # absence is only acceptable when it is not present as a pending local file.
    echo "  không có file local: $version"
    continue
  fi
  if [ "${#matches[@]}" -ne 1 ]; then
    echo "DỪNG: version $version có ${#matches[@]} file local; cần đúng 1 file." >&2
    printf '  %s\n' "${matches[@]}" >&2
    exit 3
  fi

  cp -a "${matches[0]}" supabase/migrations/
  echo "  thêm pending: $(basename "${matches[0]}")"
done

# Reject any new production migration at/after the safety floor that is not in
# the allowlist. Historical files below the floor remain in the original repo
# but are intentionally absent from this temporary deployment checkout.
while IFS= read -r -d '' file; do
  version="$(migration_version_from_name "$file" || true)"
  [ -n "$version" ] || continue
  if [ "$version" -ge "$MIN_SAFE_PENDING_VERSION" ] && ! is_allowed "$version"; then
    echo "DỪNG: migration mới chưa được allowlist: $(basename "$file")" >&2
    exit 4
  fi
done < <(find "$ORIGINAL_MIGRATIONS" -maxdepth 1 -type f -name '*.sql' -print0)

echo "[3/6] Kiểm tra remote/local trên checkout sạch..."
SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" \
  ALLOWED_PENDING_VERSIONS="$ALLOWED_PENDING_VERSIONS" \
  MIN_SAFE_PENDING_VERSION="$MIN_SAFE_PENDING_VERSION" \
  tools/migration_history_guard.sh

echo "[4/6] Dry-run đúng các migration production..."
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
  echo "DỪNG: checkout sạch vẫn chứa migration lịch sử cũ." >&2
  exit 5
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

echo "[5/6] Push migration; không dùng --include-all..."
SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" \
  supabase db push \
    --linked \
    --password "$SUPABASE_DB_PASSWORD" \
    --yes

echo "[6/6] Xác nhận không còn migration allowlist pending..."
FINAL_LIST="$(SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" \
  supabase migration list --linked --password "$SUPABASE_DB_PASSWORD" 2>&1)" || {
  printf '%s\n' "$FINAL_LIST" >&2
  exit 1
}
printf '%s\n' "$FINAL_LIST"
mapfile -t final_local_only < <(
  printf '%s\n' "$FINAL_LIST" | python3 tools/migration_list_parser.py local-only
)
if [ "${#final_local_only[@]}" -gt 0 ]; then
  echo "DỪNG: sau db push vẫn còn migration pending:" >&2
  printf '  %s\n' "${final_local_only[@]}" >&2
  exit 6
fi

echo "Hoàn tất db push an toàn. Thư mục migration gốc sẽ được restore bởi trap."
