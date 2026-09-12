-- Phase: feature unlock foundation for app-host tools

create table if not exists public.server_app_feature_unlock_rules (
  id uuid primary key default gen_random_uuid(),
  app_code text not null references public.server_apps(code) on delete cascade,
  access_code text not null,
  title text not null,
  description text,
  enabled boolean not null default true,
  unlock_required boolean not null default true,
  unlock_duration_seconds integer not null default 86400,
  soft_unlock_cost numeric(12,2) not null default 0,
  premium_unlock_cost numeric(12,2) not null default 0,
  free_for_plans text[] not null default '{}',
  guarded_feature_codes text[] not null default '{}',
  renewable boolean not null default true,
  revalidate_online boolean not null default true,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_code, access_code)
);

create table if not exists public.server_app_feature_unlocks (
  id uuid primary key default gen_random_uuid(),
  app_code text not null references public.server_apps(code) on delete cascade,
  access_code text not null,
  account_ref text not null,
  device_id text,
  status text not null default 'active' check (status in ('active','revoked','expired')),
  unlock_source text not null default 'credit_purchase',
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  trace_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_server_app_feature_unlock_rules_app on public.server_app_feature_unlock_rules(app_code, sort_order, access_code);
create index if not exists idx_server_app_feature_unlocks_lookup on public.server_app_feature_unlocks(app_code, account_ref, access_code, status, started_at desc);
create unique index if not exists server_app_feature_unlocks_active_unique
  on public.server_app_feature_unlocks(app_code, access_code, account_ref, coalesce(device_id, ''))
  where status = 'active' and revoked_at is null;

alter table public.server_app_feature_unlock_rules enable row level security;
alter table public.server_app_feature_unlocks enable row level security;

drop policy if exists "Admins manage feature unlock rules" on public.server_app_feature_unlock_rules;
create policy "Admins manage feature unlock rules"
on public.server_app_feature_unlock_rules
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins manage feature unlocks" on public.server_app_feature_unlocks;
create policy "Admins manage feature unlocks"
on public.server_app_feature_unlocks
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

insert into public.server_app_feature_unlock_rules (
  app_code, access_code, title, description, enabled, unlock_required,
  unlock_duration_seconds, soft_unlock_cost, premium_unlock_cost,
  free_for_plans, guarded_feature_codes, renewable, revalidate_online, notes, sort_order
)
values
  (
    'find-dumps',
    'unlock_binary_workspace',
    'Binary Workspace',
    'Mở quyền vào Binary Workspace. Sau khi mở khóa, scan, browser sâu, diff, save/restore và export vẫn trừ credit theo feature riêng.',
    true,
    true,
    86400,
    2.0,
    1.0,
    array['pro']::text[],
    array['binary_scan_quick','binary_scan_full','ida_export_import','ida_workspace_save','ida_workspace_export','ida_workspace_restore','workspace_batch','workspace_note','workspace_export_result','workspace_browser','workspace_diff']::text[],
    true,
    true,
    'App chỉ cho đi qua cổng sử dụng. Các thao tác nặng vẫn trừ credit theo feature riêng.',
    310
  ),
  (
    'find-dumps',
    'unlock_batch_tools',
    'Batch Search & diện rộng',
    'Mở quyền cho batch search, profile search và hàng đợi nền. Mở khóa chỉ cho phép dùng, còn mỗi lượt chạy vẫn trừ credit như thường.',
    true,
    true,
    86400,
    1.0,
    0.5,
    array['plus','pro']::text[],
    array['batch_search','background_queue','profile_search']::text[],
    true,
    true,
    'Gói cao hơn có thể mở miễn phí hoặc giảm mạnh tùy policy.',
    320
  ),
  (
    'find-dumps',
    'unlock_export_tools',
    'Export ra ngoài',
    'Mở quyền export TXT/JSON/CSV và các đầu ra lớn. Sau khi mở khóa, mỗi lượt export vẫn đi qua lớp tiêu hao credit riêng.',
    true,
    true,
    86400,
    0.5,
    0.2,
    array['go','plus','pro']::text[],
    array['export_json','workspace_export_result','ida_workspace_export']::text[],
    true,
    true,
    'Dùng cho export từ search và Binary Workspace.',
    330
  )
on conflict (app_code, access_code) do update
set title = excluded.title,
    description = excluded.description,
    enabled = excluded.enabled,
    unlock_required = excluded.unlock_required,
    unlock_duration_seconds = excluded.unlock_duration_seconds,
    soft_unlock_cost = excluded.soft_unlock_cost,
    premium_unlock_cost = excluded.premium_unlock_cost,
    free_for_plans = excluded.free_for_plans,
    guarded_feature_codes = excluded.guarded_feature_codes,
    renewable = excluded.renewable,
    revalidate_online = excluded.revalidate_online,
    notes = excluded.notes,
    sort_order = excluded.sort_order,
    updated_at = now();

insert into public.server_app_features (
  app_code, feature_code, title, description, enabled, min_plan, requires_credit,
  soft_cost, premium_cost, reset_period, sort_order,
  category, group_key, icon_key, badge_label, visible_to_guest,
  charge_unit, charge_on_success_only, client_accumulate_units
)
values
  ('find-dumps', 'unlock_binary_workspace', 'Mở khóa Binary Workspace', 'Quyền mở Binary Workspace trước khi sử dụng. Sau khi mở khóa, từng thao tác vẫn trừ credit riêng.', true, 'classic', true, 0, 0, 'daily', 305, 'unlock', 'access', 'lock', 'Mở khóa', true, 1, true, false),
  ('find-dumps', 'unlock_batch_tools', 'Mở khóa Batch Search', 'Quyền mở batch search và tìm kiếm diện rộng trước khi sử dụng.', true, 'classic', true, 0, 0, 'daily', 315, 'unlock', 'access', 'lock', 'Mở khóa', true, 1, true, false),
  ('find-dumps', 'unlock_export_tools', 'Mở khóa Export', 'Quyền mở export ra ngoài trước khi sử dụng.', true, 'classic', true, 0, 0, 'daily', 325, 'unlock', 'access', 'lock', 'Mở khóa', true, 1, true, false),
  ('find-dumps', 'profile_search', 'Profile search', 'Tìm profile, trạng thái entitlement và dữ liệu mở rộng theo account.', true, 'go', true, 0.8, 0.3, 'daily', 35, 'search', 'profile', 'search', 'Thường', true, 1, true, false),
  ('find-dumps', 'binary_scan_quick', 'Binary scan quick', 'Quét nhanh ELF/.so để lấy header, section, symbol và string cơ bản.', true, 'classic', true, 0.4, 0.15, 'daily', 80, 'binary', 'scan', 'binary', 'Binary', true, 1, true, false),
  ('find-dumps', 'binary_scan_full', 'Binary scan full', 'Quét sâu Binary Workspace và dựng function intelligence.', true, 'go', true, 1.2, 0.5, 'daily', 90, 'binary', 'scan', 'binary', 'Binary', true, 1, true, false),
  ('find-dumps', 'ida_export_import', 'Import IDA / artifact', 'Nạp artifact từ IDA, r2 hoặc disassembly ngoài.', true, 'go', true, 0.8, 0.3, 'daily', 100, 'binary', 'artifact', 'import', 'Artifact', true, 1, true, false),
  ('find-dumps', 'ida_workspace_save', 'Save workspace', 'Lưu snapshot workspace để mở lại lần sau.', true, 'classic', false, 0, 0, 'daily', 110, 'binary', 'workspace', 'save', 'Workspace', true, 1, true, false),
  ('find-dumps', 'ida_workspace_export', 'Export workspace', 'Xuất workspace/bundle ra file ngoài.', true, 'classic', true, 0.3, 0.1, 'daily', 120, 'binary', 'workspace', 'export', 'Export', true, 1, true, false),
  ('find-dumps', 'ida_workspace_restore', 'Restore workspace', 'Khôi phục workspace đã lưu từ storage hoặc import file.', true, 'classic', false, 0, 0, 'daily', 130, 'binary', 'workspace', 'restore', 'Workspace', true, 1, true, false),
  ('find-dumps', 'workspace_batch', 'Workspace batch', 'Chạy batch query trên Binary Workspace.', true, 'go', true, 1.0, 0.4, 'daily', 140, 'binary', 'workspace', 'batch', 'Batch', true, 5, true, true),
  ('find-dumps', 'workspace_note', 'Workspace note', 'Gắn note / tag cho entry trong workspace.', true, 'classic', false, 0, 0, 'daily', 150, 'binary', 'workspace', 'note', 'Workspace', true, 1, true, false),
  ('find-dumps', 'workspace_export_result', 'Workspace export result', 'Xuất current view / current result từ Binary Workspace.', true, 'classic', true, 0.2, 0.1, 'daily', 160, 'binary', 'workspace', 'export', 'Export', true, 1, true, false),
  ('find-dumps', 'workspace_browser', 'Workspace browser', 'Mở browser/xref/pseudo trong Binary Workspace.', true, 'plus', true, 0.8, 0.3, 'daily', 170, 'binary', 'workspace', 'browser', 'Browser', true, 1, true, false),
  ('find-dumps', 'workspace_diff', 'Workspace diff', 'So sánh 2 workspace hoặc 2 phiên dump.', true, 'plus', true, 1.0, 0.4, 'daily', 180, 'binary', 'workspace', 'diff', 'Diff', true, 1, true, false)
on conflict (app_code, feature_code) do update
set title = excluded.title,
    description = excluded.description,
    enabled = excluded.enabled,
    min_plan = excluded.min_plan,
    requires_credit = excluded.requires_credit,
    soft_cost = excluded.soft_cost,
    premium_cost = excluded.premium_cost,
    reset_period = excluded.reset_period,
    sort_order = excluded.sort_order,
    category = excluded.category,
    group_key = excluded.group_key,
    icon_key = excluded.icon_key,
    badge_label = excluded.badge_label,
    visible_to_guest = excluded.visible_to_guest,
    charge_unit = excluded.charge_unit,
    charge_on_success_only = excluded.charge_on_success_only,
    client_accumulate_units = excluded.client_accumulate_units,
    updated_at = now();
