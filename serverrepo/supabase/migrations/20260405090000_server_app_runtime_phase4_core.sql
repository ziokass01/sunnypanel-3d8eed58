-- Phase 4 core runtime schema for SunnyMod / Server app branch.
-- Additive-only migration.
-- IMPORTANT: do not edit older phase 1-3 migrations that already ran in production.

create table if not exists public.server_app_redeem_keys (
  id uuid primary key default gen_random_uuid(),
  app_code text not null references public.server_apps(code) on delete cascade,
  reward_package_id uuid null references public.server_app_reward_packages(id) on delete set null,
  redeem_key text not null,
  title text,
  description text,
  enabled boolean not null default true,
  starts_at timestamptz null,
  expires_at timestamptz null,
  max_redemptions integer not null default 1,
  redeemed_count integer not null default 0,
  reward_mode text not null default 'package',
  plan_code text null,
  soft_credit_amount numeric(12,2) not null default 0,
  premium_credit_amount numeric(12,2) not null default 0,
  entitlement_days integer not null default 0,
  device_limit_override integer null,
  account_limit_override integer null,
  last_redeemed_at timestamptz null,
  blocked_at timestamptz null,
  blocked_reason text null,
  metadata jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint server_app_redeem_keys_app_code_redeem_key_key unique(app_code, redeem_key),
  constraint server_app_redeem_keys_max_redemptions_check check (max_redemptions >= 1),
  constraint server_app_redeem_keys_redeemed_count_check check (redeemed_count >= 0),
  constraint server_app_redeem_keys_reward_mode_check check (reward_mode in ('package', 'plan', 'soft_credit', 'premium_credit', 'mixed')),
  constraint server_app_redeem_keys_amounts_check check (soft_credit_amount >= 0 and premium_credit_amount >= 0),
  constraint server_app_redeem_keys_days_check check (entitlement_days >= 0)
);

create table if not exists public.server_app_entitlements (
  id uuid primary key default gen_random_uuid(),
  app_code text not null references public.server_apps(code) on delete cascade,
  account_ref text not null,
  device_id text null,
  plan_code text not null,
  source_type text not null default 'redeem_key',
  source_redeem_key_id uuid null references public.server_app_redeem_keys(id) on delete set null,
  source_reward_package_id uuid null references public.server_app_reward_packages(id) on delete set null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz null,
  revoked_at timestamptz null,
  revoke_reason text null,
  device_limit integer null,
  account_limit integer null,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint server_app_entitlements_source_type_check check (source_type in ('redeem_key', 'reward_package', 'admin_grant', 'manual_adjust')),
  constraint server_app_entitlements_status_check check (status in ('active', 'expired', 'revoked')),
  constraint server_app_entitlements_limit_check check (
    (device_limit is null or device_limit >= 1)
    and (account_limit is null or account_limit >= 1)
  )
);

create table if not exists public.server_app_wallet_balances (
  id uuid primary key default gen_random_uuid(),
  app_code text not null references public.server_apps(code) on delete cascade,
  account_ref text not null,
  device_id text null,
  soft_balance numeric(12,2) not null default 0,
  premium_balance numeric(12,2) not null default 0,
  last_soft_reset_at timestamptz null,
  last_premium_reset_at timestamptz null,
  updated_by_source text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint server_app_wallet_balances_amounts_check check (soft_balance >= 0 and premium_balance >= 0),
  constraint server_app_wallet_balances_identity_key unique(app_code, account_ref)
);

create table if not exists public.server_app_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  app_code text not null references public.server_apps(code) on delete cascade,
  wallet_balance_id uuid null references public.server_app_wallet_balances(id) on delete set null,
  entitlement_id uuid null references public.server_app_entitlements(id) on delete set null,
  redeem_key_id uuid null references public.server_app_redeem_keys(id) on delete set null,
  reward_package_id uuid null references public.server_app_reward_packages(id) on delete set null,
  account_ref text not null,
  device_id text null,
  feature_code text null,
  transaction_type text not null,
  wallet_kind text not null default 'mixed',
  soft_delta numeric(12,2) not null default 0,
  premium_delta numeric(12,2) not null default 0,
  soft_balance_after numeric(12,2) null,
  premium_balance_after numeric(12,2) null,
  note text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint server_app_wallet_transactions_type_check check (
    transaction_type in ('redeem', 'refill', 'consume', 'admin_adjust', 'revoke', 'reset')
  ),
  constraint server_app_wallet_transactions_kind_check check (
    wallet_kind in ('soft', 'premium', 'mixed', 'none')
  )
);

