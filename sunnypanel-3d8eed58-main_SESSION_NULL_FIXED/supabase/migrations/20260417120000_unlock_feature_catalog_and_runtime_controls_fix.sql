begin;

insert into public.server_app_features (
  app_code, feature_code, title, description, enabled, min_plan, requires_credit,
  soft_cost, premium_cost, reset_period, sort_order,
  category, group_key, icon_key, badge_label, visible_to_guest,
  charge_unit, charge_on_success_only, client_accumulate_units
)
values
  (
    'find-dumps',
    'unlock_migration_tools',
    'Mở khóa Diff / Remap / Migrate',
    'Feature catalog row cho thao tác mở khóa nhóm Diff, Remap, Migrate, Compare, Validate và Export report. Runtime dùng row này để ghi giao dịch unlock mà không rơi sang FEATURE_NOT_FOUND.',
    true,
    'classic',
    true,
    0,
    0,
    'daily',
    360,
    'unlock',
    'access',
    'lock',
    'Mở khóa',
    true,
    1,
    true,
    false
  ),
  (
    'find-dumps',
    'unlock_dumps_soc',
    'Mở khóa Dumps so.c',
    'Feature catalog row cho thao tác mở khóa màn Dumps so.c. Runtime dùng row này để ghi giao dịch unlock mà không rơi sang FEATURE_NOT_FOUND.',
    true,
    'classic',
    true,
    0,
    0,
    'daily',
    365,
    'unlock',
    'access',
    'lock',
    'Mở khóa',
    true,
    1,
    true,
    false
  )
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

insert into public.server_app_runtime_controls (
  app_code,
  consume_enabled,
  maintenance_notice
)
values (
  'find-dumps',
  true,
  null
)
on conflict (app_code) do update
set consume_enabled = coalesce(public.server_app_runtime_controls.consume_enabled, excluded.consume_enabled),
    updated_at = now();

commit;
