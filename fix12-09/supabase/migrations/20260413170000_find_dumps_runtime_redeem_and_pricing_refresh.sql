-- Refresh Find Dumps pricing + reward aliases + free-key defaults
-- Defensive self-heal: re-add columns/rows in case legacy markers were repaired but old migrations were missing remotely.

insert into public.server_apps (code, label, description, public_enabled, notes)
values ('find-dumps', 'Find Dumps', 'App SunnyMod Find Dumps để cấu hình gói, credit và feature flags riêng.', true, '2026-04-13 self-heal bootstrap before pricing refresh.')
on conflict (code) do update
set label = excluded.label,
    description = excluded.description,
    public_enabled = excluded.public_enabled,
    notes = excluded.notes,
    updated_at = now();

alter table public.server_app_settings
  add column if not exists gift_tab_label text not null default 'Quà tặng';

alter table public.server_app_wallet_rules
  add column if not exists consume_priority text not null default 'soft_first',
  add column if not exists soft_daily_reset_mode text not null default 'debt_floor',
  add column if not exists premium_daily_reset_mode text not null default 'debt_floor',
  add column if not exists soft_floor_credit numeric(12,2) not null default 5,
  add column if not exists premium_floor_credit numeric(12,2) not null default 5,
  add column if not exists soft_allow_negative boolean not null default true,
  add column if not exists premium_allow_negative boolean not null default true;

alter table public.server_app_features
  add column if not exists category text not null default 'tools',
  add column if not exists group_key text not null default 'general',
  add column if not exists icon_key text,
  add column if not exists badge_label text,
  add column if not exists visible_to_guest boolean not null default true,
  add column if not exists charge_unit integer not null default 1,
  add column if not exists charge_on_success_only boolean not null default true,
  add column if not exists client_accumulate_units boolean not null default false;

alter table public.server_app_reward_packages
  add column if not exists entitlement_seconds bigint not null default 0;

alter table public.licenses_free_key_types
  add column if not exists app_code text not null default 'free-fire',
  add column if not exists app_label text,
  add column if not exists key_signature text,
  add column if not exists allow_reset boolean not null default true,
  add column if not exists free_selection_mode text not null default 'none',
  add column if not exists free_selection_expand boolean not null default false,
  add column if not exists default_package_code text,
  add column if not exists default_credit_code text,
  add column if not exists default_wallet_kind text;

insert into public.server_app_settings (app_code, guest_plan, gift_tab_label, key_persist_until_revoked, daily_reset_hour, notes)
values ('find-dumps', 'classic', 'Mã quà', true, 0, '2026-04-13 self-heal row for pricing refresh.')
on conflict (app_code) do update
set guest_plan = excluded.guest_plan,
    gift_tab_label = excluded.gift_tab_label,
    key_persist_until_revoked = excluded.key_persist_until_revoked,
    daily_reset_hour = excluded.daily_reset_hour,
    notes = concat_ws(E'\n', nullif(public.server_app_settings.notes, ''), excluded.notes),
    updated_at = now();

insert into public.server_app_wallet_rules (
  app_code, soft_wallet_label, premium_wallet_label, allow_decimal,
  soft_daily_reset_enabled, premium_daily_reset_enabled,
  soft_daily_reset_amount, premium_daily_reset_amount, notes
)
values ('find-dumps', 'Credit thường', 'Credit VIP', true, true, true, 5, 0, '2026-04-13 self-heal wallet row before pricing refresh.')
on conflict (app_code) do nothing;


update public.server_app_settings
set guest_plan = 'classic',
    gift_tab_label = 'Mã quà',
    notes = concat_ws(E'\n', nullif(notes, ''), '2026-04-13: pricing refresh for Find Dumps, redeem alias enabled, classic reset 5/day.')
where app_code = 'find-dumps';

