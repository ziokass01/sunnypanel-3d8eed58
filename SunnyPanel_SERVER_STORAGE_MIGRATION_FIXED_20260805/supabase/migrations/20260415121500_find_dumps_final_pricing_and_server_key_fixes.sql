-- Final pricing, caps, discounts, unlock tiers, feature seeds, and server key save guard for Find Dumps.

-- 1) Rebalance plans to compact numbers and real soft/VIP discounts.
update public.server_app_plans
set daily_soft_credit = case lower(plan_code)
      when 'classic' then 5
      when 'go' then 7
      when 'plus' then 20
      when 'pro' then 50
      else daily_soft_credit end,
    daily_premium_credit = case lower(plan_code)
      when 'classic' then 0
      when 'go' then 0
      when 'plus' then 0.25
      when 'pro' then 0.5
      else daily_premium_credit end,
    soft_balance_cap = case lower(plan_code)
      when 'classic' then 5
      when 'go' then 70
      when 'plus' then 200
      when 'pro' then 500
      else soft_balance_cap end,
    premium_balance_cap = case lower(plan_code)
      when 'classic' then 0
      when 'go' then 0
      when 'plus' then 5
      when 'pro' then 10
      else premium_balance_cap end,
    device_limit = case lower(plan_code)
      when 'classic' then 1
      when 'go' then 1
      when 'plus' then 2
      when 'pro' then 3
      else device_limit end,
    account_limit = 1,
    soft_cost_multiplier = case lower(plan_code)
      when 'classic' then 1
      when 'go' then 0.90
      when 'plus' then 0.65
      when 'pro' then 0.45
      else soft_cost_multiplier end,
    premium_cost_multiplier = case lower(plan_code)
      when 'classic' then 1
      when 'go' then 1
      when 'plus' then 0.80
      when 'pro' then 0.70
      else premium_cost_multiplier end,
    updated_at = now()
where app_code = 'find-dumps';

-- 2) Wallet behavior: classic stays at floor, higher plans accumulate but only under plan cap logic in runtime.
update public.server_app_wallet_rules
set soft_wallet_label = coalesce(nullif(soft_wallet_label, ''), 'Credit thường'),
    premium_wallet_label = coalesce(nullif(premium_wallet_label, ''), 'Credit VIP'),
    allow_decimal = true,
    consume_priority = 'soft_first',
    soft_daily_reset_enabled = true,
    soft_daily_reset_amount = 5,
    soft_daily_reset_mode = 'debt_floor',
    soft_floor_credit = 5,
    premium_daily_reset_enabled = false,
    premium_daily_reset_amount = 0,
    premium_daily_reset_mode = 'debt_floor',
    premium_floor_credit = 0,
    soft_allow_negative = true,
    premium_allow_negative = false,
    notes = concat_ws(E'\n', nullif(notes, ''), '2026-04-15 final pricing: soft first, classic floor 5, premium reset off.') ,
    updated_at = now()
where app_code = 'find-dumps';

