#!/usr/bin/env bash
set -euo pipefail

# Check Virbox Protector CLI in Codespace/Linux.
# This script does not contain any license/key.

CANDIDATES=(
  "${VIRBOX_BIN:-}"
  "/usr/share/virboxprotector/bin/virboxprotector_con"
  "/usr/local/virboxprotector/bin/virboxprotector_con"
  "$HOME/virboxprotector/bin/virboxprotector_con"
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
  echo "Bạn cần tải bộ cài Virbox Protector Linux từ tài khoản/trang Virbox chính thức, rồi upload file cài vào Codespace."
  echo "Sau khi upload, cài thử theo mẫu:"
  echo
  echo "  cd ~/sunnypanel-3d8eed58/virbox"
  echo "  chmod +x ./VirboxProtector*.run"
  echo "  sudo ./VirboxProtector*.run"
  echo
  echo "Cài xong kiểm tra lại:"
  echo "  bash virbox/check_virbox.sh"
  echo
  exit 1
fi

echo "[OK] Tìm thấy Virbox CLI: $FOUND"
"$FOUND" --help=apk || "$FOUND" --help || true