insert into public.server_app_plans (
  app_code, plan_code, label, enabled, daily_soft_credit, daily_premium_credit,
  soft_cost_multiplier, premium_cost_multiplier, device_limit, account_limit, sort_order
)
values
  ('find-dumps','classic','Classic',true,5,0,1,1,1,1,10),
  ('find-dumps','go','Go',true,15,0,0.75,0.65,1,1,20),
  ('find-dumps','plus','Plus',true,80,8,0.25,0.18,2,1,30),
  ('find-dumps','pro','Pro',true,250,25,0.08,0.05,3,1,40)
on conflict (app_code, plan_code) do update
set label = excluded.label,
    enabled = excluded.enabled,
    daily_soft_credit = excluded.daily_soft_credit,
    daily_premium_credit = excluded.daily_premium_credit,
    soft_cost_multiplier = excluded.soft_cost_multiplier,
    premium_cost_multiplier = excluded.premium_cost_multiplier,
    device_limit = excluded.device_limit,
    account_limit = excluded.account_limit,
    sort_order = excluded.sort_order,
    updated_at = now();

update public.server_app_wallet_rules
set soft_daily_reset_enabled = true,
    premium_daily_reset_enabled = true,
    soft_daily_reset_amount = 5,
    premium_daily_reset_amount = 0,
    consume_priority = 'soft_first',
    soft_daily_reset_mode = 'debt_floor',
    premium_daily_reset_mode = 'debt_floor',
    soft_floor_credit = 5,
    premium_floor_credit = 0,
    soft_allow_negative = true,
    premium_allow_negative = true,
    notes = concat_ws(E'\n', nullif(notes, ''), '2026-04-13: classic reset 5/day; plan table controls higher quotas.')
where app_code = 'find-dumps';

insert into public.server_app_features (
  app_code, feature_code, title, description, enabled, min_plan, requires_credit,
  soft_cost, premium_cost, reset_period, sort_order,
  category, group_key, icon_key, badge_label, visible_to_guest,
  charge_unit, charge_on_success_only, client_accumulate_units
)
values
  ('find-dumps','search_basic','Tra cứu / kiểm tra dump','Tra cứu nhanh và soi dump cơ bản. Đây là mục free duy nhất để user thử app.',true,'classic',false,0,0,'daily',10,'search','find','search','Miễn phí',true,1,true,false),
  ('find-dumps','batch_search','Batch search','Tìm kiếm diện rộng. Cứ đủ 10 dòng hợp lệ mới tính 1 lượt charge để tránh gọi server quá dày.',true,'classic',true,1,0.5,'daily',20,'search','batch','batch','10 dòng / 1 lượt',true,10,true,true),
  ('find-dumps','export_plain','Export text','Xuất kết quả hiện tại ra file text thường.',true,'classic',true,0.5,0.2,'daily',25,'export','result','export','Trả phí',true,1,true,false),
  ('find-dumps','export_json','Export JSON','Xuất kết quả dạng JSON có cấu trúc.',true,'go',true,1,0.4,'daily',30,'export','result','json','Trả phí',true,1,true,false),
  ('find-dumps','background_queue','Background queue','Xử lý batch nền và ưu tiên hàng đợi.',true,'plus',true,5,2,'daily',40,'search','batch','queue','Nặng',false,1,true,false),
  ('find-dumps','game_profiles','Game Profiles','Lưu, import, export và quét nhiều offset theo profile. Tính phí nhẹ mỗi lần mở khu tool để tránh free toàn bộ.',true,'classic',true,1,0.35,'daily',45,'tools','profile','profile','Theo lượt',true,1,true,false),
  ('find-dumps','runtime_redeem','Nhập mã / kích hoạt','Mở Runtime Center để nhập mã quà và đồng bộ session.',true,'classic',false,0,0,'daily',47,'runtime','redeem','gift','Tiện ích',true,1,true,false),
  ('find-dumps','convert_image','Convert image','Đổi ảnh sang header .h. Cứ đủ 5 lượt thành công mới tính 1 lần charge.',true,'classic',true,1,0.4,'daily',50,'tools','image','image','5 lượt / 1 credit',true,5,true,true),
  ('find-dumps','encode_decode','Encode / Decode','Bộ codec kiểu toolbox. Cứ đủ 10 lượt xử lý thành công mới tính 1 lần charge.',true,'classic',true,1,0.35,'daily',60,'tools','codec','codec','10 lượt / 1 credit',true,10,true,true),
  ('find-dumps','hex_edit','Hex edit','Mở file và sửa hex rồi lưu. Tính phí nhẹ khi lưu để tránh tool bị free hoàn toàn.',true,'classic',true,0.5,0.2,'daily',70,'tools','hex','hex','3 lần lưu / 1 credit',true,3,true,true)
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

