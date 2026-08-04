#!/usr/bin/env bash
set -Eeuo pipefail

# Production-safe migration history gate.
# It never repairs remote history and never runs --include-all.
MIN_SAFE_PENDING_VERSION="${MIN_SAFE_PENDING_VERSION:-20260804120000}"

if ! command -v supabase >/dev/null 2>&1; then
  echo "::error::Không tìm thấy Supabase CLI." >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "::error::Không tìm thấy Python 3." >&2
  exit 1
fi
if [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then
  echo "::error::Thiếu SUPABASE_DB_PASSWORD." >&2
  exit 1
fi

LIST_OUTPUT="$(SUPABASE_DB_PASSWORD="$SUPABASE_DB_PASSWORD" \
  supabase migration list --linked --password "$SUPABASE_DB_PASSWORD" 2>&1)" || {
  printf '%s\n' "$LIST_OUTPUT" >&2
  echo "::error::Không đọc được migration history." >&2
  exit 1
}
printf '%s\n' "$LIST_OUTPUT"

mapfile -t remote_only < <(printf '%s\n' "$LIST_OUTPUT" | python3 tools/migration_list_parser.py remote-only)
mapfile -t local_only < <(printf '%s\n' "$LIST_OUTPUT" | python3 tools/migration_list_parser.py local-only)

if [ "${#remote_only[@]}" -gt 0 ]; then
  echo "::error::Remote có migration chưa tồn tại trong checkout hiện tại:" >&2
  printf '  %s\n' "${remote_only[@]}" >&2
  echo "::error::Phải chạy migration fetch trước khi db push." >&2
  exit 2
fi

unsafe_local=()
for version in "${local_only[@]}"; do
  if [ "$version" -lt "$MIN_SAFE_PENDING_VERSION" ]; then
    unsafe_local+=("$version")
  fi
done

if [ "${#unsafe_local[@]}" -gt 0 ]; then
  echo "::error::Có migration local cũ nhưng remote chưa ghi nhận. Không được tự động db push:" >&2
  printf '  %s\n' "${unsafe_local[@]}" >&2
  echo "::error::Không dùng migration repair hoặc --include-all khi chưa đối chiếu schema." >&2
  exit 3
fi

if [ "${#local_only[@]}" -eq 0 ]; then
  echo "Migration history đã đồng bộ; không có migration pending."
  exit 0
fi

echo "Migration pending đã qua cổng an toàn:"
printf '  %s\n' "${local_only[@]}"
