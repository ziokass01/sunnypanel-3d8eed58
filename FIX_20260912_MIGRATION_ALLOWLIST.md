# Fix GitHub Actions migration allowlist - 2026-09-12

Added these release migrations to the production-safe allowlist:

- 20260912100000_session_high_water_repair.sql
- 20260912101000_panel_license_lifecycle.sql
- 20260912102000_started_license_expiry_cap.sql
- 20260912103000_penalty_reset_clears_bindings.sql

Updated:
- .github/workflows/supabase-functions.yml
- .github/workflows/supabase-deploy.yml
- tools/db_push_password_auth.sh
- tools/migration_history_guard.sh

No migration SQL was modified.
