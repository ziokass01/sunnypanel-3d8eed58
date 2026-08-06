#!/usr/bin/env bash
set -Eeuo pipefail

# Production-safe gate. Historical local-only migrations are quarantined by
# db_push_password_auth.sh before this script runs. Only the explicitly allowed
# production migrations may remain pending.
MIN_SAFE_PENDING_VERSION="${MIN_SAFE_PENDING_VERSION:-20260804120000}"
ALLOWED_PENDING_VERSIONS="${ALLOWED_PENDING_VERSIONS:-20260804120000 20260804160000 20260805020000 20260805030000 20260805210000 20260806123000}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

for command_name in supabase python3; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "::error::Không tìm thấy $command_name." >&2
    exit 1
  }
done

[ -f tools/migration_list_parser.py ] || {
  echo "::error::Thiếu tools/migration_list_parser.py trong repo root." >&2
  exit 1
}
[ -n "${SUPABASE_DB_PASSWORD:-}" ] || {
  echo "::error::Thiếu SUPABASE_DB_PASSWORD." >&2
  exit 1
}

is_allowed() {
  local wanted="$1"
  local item
  for item in $ALLOWED_PENDING_VERSIONS; do
    [ "$item" = "$wanted" ] && return 0
  done
  return 1
}

LIST_OUTPUT="$(SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" \
  supabase migration list --linked --password "$SUPABASE_DB_PASSWORD" 2>&1)" || {
  printf '%s\n' "$LIST_OUTPUT" >&2
  echo "::error::Không đọc được migration history." >&2
  exit 1
}
printf '%s\n' "$LIST_OUTPUT"

mapfile -t remote_only < <(
  printf '%s\n' "$LIST_OUTPUT" | python3 tools/migration_list_parser.py remote-only
)
mapfile -t local_only < <(
  printf '%s\n' "$LIST_OUTPUT" | python3 tools/migration_list_parser.py local-only
)

if [ "${#remote_only[@]}" -gt 0 ]; then
  echo "::error::Remote còn migration chưa có trong checkout tạm:" >&2
  printf '  %s\n' "${remote_only[@]}" >&2
  exit 2
fi

for version in "${local_only[@]}"; do
  if [ "$version" -lt "$MIN_SAFE_PENDING_VERSION" ]; then
    echo "::error::Migration lịch sử cũ vẫn còn pending sau bước quarantine: $version" >&2
    exit 3
  fi
  if ! is_allowed "$version"; then
    echo "::error::Migration pending chưa được allowlist cho production: $version" >&2
    exit 4
  fi
done

if [ "${#local_only[@]}" -eq 0 ]; then
  echo "Migration history đã đồng bộ; không có migration pending."
  exit 0
fi

echo "Migration pending hợp lệ và được phép deploy:"
printf '  %s\n' "${local_only[@]}"
