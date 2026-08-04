#!/usr/bin/env bash
set -euo pipefail

# Check Virbox Protector CLI in Codespace/Linux.
# This script does not contain any license/key.

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
VIRBOX_DIR="$REPO_ROOT/virbox"

CANDIDATES=(
  "${VIRBOX_BIN:-}"
  "/usr/share/virboxprotector/bin/virboxprotector_con"
  "/usr/local/virboxprotector/bin/virboxprotector_con"
  "$HOME/virboxprotector/bin/virboxprotector_con"
  "$VIRBOX_DIR/virboxprotector_con"
  "$VIRBOX_DIR/bin/virboxprotector_con"
)

FOUND=""
for p in "${CANDIDATES[@]}"; do
  if [ -n "$p" ] && [ -x "$p" ]; then
    FOUND="$p"
    break
  fi
done

if [ -z "$FOUND" ] && command -v virboxprotector_con >/dev/null 2>&1; then
  FOUND="$(command -v virboxprotector_con)"
fi

if [ -z "$FOUND" ]; then
  echo "[MISS] Chưa thấy Virbox CLI: virboxprotector_con"
  echo
  echo "Repo hiện tại: $REPO_ROOT"
  echo "Thư mục Virbox: $VIRBOX_DIR"
  echo
  echo "Bạn cần tải bộ cài Virbox Protector Linux từ tài khoản/trang Virbox chính thức, rồi upload file cài vào Codespace."
  echo "File cài thường có dạng: VirboxProtector*.run"
  echo
  echo "Sau khi upload file .run vào thư mục virbox/, chạy:"
  echo
  echo "  cd $VIRBOX_DIR"
  echo "  ls -lh"
  echo "  chmod +x ./VirboxProtector*.run"
  echo "  sudo ./VirboxProtector*.run"
  echo
  echo "Cài xong kiểm tra lại từ repo root:"
  echo "  cd $REPO_ROOT"
  echo "  bash virbox/check_virbox.sh"
  echo
  echo "Nếu bạn giải nén Virbox chứ không cài bằng .run, hãy set biến VIRBOX_BIN, ví dụ:"
  echo "  export VIRBOX_BIN=/duong/dan/toi/virboxprotector_con"
  echo "  bash virbox/check_virbox.sh"
  echo
  exit 1
fi

echo "[OK] Tìm thấy Virbox CLI: $FOUND"
"$FOUND" --help=apk || "$FOUND" --help || true
