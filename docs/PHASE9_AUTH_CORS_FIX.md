# PHASE9 auth/cors fix

Updated files:
- supabase/functions/_shared/admin.ts
- supabase/functions/_shared/cors.ts

What changed:
- allow x-admin-key header
- allow app.mityangho.id.vn and wildcard *.mityangho.id.vn in CORS
- assertAdmin now accepts direct admin keys from Authorization, apikey, or x-admin-key
- supports dedicated RUNTIME_OPS_ADMIN_KEY secret before falling back to service role or admin JWT

Required secrets after patch:
- RUNTIME_OPS_ADMIN_KEY
- PUBLIC_BASE_URL=https://app.mityangho.id.vn
- ALLOWED_ORIGINS=https://app.mityangho.id.vn,https://admin.mityangho.id.vn,https://mityangho.id.vn
