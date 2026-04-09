#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
PROFILE_NAME="${1:-}"
if [ -z "$PROFILE_NAME" ]; then
  echo "Usage: ./scripts/capture-api-upstream.sh <profile-name>"
  exit 1
fi

SRC="$ROOT_DIR/customer-worker/.dev.vars"
DST="$ROOT_DIR/project-switch/${PROFILE_NAME}.api.local"
if [ ! -f "$SRC" ]; then
  echo "Missing source vars: $SRC"
  exit 1
fi

mkdir -p "$ROOT_DIR/project-switch"
cp "$SRC" "$DST"
echo "Captured current worker vars -> $DST"