create table if not exists public.server_app_sessions (
  id uuid primary key default gen_random_uuid(),
  app_code text not null references public.server_apps(code) on delete cascade,
  account_ref text not null,
  device_id text not null,
  entitlement_id uuid null references public.server_app_entitlements(id) on delete set null,
  redeem_key_id uuid null references public.server_app_redeem_keys(id) on delete set null,
  session_token_hash text not null,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz null,
  revoked_at timestamptz null,
  revoke_reason text null,
  client_version text null,
  ip_hash text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint server_app_sessions_status_check check (status in ('active', 'expired', 'revoked', 'logged_out')),
  constraint server_app_sessions_token_key unique(session_token_hash)
);

create unique index if not exists server_app_sessions_one_active_per_device_idx
on public.server_app_sessions(app_code, account_ref, device_id)
where status = 'active';

create index if not exists server_app_redeem_keys_app_code_enabled_idx
on public.server_app_redeem_keys(app_code, enabled, expires_at);

create index if not exists server_app_entitlements_lookup_idx
on public.server_app_entitlements(app_code, account_ref, status, expires_at);

create index if not exists server_app_wallet_transactions_lookup_idx
on public.server_app_wallet_transactions(app_code, account_ref, created_at desc);

create index if not exists server_app_wallet_transactions_feature_idx
on public.server_app_wallet_transactions(app_code, feature_code, created_at desc)
where feature_code is not null;

create index if not exists server_app_sessions_lookup_idx
on public.server_app_sessions(app_code, account_ref, device_id, status, last_seen_at desc);

create or replace function public.server_app_plan_rank(plan_code text)
returns integer
language sql
immutable
as $$
  select case lower(coalesce(plan_code, 'classic'))
    when 'classic' then 10
    when 'go' then 20
    when 'plus' then 30
    when 'pro' then 40
    else 0
  end
$$;

alter table public.server_app_redeem_keys enable row level security;
alter table public.server_app_entitlements enable row level security;
alter table public.server_app_wallet_balances enable row level security;
alter table public.server_app_wallet_transactions enable row level security;
alter table public.server_app_sessions enable row level security;

drop policy if exists "Admins manage server app redeem keys" on public.server_app_redeem_keys;
create policy "Admins manage server app redeem keys"
on public.server_app_redeem_keys
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins manage server app entitlements" on public.server_app_entitlements;
create policy "Admins manage server app entitlements"
on public.server_app_entitlements
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins manage server app wallet balances" on public.server_app_wallet_balances;
create policy "Admins manage server app wallet balances"
on public.server_app_wallet_balances
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins manage server app wallet transactions" on public.server_app_wallet_transactions;
create policy "Admins manage server app wallet transactions"
on public.server_app_wallet_transactions
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins manage server app sessions" on public.server_app_sessions;
create policy "Admins manage server app sessions"
on public.server_app_sessions
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop trigger if exists trg_server_app_redeem_keys_updated_at on public.server_app_redeem_keys;
create trigger trg_server_app_redeem_keys_updated_at
before update on public.server_app_redeem_keys
for each row
execute function public.set_updated_at();

drop trigger if exists trg_server_app_entitlements_updated_at on public.server_app_entitlements;
create trigger trg_server_app_entitlements_updated_at
before update on public.server_app_entitlements
for each row
execute function public.set_updated_at();

drop trigger if exists trg_server_app_wallet_balances_updated_at on public.server_app_wallet_balances;
create trigger trg_server_app_wallet_balances_updated_at
before update on public.server_app_wallet_balances
for each row
execute function public.set_updated_at();

drop trigger if exists trg_server_app_sessions_updated_at on public.server_app_sessions;
create trigger trg_server_app_sessions_updated_at
before update on public.server_app_sessions
for each row
execute function public.set_updated_at();