-- 3) Core feature pricing and min plan.
insert into public.server_app_features (app_code, feature_code, title, description, enabled, min_plan, requires_credit, soft_cost, premium_cost, reset_period, sort_order, category, group_key, icon_key, badge_label, visible_to_guest, charge_unit, charge_on_success_only, client_accumulate_units)
values
  ('find-dumps','search_basic','Search cơ bản','Tra cứu, kiểm tra dump cơ bản',true,'classic',false,0,0,'daily',10,'search','find','search','Miễn phí',true,1,true,false),
  ('find-dumps','batch_search','Batch search','Tìm nhiều dòng trong một lần',true,'go',true,0.20,0,'daily',20,'search','batch','batch','Tính credit',true,1,true,true),
  ('find-dumps','export_plain','Export text','Xuất kết quả ra text',true,'go',true,0.05,0,'daily',25,'export','result','export','Tính credit',true,1,true,false),
  ('find-dumps','export_json','Export JSON','Xuất kết quả ra JSON',true,'go',true,0.10,0,'daily',30,'export','result','json','Tính credit',true,1,true,false),
  ('find-dumps','workspace_browser','Browser + pseudo','Xem browser/pseudo sâu',true,'plus',true,0.50,0.03,'daily',35,'workspace','browser','browser','Tính credit',true,1,true,false),
  ('find-dumps','binary_scan_full','Full scan','Quét sâu nhị phân',true,'plus',true,1.00,0.05,'daily',40,'workspace','scan','scan','Tính credit',true,1,true,false),
  ('find-dumps','profile_search','Profile search','Tìm profile và dữ liệu mở rộng theo account.',true,'go',true,0.20,0,'daily',42,'search','profile','search','Tính credit',false,1,true,false),
  ('find-dumps','background_queue','Background queue','Xử lý batch nền và ưu tiên hàng đợi.',true,'go',true,0.50,0.03,'daily',44,'search','batch','queue','Tính credit',false,1,true,false),
  ('find-dumps','game_profiles','Game Profiles','Lưu và dùng profile',true,'classic',false,0,0,'daily',45,'tools','profile','profile','Miễn phí',true,1,true,false),
  ('find-dumps','runtime_redeem','Nhập mã / kích hoạt','Dùng để nhập mã quà trong Runtime Center',true,'classic',false,0,0,'daily',47,'runtime','redeem','gift','Tiện ích',true,1,true,false),
  ('find-dumps','convert_image','Convert image','Đổi ảnh sang file header .h',true,'classic',false,0,0,'daily',50,'tools','image','image','Miễn phí',true,1,true,true),
  ('find-dumps','encode_decode','Encode / Decode','Bộ codec',true,'classic',false,0,0,'daily',60,'tools','codec','codec','Miễn phí',true,1,true,true),
  ('find-dumps','hex_edit','Hex edit','Mở file và sửa hex',true,'classic',false,0,0,'daily',70,'tools','hex','hex','Miễn phí',true,1,true,false),
  ('find-dumps','diff_two_dumps','Diff / 2 dump','So sánh 2 bản dump.',true,'plus',true,1.20,0.06,'daily',72,'tools','migrate','diff','Tính credit',true,1,true,false),
  ('find-dumps','query_remap','Query remap','Đổi map và tái sử dụng rule search.',true,'plus',true,1.20,0.06,'daily',73,'tools','migrate','remap','Tính credit',true,1,true,false),
  ('find-dumps','batch_migrate','Batch migrate','Migrate batch theo rule.',true,'plus',true,1.20,0.06,'daily',74,'tools','migrate','migrate','Tính credit',true,1,true,false),
  ('find-dumps','batch_compare','Batch compare','Đối chiếu batch.',true,'plus',true,1.20,0.06,'daily',75,'tools','migrate','compare','Tính credit',true,1,true,false),
  ('find-dumps','batch_validate','Batch validate','Validate batch.',true,'plus',true,1.20,0.06,'daily',76,'tools','migrate','validate','Tính credit',true,1,true,false),
  ('find-dumps','export_report','Export report','Xuất báo cáo migration.',true,'plus',true,1.20,0.06,'daily',77,'tools','migrate','report','Tính credit',true,1,true,false),
  ('find-dumps','dumps_soc_analyzer','Dumps so.c','Phân tích file decompile so.c bằng rule engine trong app',true,'pro',true,2.00,0.10,'daily',80,'tools','soc','soc','Tính credit',true,1,true,false)
on conflict (app_code, feature_code) do update
set title = excluded.title, description = excluded.description, enabled = excluded.enabled, min_plan = excluded.min_plan, requires_credit = excluded.requires_credit,
    soft_cost = excluded.soft_cost, premium_cost = excluded.premium_cost, reset_period = excluded.reset_period, sort_order = excluded.sort_order, category = excluded.category, group_key = excluded.group_key, icon_key = excluded.icon_key, badge_label = excluded.badge_label, visible_to_guest = excluded.visible_to_guest, charge_unit = excluded.charge_unit, charge_on_success_only = excluded.charge_on_success_only, client_accumulate_units = excluded.client_accumulate_units;

