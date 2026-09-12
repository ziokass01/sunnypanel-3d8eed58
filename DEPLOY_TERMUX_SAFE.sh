#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

: "${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF first}"

python3 tools/validate_release_static.py

if [ -n "${SUNNY_CLIENT_ROOT:-}" ]; then
  python3 tools/validate_menu_server_contract.py "$SUNNY_CLIENT_ROOT"
else
  echo "INFO: SUNNY_CLIENT_ROOT is not set; static server guard passed, client-source comparison skipped."
fi

if [ "${RUN_DB_PUSH:-0}" != "1" ]; then
  echo "STOP: migrations were not run. Re-run with RUN_DB_PUSH=1 after taking a database backup."
  echo "Example: RUN_DB_PUSH=1 SUPABASE_PROJECT_REF=... SUPABASE_DB_PASSWORD=... bash DEPLOY_TERMUX_SAFE.sh"
  exit 2
fi

: "${SUPABASE_DB_PASSWORD:?Set SUPABASE_DB_PASSWORD for migration deployment}"
supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"
yes | supabase db push --include-all

functions=(
  verify-key
  reset-key
  free-start
  free-admin-test
  admin-free-test
  fake-lag-auth
  fake-lag-check
  admin-free-block
  server-app-runtime-ops
)

for fn in "${functions[@]}"; do
  echo "Deploying $fn"
  supabase functions deploy "$fn" --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt
done

echo "PASS: database migrations and Edge Functions deployed."
echo "Next: deploy customer-worker, then run: python3 tools/check_released_menu_v10_1.py"
