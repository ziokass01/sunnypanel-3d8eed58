-- Find Dumps pricing, redeem quick path, and unlock duration tiers

alter table if exists public.server_app_feature_unlock_rules
  add column if not exists soft_unlock_cost_7d numeric(12,2) not null default 0,
  add column if not exists premium_unlock_cost_7d numeric(12,2) not null default 0,
  add column if not exists soft_unlock_cost_30d numeric(12,2) not null default 0,
  add column if not exists premium_unlock_cost_30d numeric(12,2) not null default 0;

insert into public.server_apps (code, label, description, public_enabled, admin_url)
values ('find-dumps', 'Find Dumps', 'App SunnyMod Find Dumps.', true, '/admin/free-keys?app=find-dumps')
on conflict (code) do update
set label = excluded.label,
    description = excluded.description,
    public_enabled = excluded.public_enabled,
    admin_url = excluded.admin_url;

insert into public.server_app_settings (app_code, guest_plan, gift_tab_label, key_persist_until_revoked, daily_reset_hour, free_daily_limit_per_fingerprint, free_daily_limit_per_ip, notes)
values ('find-dumps', 'classic', 'Quà tặng', true, 0, 4, 8, 'Find Dumps runtime config updated 20260413.')
on conflict (app_code) do update
set guest_plan = excluded.guest_plan,
    gift_tab_label = excluded.gift_tab_label,
    key_persist_until_revoked = excluded.key_persist_until_revoked,
    daily_reset_hour = excluded.daily_reset_hour,
    free_daily_limit_per_fingerprint = excluded.free_daily_limit_per_fingerprint,
    free_daily_limit_per_ip = excluded.free_daily_limit_per_ip,
    notes = excluded.notes;

insert into public.server_app_plans (app_code, plan_code, label, enabled, daily_soft_credit, daily_premium_credit, soft_cost_multiplier, premium_cost_multiplier, device_limit, account_limit, sort_order)
values
  ('find-dumps', 'classic', 'Classic', true, 5, 0, 1.00, 1.00, 1, 1, 10),
  ('find-dumps', 'go', 'Go', true, 12, 0, 0.90, 0.90, 1, 1, 20),
  ('find-dumps', 'plus', 'Plus', true, 300, 10, 0.55, 0.50, 2, 1, 30),
  ('find-dumps', 'pro', 'Pro', true, 1000, 30, 0.30, 0.25, 3, 1, 40)
on conflict (app_code, plan_code) do update
set label = excluded.label, enabled = excluded.enabled, daily_soft_credit = excluded.daily_soft_credit, daily_premium_credit = excluded.daily_premium_credit,
    soft_cost_multiplier = excluded.soft_cost_multiplier, premium_cost_multiplier = excluded.premium_cost_multiplier, device_limit = excluded.device_limit, account_limit = excluded.account_limit, sort_order = excluded.sort_order;

insert into public.server_app_wallet_rules (app_code, soft_wallet_label, premium_wallet_label, allow_decimal, soft_daily_reset_enabled, premium_daily_reset_enabled, soft_daily_reset_amount, premium_daily_reset_amount, consume_priority, soft_daily_reset_mode, premium_daily_reset_mode, soft_floor_credit, premium_floor_credit, soft_allow_negative, premium_allow_negative, notes)
values ('find-dumps', 'Credit thường', 'Credit VIP', true, true, true, 5, 5, 'soft_first', 'debt_floor', 'debt_floor', 5, 5, true, true, 'Classic reset 5 credit/day. Go and above receive more from plan meta.')
on conflict (app_code) do update
set soft_wallet_label = excluded.soft_wallet_label, premium_wallet_label = excluded.premium_wallet_label, allow_decimal = excluded.allow_decimal,
    soft_daily_reset_enabled = excluded.soft_daily_reset_enabled, premium_daily_reset_enabled = excluded.premium_daily_reset_enabled,
    soft_daily_reset_amount = excluded.soft_daily_reset_amount, premium_daily_reset_amount = excluded.premium_daily_reset_amount,
    consume_priority = excluded.consume_priority, soft_daily_reset_mode = excluded.soft_daily_reset_mode, premium_daily_reset_mode = excluded.premium_daily_reset_mode,
    soft_floor_credit = excluded.soft_floor_credit, premium_floor_credit = excluded.premium_floor_credit,
    soft_allow_negative = excluded.soft_allow_negative, premium_allow_negative = excluded.premium_allow_negative, notes = excluded.notes;

