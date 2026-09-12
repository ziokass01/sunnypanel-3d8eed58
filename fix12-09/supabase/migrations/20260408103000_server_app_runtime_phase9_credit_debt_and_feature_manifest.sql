-- Phase 9: credit debt + feature manifest + quantity consume
-- Additive migration for Find Dumps server runtime.

alter table public.server_app_features
  add column if not exists category text not null default 'tools',
  add column if not exists group_key text not null default 'general',
  add column if not exists icon_key text,
  add column if not exists badge_label text,
  add column if not exists visible_to_guest boolean not null default true,
  add column if not exists charge_unit integer not null default 1,
  add column if not exists charge_on_success_only boolean not null default true,
  add column if not exists client_accumulate_units boolean not null default false;

alter table public.server_app_features
  drop constraint if exists server_app_features_charge_unit_check;

alter table public.server_app_features
  add constraint server_app_features_charge_unit_check
  check (charge_unit >= 1);

alter table public.server_app_wallet_rules
  add column if not exists soft_daily_reset_mode text not null default 'debt_floor',
  add column if not exists premium_daily_reset_mode text not null default 'debt_floor',
  add column if not exists soft_floor_credit numeric(12,2) not null default 5,
  add column if not exists premium_floor_credit numeric(12,2) not null default 5,
  add column if not exists soft_allow_negative boolean not null default true,
  add column if not exists premium_allow_negative boolean not null default true;

alter table public.server_app_wallet_rules
  drop constraint if exists server_app_wallet_rules_soft_daily_reset_mode_check;

alter table public.server_app_wallet_rules
  add constraint server_app_wallet_rules_soft_daily_reset_mode_check
  check (soft_daily_reset_mode in ('legacy_floor', 'debt_floor'));

alter table public.server_app_wallet_rules
  drop constraint if exists server_app_wallet_rules_premium_daily_reset_mode_check;

alter table public.server_app_wallet_rules
  add constraint server_app_wallet_rules_premium_daily_reset_mode_check
  check (premium_daily_reset_mode in ('legacy_floor', 'debt_floor'));

alter table public.server_app_wallet_balances
  drop constraint if exists server_app_wallet_balances_amounts_check;

alter table public.server_app_wallet_balances
  add constraint server_app_wallet_balances_amounts_check
  check (
    soft_balance >= -999999.99
    and premium_balance >= -999999.99
  );

alter table public.server_app_wallet_transactions
  add column if not exists consume_quantity integer not null default 1;

alter table public.server_app_wallet_transactions
  drop constraint if exists server_app_wallet_transactions_consume_quantity_check;

alter table public.server_app_wallet_transactions
  add constraint server_app_wallet_transactions_consume_quantity_check
  check (consume_quantity >= 1);

update public.server_app_wallet_rules
set
  soft_daily_reset_enabled = true,
  premium_daily_reset_enabled = true,
  soft_daily_reset_amount = greatest(coalesce(soft_daily_reset_amount, 0), 5),
  premium_daily_reset_amount = greatest(coalesce(premium_daily_reset_amount, 0), 5),
  soft_daily_reset_mode = 'debt_floor',
  premium_daily_reset_mode = 'debt_floor',
  soft_floor_credit = greatest(coalesce(soft_floor_credit, 0), 5),
  premium_floor_credit = greatest(coalesce(premium_floor_credit, 0), 5),
  soft_allow_negative = true,
  premium_allow_negative = true,
  consume_priority = 'soft_first',
  notes = concat_ws(E'\n', nullif(notes, ''), 'Phase9: debt floor reset, negative wallet allowed, soft first priority, quantity consume ready.')
where app_code = 'find-dumps';

insert into public.server_app_features (
  app_code, feature_code, title, description, enabled, min_plan, requires_credit,
  soft_cost, premium_cost, reset_period, sort_order,
  category, group_key, icon_key, badge_label, visible_to_guest,
  charge_unit, charge_on_success_only, client_accumulate_units
)
values
  ('find-dumps', 'search_basic', 'Search cơ bản', 'Tìm class, method, offset cơ bản', true, 'classic', false, 0, 0, 'daily', 10, 'search', 'find', 'search', 'Miễn phí', true, 1, true, false),
  ('find-dumps', 'batch_search', 'Batch search', 'Tìm nhiều dòng trong 1 file truy vấn. Mỗi 5 dòng hợp lệ mới tính 1 lần charge.', true, 'go', true, 1, 1, 'daily', 20, 'search', 'batch', 'batch', 'Thường', true, 5, true, true),
  ('find-dumps', 'export_plain', 'Export', 'Xuất kết quả text thường', true, 'classic', true, 1, 1, 'daily', 25, 'export', 'result', 'export', 'Thường', true, 1, true, false),
  ('find-dumps', 'export_json', 'Export JSON', 'Xuất kết quả dạng JSON có cấu trúc', true, 'plus', true, 1, 1, 'daily', 30, 'export', 'result', 'json', 'JSON', true, 1, true, false),
  ('find-dumps', 'background_queue', 'Background queue', 'Xử lý batch nền và ưu tiên hàng đợi', true, 'pro', true, 2, 1, 'daily', 40, 'search', 'batch', 'queue', 'VIP', false, 1, true, false),
  ('find-dumps', 'convert_image', 'Convert image', 'Đổi ảnh sang header .h kiểu SunnyMod', true, 'classic', false, 0, 0, 'daily', 50, 'tools', 'image', 'image', 'Tool', true, 1, true, false),
  ('find-dumps', 'encode_decode', 'Encode / Decode', 'Bộ mã hóa / giải mã kiểu toolbox', true, 'classic', false, 0, 0, 'daily', 60, 'tools', 'codec', 'codec', 'Tool', true, 1, true, false),
  ('find-dumps', 'hex_edit', 'Hex edit', 'Mở file, xem và sửa hex rồi lưu lại', true, 'classic', false, 0, 0, 'daily', 70, 'tools', 'hex', 'hex', 'Tool', true, 1, true, false)
on conflict (app_code, feature_code) do update
set
  title = excluded.title,
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
