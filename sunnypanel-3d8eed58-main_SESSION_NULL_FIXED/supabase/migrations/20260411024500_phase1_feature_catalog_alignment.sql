-- Phase 1: align feature catalog with current app hub and keep unlock rules resilient

insert into public.server_app_features (
  app_code, feature_code, title, description, enabled, min_plan, requires_credit,
  soft_cost, premium_cost, reset_period, sort_order,
  category, group_key, icon_key, badge_label, visible_to_guest,
  charge_unit, charge_on_success_only, client_accumulate_units
)
values
  ('find-dumps', 'export_plain', 'Export text', 'Xuất kết quả hiện tại ra file text thường', true, 'classic', true, 0.2, 0.1, 'daily', 25, 'export', 'result', 'export', 'Text', true, 1, true, false),
  ('find-dumps', 'export_json', 'Export JSON', 'Xuất kết quả hiện tại ra JSON có cấu trúc', true, 'plus', true, 0.2, 0.1, 'daily', 30, 'export', 'result', 'json', 'JSON', true, 1, true, false),
  ('find-dumps', 'convert_image', 'Convert image', 'Chọn ảnh từ máy, đổi sang file header .h rồi copy hoặc export', true, 'classic', false, 0, 0, 'daily', 50, 'tools', 'image', 'image', 'Miễn phí', true, 1, true, false),
  ('find-dumps', 'encode_decode', 'Encode / Decode', 'Base64, Hex, URL, JSON/XML, hash và crypto theo giao diện SunnyMod', true, 'classic', false, 0, 0, 'daily', 60, 'tools', 'codec', 'codec', 'Miễn phí', true, 1, true, false),
  ('find-dumps', 'hex_edit', 'Hex edit', 'Chọn file rồi sửa hex, tìm, nhảy offset và save lại ngay trong app', true, 'classic', false, 0, 0, 'daily', 70, 'tools', 'hex', 'hex', 'Miễn phí', true, 1, true, false)
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

update public.server_app_feature_unlock_rules
set guarded_feature_codes = array(
  select distinct x
  from unnest(coalesce(guarded_feature_codes, '{}'::text[]) || array['export_plain','export_text']) as x
),
    description = 'Mở quyền export TXT/JSON và các đầu ra lớn. Sau khi mở khóa, mỗi lượt export vẫn đi qua lớp tiêu hao credit riêng.',
    notes = concat_ws(E'\n', nullif(notes, ''), 'Phase1 alignment: thêm export text vào nhóm unlock export.'),
    updated_at = now()
where app_code = 'find-dumps'
  and access_code = 'unlock_export_tools';