insert into public.server_app_features (app_code, feature_code, title, description, enabled, min_plan, requires_credit, soft_cost, premium_cost, reset_period, sort_order, category, group_key, icon_key, badge_label, visible_to_guest, charge_unit, charge_on_success_only, client_accumulate_units)
values
  ('find-dumps','search_basic','Search cơ bản','Tra cứu, kiểm tra dump cơ bản',true,'classic',false,0,0,'daily',10,'search','find','search','Miễn phí',true,1,true,false),
  ('find-dumps','batch_search','Batch search','Tìm nhiều dòng trong một lần',true,'go',true,1,1,'daily',20,'search','batch','batch','10 dòng = 1',true,10,true,true),
  ('find-dumps','export_plain','Export text','Xuất kết quả ra text',true,'classic',true,1,1,'daily',25,'export','result','export','Tính credit',true,1,true,false),
  ('find-dumps','export_json','Export JSON','Xuất kết quả ra JSON',true,'plus',true,1,1,'daily',30,'export','result','json','Tính credit',true,1,true,false),
  ('find-dumps','workspace_browser','Browser + pseudo','Xem browser/pseudo sâu',true,'go',true,1,1,'daily',35,'workspace','browser','browser','Tính credit',true,1,true,false),
  ('find-dumps','binary_scan_full','Full scan','Quét sâu nhị phân',true,'go',true,1,1,'daily',40,'workspace','scan','scan','Tính credit',true,1,true,false),
  ('find-dumps','game_profiles','Game Profiles','Lưu và dùng profile',true,'classic',true,1,1,'daily',45,'tools','profile','profile','Tính credit',true,1,true,false),
  ('find-dumps','runtime_redeem','Nhập mã / kích hoạt','Dùng để nhập mã quà trong Runtime Center',true,'classic',false,0,0,'daily',47,'runtime','redeem','gift','Tiện ích',true,1,true,false),
  ('find-dumps','convert_image','Convert image','Đổi ảnh sang file header .h',true,'classic',true,1,1,'daily',50,'tools','image','image','5 lượt = 1',true,5,true,true),
  ('find-dumps','encode_decode','Encode / Decode','Bộ codec',true,'classic',true,1,1,'daily',60,'tools','codec','codec','10 lượt = 1',true,10,true,true),
  ('find-dumps','hex_edit','Hex edit','Mở file và sửa hex',true,'classic',true,1,1,'daily',70,'tools','hex','hex','3 lượt = 1',true,3,true,true),
  ('find-dumps','dumps_soc_analyzer','Dumps so.c','Phân tích file decompile so.c bằng rule engine trong app',true,'go',true,1,1,'daily',75,'tools','soc','soc','Tính credit',true,1,true,false)
on conflict (app_code, feature_code) do update
set title = excluded.title, description = excluded.description, enabled = excluded.enabled, min_plan = excluded.min_plan, requires_credit = excluded.requires_credit,
    soft_cost = excluded.soft_cost, premium_cost = excluded.premium_cost, reset_period = excluded.reset_period, sort_order = excluded.sort_order, category = excluded.category, group_key = excluded.group_key, icon_key = excluded.icon_key, badge_label = excluded.badge_label, visible_to_guest = excluded.visible_to_guest, charge_unit = excluded.charge_unit, charge_on_success_only = excluded.charge_on_success_only, client_accumulate_units = excluded.client_accumulate_units;

