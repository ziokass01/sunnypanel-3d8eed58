-- Final small hotfix for the two remaining public/free-flow issues.
-- Scope:
--   1) Fake Lag public reset/check must always recognize FAKELAG-* keys.
--   2) Admin Test GetKey for Find Dumps must use server_app_redeem_keys, not public.licenses.
-- Safety:
--   - No session runtime/auth logic.
--   - No wallet/credit consumption logic.
--   - No Free Fire key behavior changed except compatibility columns on free-flow log tables.

begin;

-- Fake Lag public reset compatibility columns and self-heal.
alter table public.licenses
  add column if not exists app_code text default 'free-fire',
  add column if not exists max_verify integer,
  add column if not exists verify_count integer not null default 0,
  add column if not exists public_reset_disabled boolean not null default false,
  add column if not exists public_reset_count integer not null default 0,
  add column if not exists deleted_at timestamptz,
  add column if not exists start_on_first_use boolean default false,
  add column if not exists starts_on_first_use boolean default false,
  add column if not exists first_used_at timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists duration_seconds integer,
  add column if not exists duration_days integer;

insert into public.license_access_rules (
  app_code, key_prefix, default_duration_seconds, max_devices_per_key, max_ips_per_key,
  max_verify_per_key, public_enabled, allow_reset, notes
)
values (
  'fake-lag', 'FAKELAG', 86400, 1, 1, 1, true, true,
  '2026-04-25 final: public reset accepts FAKELAG and only clears verify/device binding.'
)
on conflict (app_code) do update set
  key_prefix = 'FAKELAG',
  public_enabled = true,
  allow_reset = true,
  max_verify_per_key = greatest(1, coalesce(public.license_access_rules.max_verify_per_key, excluded.max_verify_per_key)),
  updated_at = now(),
  notes = concat_ws(E'\n', nullif(public.license_access_rules.notes, ''), excluded.notes);

update public.licenses
set app_code = 'fake-lag',
    public_reset_disabled = false,
    max_verify = greatest(1, coalesce(max_verify, (select max_verify_per_key from public.license_access_rules where app_code = 'fake-lag'), 1)),
    verify_count = greatest(0, coalesce(verify_count, 0))
where upper(key) like 'FAKELAG-%'
   or lower(coalesce(app_code, '')) = 'fake-lag';

-- Find Dumps admin test/free-flow compatibility: these are server-app redeem keys, not legacy licenses.
alter table public.licenses_free_issues
  alter column license_id drop not null;

alter table public.licenses_free_issues
  add column if not exists app_code text not null default 'free-fire',
  add column if not exists key_signature text,
  add column if not exists server_redeem_key_id uuid references public.server_app_redeem_keys(id) on delete set null,
  add column if not exists ua_hash text not null default '';

alter table public.licenses_free_sessions
  add column if not exists app_code text not null default 'free-fire',
  add column if not exists package_code text,
  add column if not exists credit_code text,
  add column if not exists wallet_kind text,
  add column if not exists issued_server_redeem_key_id uuid references public.server_app_redeem_keys(id) on delete set null,
  add column if not exists issued_server_reward_mode text,
  add column if not exists selection_meta jsonb not null default '{}'::jsonb,
  add column if not exists trace_id text;

update public.licenses_free_sessions
set trace_id = substring(replace(gen_random_uuid()::text, '-', '') from 1 for 24)
where coalesce(trace_id, '') = '';

alter table public.server_app_redeem_keys
  add column if not exists entitlement_seconds bigint not null default 0,
  add column if not exists trace_id text,
  add column if not exists source_free_session_id uuid references public.licenses_free_sessions(session_id) on delete set null;

create index if not exists idx_lfi_admin_test_server_redeem_key_id on public.licenses_free_issues(server_redeem_key_id);
create index if not exists idx_lfs_admin_test_issued_server_redeem_key_id on public.licenses_free_sessions(issued_server_redeem_key_id);
create index if not exists idx_sark_admin_test_source_free_session_id on public.server_app_redeem_keys(source_free_session_id);

commit;
