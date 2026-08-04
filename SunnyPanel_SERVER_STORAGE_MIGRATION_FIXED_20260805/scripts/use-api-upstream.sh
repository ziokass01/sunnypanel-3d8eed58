#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
PROFILE_NAME="${1:-}"
if [ -z "$PROFILE_NAME" ]; then
  echo "Usage: ./scripts/use-api-upstream.sh <profile-name>"
  exit 1
fi

PROFILE_PATH="$ROOT_DIR/project-switch/${PROFILE_NAME}.api.local"
if [ ! -f "$PROFILE_PATH" ]; then
  echo "Missing profile: $PROFILE_PATH"
  exit 1
fi

set -a
. "$PROFILE_PATH"
set +a

mkdir -p "$ROOT_DIR/customer-worker"
cat > "$ROOT_DIR/customer-worker/.dev.vars" <<EOF
PUBLIC_API_BASE_URL=${PUBLIC_API_BASE_URL:-https://mityangho.id.vn/api}
ACTIVE_SUPABASE_URL=${ACTIVE_SUPABASE_URL:-}
ACTIVE_FUNCTIONS_BASE_URL=${ACTIVE_FUNCTIONS_BASE_URL:-}
UPSTREAM_ANON_KEY=${UPSTREAM_ANON_KEY:-}
ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-*}
ALLOWED_FUNCTIONS=${ALLOWED_FUNCTIONS:-}
EOF

echo "Applied API upstream profile: $PROFILE_NAME"