insert into public.server_app_reward_packages (
  app_code, package_code, title, description, enabled, reward_mode, plan_code,
  soft_credit_amount, premium_credit_amount, entitlement_days, entitlement_seconds,
  device_limit_override, account_limit_override, sort_order, notes
)
values
  ('find-dumps','classic','Find Dumps Classic 3 ngày','Gói cơ bản để test app với 5 credit/ngày.',true,'plan','classic',0,0,3,259200,1,1,10,'Alias package_code cho flow quà tặng và test.'),
  ('find-dumps','go','Find Dumps Go 3 ngày','Mở plan Go trong 3 ngày, reset 15 credit/ngày và giảm giá nhẹ khi dùng chức năng.',true,'mixed','go',5,0,3,259200,1,1,20,'Gói dùng cho redeem key và flow quà tặng.'),
  ('find-dumps','plus','Find Dumps Plus 30 ngày','Mở plan Plus với quota lớn mỗi ngày, hợp người dùng thường xuyên.',true,'mixed','plus',20,2,30,2592000,2,1,30,'Gói vài trăm lượt/ngày nếu dùng tool đúng loại.'),
  ('find-dumps','pro','Find Dumps Pro 30 ngày','Mở full plan Pro, quota rất lớn mỗi ngày và giá hao rẻ mạnh.',true,'mixed','pro',50,5,30,2592000,3,1,40,'Gói dùng nhiều, mục tiêu lên tới hàng nghìn lượt/ngày ở các tool charge theo mốc.'),
  ('find-dumps','credit-normal','Find Dumps +5 credit thường','Code credit thường một lần cho ví soft.',true,'soft_credit',null,5,0,0,259200,1,1,100,'Dùng cho luồng quà credit thường.'),
  ('find-dumps','credit-vip','Find Dumps +5 credit VIP','Code credit VIP một lần cho ví premium.',true,'premium_credit',null,0,5,0,259200,1,1,110,'Dùng cho luồng quà credit VIP.')
on conflict (app_code, package_code) do update
set title = excluded.title,
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

update public.server_app_reward_packages
set enabled = false,
    notes = concat_ws(E'\n', nullif(notes, ''), '2026-04-13: disabled in favor of classic/go/plus/pro aliases.')
where app_code = 'find-dumps'
  and package_code in ('fd_go_7d','fd_plus_30d','fd_pro_30d');

update public.licenses_free_key_types
set free_selection_mode = case when code in ('fd_credit') then 'credit' else 'package' end,
    default_package_code = case when code in ('fdh1','fdd1','fd_package','fdd7') then 'go' when code = 'fdd30' then 'plus' else default_package_code end,
    default_credit_code = case when code = 'fd_credit' then 'credit-normal' else default_credit_code end,
    default_wallet_kind = case when code = 'fd_credit' then 'normal' else default_wallet_kind end,
    app_code = 'find-dumps',
    label = case when code in ('fdh1','fdd1','fd_package') then 'Find Dumps Go 3 ngày' else label end,
    duration_seconds = case when code in ('fdh1','fdd1','fd_package') then 259200 else duration_seconds end,
    kind = case when code in ('fdh1','fdd1','fd_package') then 'day' else kind end,
    value = case when code in ('fdh1','fdd1','fd_package') then 3 else value end
where app_code = 'find-dumps'
  and code in ('fdh1','fdd1','fd_package','fdd7','fdd30','fd_credit');