insert into public.server_app_feature_unlock_rules (app_code, access_code, title, description, enabled, unlock_required, unlock_duration_seconds, soft_unlock_cost, premium_unlock_cost, soft_unlock_cost_7d, premium_unlock_cost_7d, soft_unlock_cost_30d, premium_unlock_cost_30d, free_for_plans, guarded_feature_codes, renewable, revalidate_online, notes, sort_order)
values
  ('find-dumps','unlock_binary_workspace','Binary Workspace','Mở quyền vào Binary Workspace',true,true,86400,2,1,8,4,24,12,array['pro'],array['binary_scan_quick','binary_scan_full','ida_export_import','ida_workspace_save','ida_workspace_export','ida_workspace_restore','workspace_batch','workspace_note','workspace_export_result','workspace_browser','workspace_diff'],true,true,'Giá phân tầng 1/7/30 ngày',335),
  ('find-dumps','unlock_batch_tools','Batch Search & diện rộng','Mở quyền cho batch search và profile search',true,true,86400,1,0,4,2,12,6,array['plus','pro'],array['batch_search','background_queue','profile_search'],true,true,'Giá phân tầng 1/7/30 ngày',345),
  ('find-dumps','unlock_export_tools','Export ra ngoài','Mở quyền export ngoài',true,true,86400,1,0,3,1,9,4,array['go','plus','pro'],array['export_plain','export_text','export_json','workspace_export_result','ida_workspace_export'],true,true,'Giá phân tầng 1/7/30 ngày',355),
  ('find-dumps','unlock_dumps_soc','Dumps so.c','Mở quyền dùng màn phân tích so.c riêng',true,true,86400,1,0,3,1,9,4,array['plus','pro'],array['dumps_soc_analyzer'],true,true,'Tính năng tách riêng khỏi Binary Workspace',365)
on conflict (app_code, access_code) do update
set title = excluded.title, description = excluded.description, enabled = excluded.enabled, unlock_required = excluded.unlock_required, unlock_duration_seconds = excluded.unlock_duration_seconds,
    soft_unlock_cost = excluded.soft_unlock_cost, premium_unlock_cost = excluded.premium_unlock_cost, soft_unlock_cost_7d = excluded.soft_unlock_cost_7d, premium_unlock_cost_7d = excluded.premium_unlock_cost_7d, soft_unlock_cost_30d = excluded.soft_unlock_cost_30d, premium_unlock_cost_30d = excluded.premium_unlock_cost_30d,
    free_for_plans = excluded.free_for_plans, guarded_feature_codes = excluded.guarded_feature_codes, renewable = excluded.renewable, revalidate_online = excluded.revalidate_online, notes = excluded.notes, sort_order = excluded.sort_order;

update public.licenses_free_key_types
set free_selection_mode = case when code = 'fd_credit' then 'credit' else 'package' end,
    default_package_code = case when code in ('fdh1','fdd1','fd_package') then 'go' when code='fdd7' then 'go' when code='fdd30' then 'plus' else default_package_code end,
    default_credit_code = case when code = 'fd_credit' then 'credit-normal' else default_credit_code end,
    default_wallet_kind = case when code = 'fd_credit' then 'normal' else default_wallet_kind end,
    app_code = 'find-dumps',
    label = case when code in ('fdh1','fdd1','fd_package') then 'Find Dumps Go 3 ngày' else label end,
    duration_seconds = case when code in ('fdh1','fdd1','fd_package') then 259200 when code='fdd7' then 604800 when code='fdd30' then 2592000 else duration_seconds end,
    kind = case when code in ('fdh1','fdd1','fd_package','fdd7','fdd30') then 'day' else kind end,
    value = case when code in ('fdh1','fdd1','fd_package') then 3 when code='fdd7' then 7 when code='fdd30' then 30 else value end
where app_code = 'find-dumps' or code in ('fdh1','fdd1','fd_package','fdd7','fdd30','fd_credit');
