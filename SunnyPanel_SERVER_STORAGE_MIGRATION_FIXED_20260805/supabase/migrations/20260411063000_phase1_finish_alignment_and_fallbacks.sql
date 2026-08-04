-- Phase 1 finish: align remaining app-managed tools and add migration unlock group placeholder

insert into public.server_app_features (
  app_code, feature_code, title, description, enabled, min_plan, requires_credit,
  soft_cost, premium_cost, reset_period, sort_order,
  category, group_key, icon_key, badge_label, visible_to_guest,
  charge_unit, charge_on_success_only, client_accumulate_units
)
values
  ('find-dumps', 'game_profiles', 'Game Profiles', 'Lưu, import, export và quét nhiều offset theo profile', true, 'classic', false, 0, 0, 'daily', 45, 'tools', 'profile', 'profile', 'Miễn phí', true, 1, true, false),
  ('find-dumps', 'runtime_redeem', 'Nhập mã / kích hoạt', 'Mở Runtime Center để nhập mã quà và đồng bộ session', true, 'classic', false, 0, 0, 'daily', 47, 'runtime', 'redeem', 'gift', 'Khuyến nghị', true, 1, true, false)
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

insert into public.server_app_feature_unlock_rules (
  app_code, access_code, title, description, enabled, unlock_required,
  unlock_duration_seconds, soft_unlock_cost, premium_unlock_cost,
  free_for_plans, guarded_feature_codes, renewable, revalidate_online,
  notes, sort_order
)
values
  ('find-dumps', 'unlock_migration_tools', 'Migration tools', 'Nhóm quyền cho Diff 2 dump, remap query, batch migrate, batch compare và validation. Mở khóa chỉ mở quyền vào cửa, chạy thật vẫn trừ credit theo feature tương ứng.', false, true, 86400, 2, 1, array['pro'], array['diff_two_dumps','query_remap','batch_migrate','batch_compare','batch_validate','export_report'], true, true, 'Phase 1 placeholder cho phase 2-3. Chưa bật cho tới khi app có màn tương ứng.', 335)
on conflict (app_code, access_code) do update
set title = excluded.title,
    description = excluded.description,
    notes = excluded.notes,
    guarded_feature_codes = excluded.guarded_feature_codes,
    renewable = excluded.renewable,
    revalidate_online = excluded.revalidate_online,
    updated_at = now();
