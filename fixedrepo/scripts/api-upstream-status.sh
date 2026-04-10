#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
VARS_FILE="$ROOT_DIR/customer-worker/.dev.vars"
if [ ! -f "$VARS_FILE" ]; then
  echo "Missing $VARS_FILE"
  exit 1
fi

echo "== customer-worker/.dev.vars =="
cat "$VARS_FILE"
