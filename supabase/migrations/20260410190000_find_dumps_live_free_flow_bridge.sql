-- Phase bridge: make Find Dumps free-flow mint real server-app redeem keys
-- and let package/credit rules run through the existing runtime engine.

alter table public.licenses_free_sessions
  add column if not exists app_code text not null default 'free-fire',
  add column if not exists package_code text,
  add column if not exists credit_code text,
  add column if not exists wallet_kind text,
  add column if not exists issued_server_redeem_key_id uuid references public.server_app_redeem_keys(id) on delete set null,
  add column if not exists issued_server_reward_mode text,
  add column if not exists selection_meta jsonb not null default '{}'::jsonb;

create index if not exists idx_lfs_app_code on public.licenses_free_sessions(app_code);
create index if not exists idx_lfs_find_dumps_reward on public.licenses_free_sessions(app_code, package_code, credit_code);
create index if not exists idx_lfs_issued_server_redeem_key_id on public.licenses_free_sessions(issued_server_redeem_key_id);

alter table public.licenses_free_issues
  alter column license_id drop not null;

alter table public.licenses_free_issues
  add column if not exists app_code text not null default 'free-fire',
  add column if not exists key_signature text,
  add column if not exists server_redeem_key_id uuid references public.server_app_redeem_keys(id) on delete set null;

create index if not exists idx_lfi_app_code on public.licenses_free_issues(app_code);
create index if not exists idx_lfi_server_redeem_key_id on public.licenses_free_issues(server_redeem_key_id);

alter table public.server_app_reward_packages
  add column if not exists entitlement_seconds bigint not null default 0;

alter table public.server_app_redeem_keys
  add column if not exists entitlement_seconds bigint not null default 0;

alter table public.server_app_reward_packages
  drop constraint if exists server_app_reward_packages_entitlement_seconds_check;
alter table public.server_app_reward_packages
  add constraint server_app_reward_packages_entitlement_seconds_check
  check (entitlement_seconds >= 0);

alter table public.server_app_redeem_keys
  drop constraint if exists server_app_redeem_keys_entitlement_seconds_check;
alter table public.server_app_redeem_keys
  add constraint server_app_redeem_keys_entitlement_seconds_check
  check (entitlement_seconds >= 0);

update public.server_app_plans
set
  soft_cost_multiplier = case lower(plan_code)
    when 'classic' then 1.00
    when 'go' then 0.92
    when 'plus' then 0.80
    when 'pro' then 0.65
    else soft_cost_multiplier
  end,
  premium_cost_multiplier = case lower(plan_code)
    when 'classic' then 1.00
    when 'go' then 0.92
    when 'plus' then 0.80
    when 'pro' then 0.65
    else premium_cost_multiplier
  end,
  daily_soft_credit = case lower(plan_code)
    when 'classic' then 0
    when 'go' then 3
    when 'plus' then 5
    when 'pro' then 8
    else daily_soft_credit
  end,
  daily_premium_credit = case lower(plan_code)
    when 'classic' then 0
    when 'go' then 0
    when 'plus' then 1
    when 'pro' then 2
    else daily_premium_credit
  end,
  updated_at = now()
where app_code = 'find-dumps';

insert into public.licenses_free_key_types (code, label, duration_seconds, kind, value, sort_order, enabled, app_code, app_label, key_signature, allow_reset)
values
  ('fdh1', 'Find Dumps 1 giờ', 3600, 'hour', 1, 301, true, 'find-dumps', 'Find Dumps', 'FD', false),
  ('fdd1', 'Find Dumps 1 ngày', 86400, 'day', 1, 302, true, 'find-dumps', 'Find Dumps', 'FD', false),
  ('fdd7', 'Find Dumps 7 ngày', 604800, 'day', 7, 303, true, 'find-dumps', 'Find Dumps', 'FD', false),
  ('fdd30', 'Find Dumps 30 ngày', 2592000, 'day', 30, 304, true, 'find-dumps', 'Find Dumps', 'FD', false)
on conflict (code) do update
set
  label = excluded.label,
  duration_seconds = excluded.duration_seconds,
  kind = excluded.kind,
  value = excluded.value,
  sort_order = excluded.sort_order,
  enabled = excluded.enabled,
  app_code = excluded.app_code,
  app_label = excluded.app_label,
  key_signature = excluded.key_signature,
  allow_reset = excluded.allow_reset,
  updated_at = now();

insert into public.server_app_reward_packages (
  app_code, package_code, title, description, enabled, reward_mode, plan_code,
  soft_credit_amount, premium_credit_amount, entitlement_days, entitlement_seconds,
  device_limit_override, account_limit_override, sort_order, notes
)
values
  ('find-dumps', 'classic', 'Find Dumps Classic', 'Package nền cho flow free của Find Dumps.', true, 'plan', 'classic', 0, 0, 0, 0, 1, 1, 101, 'Flow free package classic.'),
  ('find-dumps', 'go', 'Find Dumps Go', 'Package Go dùng chung cho flow free và admin.', true, 'plan', 'go', 0, 0, 0, 0, 1, 1, 102, 'Flow free package go.'),
  ('find-dumps', 'plus', 'Find Dumps Plus', 'Package Plus dùng chung cho flow free và admin.', true, 'plan', 'plus', 0, 0, 0, 0, 2, 1, 103, 'Flow free package plus.'),
  ('find-dumps', 'pro', 'Find Dumps Pro', 'Package Pro dùng chung cho flow free và admin.', true, 'plan', 'pro', 0, 0, 0, 0, 3, 1, 104, 'Flow free package pro.'),
  ('find-dumps', 'credit-normal', 'Find Dumps Credit thường', 'Key credit thường hết hạn từ lúc nhận key.', true, 'soft_credit', null, 1.50, 0, 0, 0, null, null, 105, 'Flow free credit thường.'),
  ('find-dumps', 'credit-vip', 'Find Dumps Credit VIP', 'Key credit VIP hết hạn từ lúc nhận key.', true, 'premium_credit', null, 0, 0.50, 0, 0, null, null, 106, 'Flow free credit VIP.')
on conflict (app_code, package_code) do update
set
  title = excluded.title,
  description = excluded.description,
  enabled = excluded.enabled,
  reward_mode = excluded.reward_mode,
  plan_code = excluded.plan_code,
  soft_credit_amount = excluded.soft_credit_amount,
  premium_credit_amount = excluded.premium_credit_amount,
  entitlement_days = excluded.entitlement_days,
  entitlement_seconds = excluded.entitlement_seconds,
  device_limit_override = excluded.device_limit_override,
  account_limit_override = excluded.account_limit_override,
  sort_order = excluded.sort_order,
  notes = excluded.notes,
  updated_at = now();
