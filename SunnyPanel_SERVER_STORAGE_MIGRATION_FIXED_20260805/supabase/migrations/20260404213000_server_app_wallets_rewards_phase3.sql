create table if not exists public.server_app_wallet_rules (
  app_code text primary key references public.server_apps(code) on delete cascade,
  soft_wallet_label text not null default 'Credit thường',
  premium_wallet_label text not null default 'Credit kim cương',
  allow_decimal boolean not null default true,
  soft_daily_reset_enabled boolean not null default true,
  premium_daily_reset_enabled boolean not null default false,
  soft_daily_reset_amount numeric(12,2) not null default 0,
  premium_daily_reset_amount numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.server_app_reward_packages (
  id uuid primary key default gen_random_uuid(),
  app_code text not null references public.server_apps(code) on delete cascade,
  package_code text not null,
  title text not null,
  description text,
  enabled boolean not null default true,
  reward_mode text not null default 'plan',
  plan_code text,
  soft_credit_amount numeric(12,2) not null default 0,
  premium_credit_amount numeric(12,2) not null default 0,
  entitlement_days integer not null default 0,
  device_limit_override integer,
  account_limit_override integer,
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(app_code, package_code)
);

alter table public.server_app_wallet_rules enable row level security;
alter table public.server_app_reward_packages enable row level security;

drop policy if exists "Admins manage server app wallet rules" on public.server_app_wallet_rules;
create policy "Admins manage server app wallet rules"
on public.server_app_wallet_rules
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins manage server app reward packages" on public.server_app_reward_packages;
create policy "Admins manage server app reward packages"
on public.server_app_reward_packages
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

insert into public.server_app_wallet_rules (
  app_code,
  soft_wallet_label,
  premium_wallet_label,
  allow_decimal,
  soft_daily_reset_enabled,
  premium_daily_reset_enabled,
  soft_daily_reset_amount,
  premium_daily_reset_amount,
  notes
)
values
  ('free-fire', 'Credit thường', 'Credit kim cương', true, true, false, 3, 0, 'Dùng decimal để tránh cảm giác credit quá to và lạm phát.'),
  ('find-dumps', 'Credit thường', 'Credit kim cương', true, true, false, 5, 0, 'Credit thường reset theo ngày. Credit kim cương để dành cho tác vụ nặng và hao ít hơn.')
on conflict (app_code) do update
set
  soft_wallet_label = excluded.soft_wallet_label,
  premium_wallet_label = excluded.premium_wallet_label,
  allow_decimal = excluded.allow_decimal,
  soft_daily_reset_enabled = excluded.soft_daily_reset_enabled,
  premium_daily_reset_enabled = excluded.premium_daily_reset_enabled,
  soft_daily_reset_amount = excluded.soft_daily_reset_amount,
  premium_daily_reset_amount = excluded.premium_daily_reset_amount,
  notes = excluded.notes,
  updated_at = now();

insert into public.server_app_reward_packages (
  app_code,
  package_code,
  title,
  description,
  enabled,
  reward_mode,
  plan_code,
  soft_credit_amount,
  premium_credit_amount,
  entitlement_days,
  device_limit_override,
  account_limit_override,
  sort_order,
  notes
)
values
  ('find-dumps', 'fd_go_7d', 'Find Dumps Go 7 ngày', 'Mở plan Go trong 7 ngày, kèm ít credit thường để dùng batch nhẹ.', true, 'mixed', 'go', 3, 0, 7, 1, 1, 10, 'Gói nhập key cho tab Quà tặng.'),
  ('find-dumps', 'fd_plus_30d', 'Find Dumps Plus 30 ngày', 'Mở plan Plus và thêm một ít credit kim cương.', true, 'mixed', 'plus', 5, 1.5, 30, 2, 1, 20, 'Phù hợp user dùng thường xuyên.'),
  ('find-dumps', 'fd_pro_30d', 'Find Dumps Pro 30 ngày', 'Mở full plan Pro trong 30 ngày.', true, 'plan', 'pro', 0, 0, 30, 3, 1, 30, 'Không tặng quá nhiều credit để tránh lạm dụng.'),
  ('free-fire', 'ff_go_7d', 'Free Fire Go 7 ngày', 'Mở plan Go cho app Free Fire.', true, 'plan', 'go', 0, 0, 7, 1, 1, 10, 'Có thể map với key mua bên admin.'),
  ('free-fire', 'ff_plus_30d', 'Free Fire Plus 30 ngày', 'Mở plan Plus cho app Free Fire.', true, 'plan', 'plus', 0, 0, 30, 2, 1, 20, 'Dùng cho tab Quà tặng sau này.'),
  ('free-fire', 'ff_credit_topup', 'Top-up credit kim cương', 'Nạp credit kim cương trả phí để dùng feature hao rẻ hơn.', true, 'premium_credit', null, 0, 5, 0, null, null, 30, 'Dùng cho key top-up riêng.')
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
  device_limit_override = excluded.device_limit_override,
  account_limit_override = excluded.account_limit_override,
  sort_order = excluded.sort_order,
  notes = excluded.notes,
  updated_at = now();
