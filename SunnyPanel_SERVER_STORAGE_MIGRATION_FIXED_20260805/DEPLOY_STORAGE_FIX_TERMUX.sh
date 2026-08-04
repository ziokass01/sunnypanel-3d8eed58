#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${1:-$HOME/sunnypanel-3d8eed58}"
cd "$ROOT"

if [ -z "${SUPABASE_PROJECT_REF:-}" ]; then
  printf 'SUPABASE_PROJECT_REF: '
  IFS= read -r SUPABASE_PROJECT_REF
  export SUPABASE_PROJECT_REF
fi

if [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then
  printf 'Database password: '
  IFS= read -rs SUPABASE_DB_PASSWORD
  printf '\n'
  export SUPABASE_DB_PASSWORD
fi

python3 tools/validate_release_static.py
bash -n tools/db_push_password_auth.sh

# This command now fetches remote migration history before dry-run/push.
tools/db_push_password_auth.sh

cat <<'EOF'
Database migrations completed.
Next deploy customer-worker so Rent routes are blocked at the gateway too.
EOF
