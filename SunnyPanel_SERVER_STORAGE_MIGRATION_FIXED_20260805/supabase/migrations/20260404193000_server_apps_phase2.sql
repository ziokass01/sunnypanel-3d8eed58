create table if not exists public.server_apps (
  code text primary key,
  label text not null,
  description text,
  admin_url text,
  public_enabled boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.server_app_settings (
  app_code text primary key references public.server_apps(code) on delete cascade,
  guest_plan text not null default 'classic',
  gift_tab_label text not null default 'Quà tặng',
  key_persist_until_revoked boolean not null default true,
  daily_reset_hour integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.server_app_plans (
  id uuid primary key default gen_random_uuid(),
  app_code text not null references public.server_apps(code) on delete cascade,
  plan_code text not null,
  label text not null,
  enabled boolean not null default true,
  daily_soft_credit numeric(12,2) not null default 0,
  daily_premium_credit numeric(12,2) not null default 0,
  soft_cost_multiplier numeric(12,2) not null default 1,
  premium_cost_multiplier numeric(12,2) not null default 1,
  device_limit integer not null default 1,
  account_limit integer not null default 1,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(app_code, plan_code)
);

create table if not exists public.server_app_features (
  id uuid primary key default gen_random_uuid(),
  app_code text not null references public.server_apps(code) on delete cascade,
  feature_code text not null,
  title text not null,
  description text,
  enabled boolean not null default true,
  min_plan text not null default 'classic',
  requires_credit boolean not null default false,
  soft_cost numeric(12,2) not null default 0,
  premium_cost numeric(12,2) not null default 0,
  reset_period text not null default 'daily',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(app_code, feature_code)
);

alter table public.server_apps enable row level security;
alter table public.server_app_settings enable row level security;
alter table public.server_app_plans enable row level security;
alter table public.server_app_features enable row level security;

drop policy if exists "Admins manage server apps" on public.server_apps;
create policy "Admins manage server apps"
on public.server_apps
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins manage server app settings" on public.server_app_settings;
create policy "Admins manage server app settings"
on public.server_app_settings
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins manage server app plans" on public.server_app_plans;
create policy "Admins manage server app plans"
on public.server_app_plans
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins manage server app features" on public.server_app_features;
create policy "Admins manage server app features"
on public.server_app_features
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

insert into public.server_apps (code, label, description, admin_url, public_enabled, notes)
values
  ('free-fire', 'Free Fire', 'App hiện tại đang dùng web free key chung.', null, true, 'App cũ mặc định của panel.'),
  ('find-dumps', 'Find Dumps', 'App SunnyMod Find Dumps để cấu hình gói, credit và feature flags riêng.', null, true, 'App mới dùng 2 loại credit: thường và kim cương.')
on conflict (code) do update
set label = excluded.label,
    description = excluded.description,
    public_enabled = excluded.public_enabled,
    notes = excluded.notes;

insert into public.server_app_settings (app_code, guest_plan, gift_tab_label, key_persist_until_revoked, daily_reset_hour, notes)
values
  ('free-fire', 'classic', 'Quà tặng', true, 0, 'Key nhập đúng thì giữ tới khi admin xóa/chặn/hết hạn.'),
  ('find-dumps', 'classic', 'Quà tặng', true, 0, 'Credit thường reset theo ngày. Credit kim cương ưu tiên hao ít hơn.')
on conflict (app_code) do nothing;

insert into public.server_app_plans (app_code, plan_code, label, enabled, daily_soft_credit, daily_premium_credit, soft_cost_multiplier, premium_cost_multiplier, device_limit, account_limit, sort_order)
values
  ('find-dumps', 'classic', 'Classic', true, 0, 0, 1, 1, 1, 1, 10),
  ('find-dumps', 'go', 'Go', true, 3, 0, 0.95, 0.80, 1, 1, 20),
  ('find-dumps', 'plus', 'Plus', true, 5, 1, 0.80, 0.60, 2, 1, 30),
  ('find-dumps', 'pro', 'Pro', true, 8, 2, 0.65, 0.45, 3, 1, 40),
  ('free-fire', 'classic', 'Classic', true, 0, 0, 1, 1, 1, 1, 10),
  ('free-fire', 'go', 'Go', true, 2, 0, 0.95, 0.80, 1, 1, 20),
  ('free-fire', 'plus', 'Plus', true, 4, 1, 0.80, 0.60, 2, 1, 30),
  ('free-fire', 'pro', 'Pro', true, 6, 2, 0.70, 0.45, 3, 1, 40)
on conflict (app_code, plan_code) do nothing;

insert into public.server_app_features (app_code, feature_code, title, description, enabled, min_plan, requires_credit, soft_cost, premium_cost, reset_period, sort_order)
values
  ('find-dumps', 'search_basic', 'Search cơ bản', 'Tìm class, method, offset cơ bản', true, 'classic', false, 0, 0, 'daily', 10),
  ('find-dumps', 'batch_search', 'Batch search', 'Tìm nhiều dòng trong 1 file truy vấn', true, 'go', true, 0.75, 0.25, 'daily', 20),
  ('find-dumps', 'export_json', 'Export JSON', 'Xuất kết quả dạng JSON', true, 'plus', true, 1.20, 0.45, 'daily', 30),
  ('find-dumps', 'background_queue', 'Background queue', 'Xử lý batch nền và ưu tiên hàng đợi', true, 'pro', true, 2.40, 0.90, 'daily', 40),
  ('free-fire', 'free_key', 'Free key', 'Luồng vượt free nhận key', true, 'classic', false, 0, 0, 'daily', 10),
  ('free-fire', 'vip_2pass', 'VIP 2-pass', 'Loại key cần vượt 2 lượt', true, 'go', false, 0, 0, 'daily', 20),
  ('free-fire', 'reset_key', 'Reset key', 'Khả năng reset nếu key cho phép', true, 'plus', true, 0.90, 0.30, 'daily', 30)
on conflict (app_code, feature_code) do nothing;