-- 4) Unlock tiers with real 1d / 7d / 30d gaps.
insert into public.server_app_feature_unlock_rules (app_code, access_code, title, description, enabled, unlock_required, unlock_duration_seconds, soft_unlock_cost, premium_unlock_cost, soft_unlock_cost_7d, premium_unlock_cost_7d, soft_unlock_cost_30d, premium_unlock_cost_30d, free_for_plans, guarded_feature_codes, renewable, revalidate_online, notes, sort_order)
values
  ('find-dumps','unlock_binary_workspace','Binary Workspace','Mở quyền vào Binary Workspace',true,true,86400,2.0,0.10,10.0,0.50,30.0,1.50,array['pro'],array['binary_scan_quick','binary_scan_full','ida_export_import','ida_workspace_save','ida_workspace_export','ida_workspace_restore','workspace_batch','workspace_note','workspace_export_result','workspace_browser','workspace_diff'],true,true,'Giá phân tầng 1/7/30 ngày',335),
  ('find-dumps','unlock_batch_tools','Batch Search & diện rộng','Mở quyền cho batch search và profile search',true,true,86400,1.0,0,5.0,0,15.0,0,array['plus','pro'],array['batch_search','background_queue','profile_search'],true,true,'Giá phân tầng 1/7/30 ngày',345),
  ('find-dumps','unlock_export_tools','Export ra ngoài','Mở quyền export ngoài',true,true,86400,1.0,0,4.0,0,12.0,0,array['go','plus','pro'],array['export_plain','export_text','export_json','workspace_export_result','ida_workspace_export'],true,true,'Giá phân tầng 1/7/30 ngày',355),
  ('find-dumps','unlock_migration_tools','Diff / Remap / Migrate','Mở quyền dùng Diff, Remap, Migrate, Compare, Validate và Export report.',true,true,86400,1.5,0.08,7.0,0.35,21.0,1.05,array['plus','pro'],array['diff_two_dumps','query_remap','batch_migrate','batch_compare','batch_validate','export_report'],true,true,'Giá phân tầng 1/7/30 ngày',360),
  ('find-dumps','unlock_dumps_soc','Dumps so.c','Mở quyền dùng màn phân tích so.c riêng',true,true,86400,2.0,0.10,9.0,0.45,27.0,1.35,array['pro'],array['dumps_soc_analyzer'],true,true,'Tính năng tách riêng khỏi Binary Workspace',365)
on conflict (app_code, access_code) do update
set title = excluded.title, description = excluded.description, enabled = excluded.enabled, unlock_required = excluded.unlock_required, unlock_duration_seconds = excluded.unlock_duration_seconds,
    soft_unlock_cost = excluded.soft_unlock_cost, premium_unlock_cost = excluded.premium_unlock_cost, soft_unlock_cost_7d = excluded.soft_unlock_cost_7d, premium_unlock_cost_7d = excluded.premium_unlock_cost_7d, soft_unlock_cost_30d = excluded.soft_unlock_cost_30d, premium_unlock_cost_30d = excluded.premium_unlock_cost_30d,
    free_for_plans = excluded.free_for_plans, guarded_feature_codes = excluded.guarded_feature_codes, renewable = excluded.renewable, revalidate_online = excluded.revalidate_online, notes = excluded.notes, sort_order = excluded.sort_order;

