Patch: Supabase Edge Functions deploy via Management API (--use-api)
Reason: avoid Docker/public.ecr.aws edge-runtime pull rate-limit failures in GitHub Actions.
Changed files:
- .github/workflows/supabase-functions.yml
- .github/workflows/supabase-deploy.yml

Both no-verify-jwt and default verify_jwt deploy commands now include --use-api.
Supabase CLI remains pinned to 2.111.0.
