-- Fake Lag public Reset Key hotfix.
-- Scope: Fake Lag only. Does not touch Free Fire, Find Dumps, runtime session, or credit logic.
-- Purpose: public /reset-key must recognize FAKELAG-XXXX-XXXX-XXXX keys in public check/reset.
--
-- Safety rules:
--   1. Only rows with app_code='fake-lag' or key prefix FAKELAG are changed.
--   2. No session/auth/runtime tables are touched.
--   3. No credit/wallet tables are touched.
--   4. Existing blocked/deleted/expired keys stay blocked/deleted/expired.

begin;

alter table public.licenses
  add column if not exists app_code text default 'free-fire',
  add column if not exists max_verify integer,
  add column if not exists verify_count integer not null default 0,
  add column if not exists public_reset_disabled boolean not null default false,
  add column if not exists public_reset_count integer not null default 0,
  add column if not exists deleted_at timestamptz;

-- Public reset for Fake Lag is a verify/use counter reset, not a wallet/session operation.
update public.license_access_rules
set allow_reset = true,
    public_enabled = true,
    notes = concat_ws(E'\n', nullif(notes, ''), '2026-04-25: Public Reset Key nhận FAKELAG; reset chỉ xóa verify_count/device binding, không đụng session/credit.')
where app_code = 'fake-lag';

-- Heal existing Fake Lag keys so the public reset page can check/reset them.
update public.licenses
set app_code = 'fake-lag',
    public_reset_disabled = false,
    max_verify = greatest(1, coalesce(max_verify, (select max_verify_per_key from public.license_access_rules where app_code = 'fake-lag'), 1)),
    verify_count = greatest(0, coalesce(verify_count, 0))
where upper(key) like 'FAKELAG-%'
   or lower(coalesce(app_code, '')) = 'fake-lag';

commit;
