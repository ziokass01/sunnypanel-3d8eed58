#!/usr/bin/env sh
set -eu
ROOT="${1:-.}"
echo "Build/security references:"
grep -RIn --exclude-dir=.git -E 'sunny-v34-ac-20260721|ECDSA-P256-SHA256-V3|VERIFY_REQUIRE_GATEWAY|issue_sunny_v34_lease' "$ROOT" || true
echo "Legacy library strings (inventory only):"
grep -RIn --exclude-dir=.git -E 'libcurl 7\.51|OpenSSL 1\.1\.0c|curl-7\.51' "$ROOT" || true