-- 5) Reward packages and server key/free flow alignment.
insert into public.server_app_reward_packages (app_code, package_code, title, description, enabled, reward_mode, plan_code, soft_credit_amount, premium_credit_amount, entitlement_days, entitlement_seconds, device_limit_override, account_limit_override, sort_order, notes)
values
  ('find-dumps','classic','Find Dumps Classic 3 ngày','Gói Classic ngắn ngày.',true,'plan','classic',0,0,3,3 * 86400,1,1,10,'Flow free package'),
  ('find-dumps','go','Find Dumps Go 7 ngày','Gói Go nhỉnh hơn Classic.',true,'plan','go',0,0,7,7 * 86400,1,1,20,'Flow free package'),
  ('find-dumps','plus','Find Dumps Plus 30 ngày','Gói Plus cho nhu cầu cao.',true,'plan','plus',0,0,30,30 * 86400,2,1,30,'Flow free package'),
  ('find-dumps','pro','Find Dumps Pro 30 ngày','Gói Pro mạnh nhất.',true,'plan','pro',0,0,30,30 * 86400,3,1,40,'Flow free package'),
  ('find-dumps','credit-normal','Find Dumps +5 credit thường','Code credit thường một lần cho ví soft.',true,'soft_credit',null,5,0,0,72 * 3600,null,null,100,'Dùng cho luồng quà credit thường.'),
  ('find-dumps','credit-vip','Find Dumps +0.2 credit VIP','Code credit VIP hiếm, một lần cho ví VIP.',true,'premium_credit',null,0,0.2,0,72 * 3600,null,null,110,'Dùng cho luồng quà credit VIP.')
on conflict (app_code, package_code) do update
set title = excluded.title, description = excluded.description, enabled = excluded.enabled, reward_mode = excluded.reward_mode, plan_code = excluded.plan_code, soft_credit_amount = excluded.soft_credit_amount, premium_credit_amount = excluded.premium_credit_amount, entitlement_days = excluded.entitlement_days, entitlement_seconds = excluded.entitlement_seconds, device_limit_override = excluded.device_limit_override, account_limit_override = excluded.account_limit_override, sort_order = excluded.sort_order, notes = excluded.notes;

insert into public.licenses_free_key_types (code,label,duration_seconds,kind,value,sort_order,enabled,app_code,app_label,key_signature,allow_reset,free_selection_mode,free_selection_expand,default_package_code,default_credit_code,default_wallet_kind)
values
  ('fd_package','Find Dumps Go 3 ngày',3 * 86400,'day',3,302,true,'find-dumps','Find Dumps','SUNNY',false,'package',true,'go',null,null),
  ('fdd7','Find Dumps Go 7 ngày',7 * 86400,'day',7,303,true,'find-dumps','Find Dumps','SUNNY',false,'package',true,'go',null,null),
  ('fdd30','Find Dumps Plus 30 ngày',30 * 86400,'day',30,304,true,'find-dumps','Find Dumps','SUNNY',false,'package',true,'plus',null,null),
  ('fd_credit','Find Dumps credit',72 * 3600,'day',3,310,true,'find-dumps','Find Dumps','SUNNY',false,'credit',true,null,'credit-normal','normal')
on conflict (code) do update
set label = excluded.label, duration_seconds = excluded.duration_seconds, kind = excluded.kind, value = excluded.value, sort_order = excluded.sort_order, enabled = excluded.enabled, app_code = excluded.app_code, app_label = excluded.app_label, key_signature = excluded.key_signature, allow_reset = excluded.allow_reset, free_selection_mode = excluded.free_selection_mode, free_selection_expand = excluded.free_selection_expand, default_package_code = excluded.default_package_code, default_credit_code = excluded.default_credit_code, default_wallet_kind = excluded.default_wallet_kind;

update public.licenses_free_key_types
set label = coalesce(nullif(label, ''), case when free_selection_mode = 'credit' then 'Find Dumps credit' else 'Find Dumps package' end),
    app_code = 'find-dumps',
    app_label = coalesce(nullif(app_label, ''), 'Find Dumps'),
    key_signature = coalesce(nullif(key_signature, ''), 'SUNNY'),
    free_selection_expand = true,
    updated_at = now()
where app_code = 'find-dumps'
   or code in ('fd_package','fdd7','fdd30','fd_credit');
