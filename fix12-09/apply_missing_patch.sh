#!/usr/bin/env bash
set -euo pipefail

# Cách chạy:
#   bash apply_missing_patch.sh /duong/dan/toi/repo
# Hoặc đứng trong thư mục gốc repo rồi chạy:
#   bash /duong/dan/toi/apply_missing_patch.sh .

PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="${1:-$PWD}"

if [ ! -f "$REPO_DIR/package.json" ] || [ ! -d "$REPO_DIR/src/pages" ]; then
  echo "Sai thư mục repo: $REPO_DIR"
  echo "Hãy truyền đường dẫn thư mục gốc repo sunnypanel-3d8eed58."
  exit 1
fi

cp "$REPO_DIR/src/pages/ResetKey.tsx" "$REPO_DIR/src/pages/ResetKey.tsx.bak.$(date +%s)"
cp "$REPO_DIR/src/pages/AdminFakeLagAudit.tsx" "$REPO_DIR/src/pages/AdminFakeLagAudit.tsx.bak.$(date +%s)"

cp "$PATCH_DIR/src/pages/ResetKey.tsx" "$REPO_DIR/src/pages/ResetKey.tsx"
cp "$PATCH_DIR/src/pages/AdminFakeLagAudit.tsx" "$REPO_DIR/src/pages/AdminFakeLagAudit.tsx"

git -C "$REPO_DIR" apply "$PATCH_DIR/AdminFakeLagLicenses.filter-free-issued.patch"

echo "Done. Chạy tiếp: npm run build"
