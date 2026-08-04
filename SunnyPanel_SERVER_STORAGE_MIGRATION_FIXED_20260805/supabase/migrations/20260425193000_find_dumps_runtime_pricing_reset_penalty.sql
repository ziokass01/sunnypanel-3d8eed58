
-- Find Dumps only: seed runtime unlock pricing and fix reset penalty accounting.
-- This migration intentionally does not change Fake Lag app code/APK.
-- It only makes shared reset-key/admin reset subtract configured % when a device reset is performed.

-- 1) Find Dumps runtime defaults: base prices stay on server, app receives discounted price by plan multiplier.
insert into public.server_app_plans (
  app_code, plan_code, label, enabled, daily_soft_credit, daily_premium_credit,
  soft_balance_cap, premium_balance_cap, soft_cost_multiplier, premium_cost_multiplier,
  device_limit, account_limit, sort_order
) values
  ('find-dumps','classic','Classic',true,5,0,5,0,1.00,1.00,1,1,10),
  ('find-dumps','go','Go',true,7,0,70,0,0.90,1.00,1,1,20),
  ('find-dumps','plus','Plus',true,20,0.25,200,5,0.65,0.80,1,1,30),
  ('find-dumps','pro','Pro',true,50,0.5,500,10,0.45,0.70,1,1,40)
on conflict (app_code, plan_code) do update set
  label = excluded.label,
  enabled = excluded.enabled,
  daily_soft_credit = excluded.daily_soft_credit,
  daily_premium_credit = excluded.daily_premium_credit,
  soft_balance_cap = excluded.soft_balance_cap,
  premium_balance_cap = excluded.premium_balance_cap,
  soft_cost_multiplier = excluded.soft_cost_multiplier,
  premium_cost_multiplier = excluded.premium_cost_multiplier,
  device_limit = excluded.device_limit,
  account_limit = excluded.account_limit,
  sort_order = excluded.sort_order;

insert into public.server_app_wallet_rules (
  app_code, soft_wallet_label, premium_wallet_label, allow_decimal,
  soft_daily_reset_enabled, premium_daily_reset_enabled,
  soft_daily_reset_amount, premium_daily_reset_amount,
  consume_priority, soft_daily_reset_mode, premium_daily_reset_mode,
  soft_floor_credit, premium_floor_credit, soft_allow_negative, premium_allow_negative,
  notes
) values (
  'find-dumps', 'Credit thường', 'Credit VIP', true,
  true, true, 0, 0,
  'soft_first', 'debt_floor', 'debt_floor',
  0, 0, false, false,
  'Find Dumps: giá gốc ở server; app nhận giá sau giảm theo gói. Không dùng cho Fake Lag.'
)
on conflict (app_code) do update set
  soft_wallet_label = excluded.soft_wallet_label,
  premium_wallet_label = excluded.premium_wallet_label,
  allow_decimal = excluded.allow_decimal,
  consume_priority = excluded.consume_priority,
  soft_daily_reset_mode = excluded.soft_daily_reset_mode,
  premium_daily_reset_mode = excluded.premium_daily_reset_mode,
  notes = excluded.notes;

insert into public.server_app_feature_unlock_rules (
  app_code, access_code, title, description, enabled, unlock_required, unlock_duration_seconds,
  soft_unlock_cost, premium_unlock_cost, soft_unlock_cost_7d, premium_unlock_cost_7d,
  soft_unlock_cost_30d, premium_unlock_cost_30d, free_for_plans, guarded_feature_codes,
  renewable, revalidate_online, sort_order, notes
) values
  ('find-dumps','unlock_binary_workspace','Binary Workspace',
   'Mở quyền vào Binary Workspace. Sau khi mở khóa, scan/browser sâu/diff/export vẫn trừ credit theo feature riêng.',
   true,true,86400,2,0.1,10,0.5,30,1.5,array['pro'],array['binary_scan_quick','binary_scan_full','ida_export_import','ida_workspace_save','ida_workspace_export','ida_workspace_restore','workspace_batch','workspace_note','workspace_export_result','workspace_browser','workspace_diff'],true,true,310,
   'Giá gốc server. App sẽ tự nhận giá sau giảm theo gói hiện tại.'),
  ('find-dumps','unlock_batch_tools','Batch Search & diện rộng',
   'Mở quyền cho batch search, profile search và hàng đợi nền. Mở khóa chỉ mở cửa; lượt chạy vẫn tính credit riêng.',
   true,true,86400,1,0,5,0,15,0,array['plus','pro'],array['batch_search','background_queue','profile_search'],true,true,320,
   'Giá gốc server.'),
  ('find-dumps','unlock_export_tools','Export ra ngoài',
   'Mở quyền xuất TXT/JSON/CSV và đầu ra lớn. Lượt export vẫn tính credit theo rule export.',
   true,true,86400,1,0,4,0,12,0,array['go','plus','pro'],array['export_plain','export_text','export_json','workspace_export_result','ida_workspace_export'],true,true,330,
   'Giá gốc server.'),
  ('find-dumps','unlock_migration_tools','Diff / Remap / Migrate',
   'Mở quyền Diff, Remap, Migrate, Compare và Validation. Mở khóa chỉ mở cửa; tác vụ lớn vẫn tính credit riêng.',
   true,true,86400,1.5,0.08,7,0.35,21,1.05,array['plus','pro'],array['diff_two_dumps','query_remap','batch_migrate','batch_compare','batch_validate','export_report'],true,true,340,
   'Giá gốc server.'),
  ('find-dumps','unlock_dumps_soc','Dumps so.c',
   'Mở quyền phân tích file decompile .so.c bằng rule engine riêng. Tách riêng khỏi Binary Workspace.',
   true,true,86400,2,0.1,9,0.45,27,1.35,array['pro'],array['dumps_soc_analyzer'],true,true,350,
   'Giá gốc server: 1 ngày thường 2/VIP 0.1. Ví dụ gói Go giảm 10% thì app trừ thường 1.8.')
on conflict (app_code, access_code) do update set
  title = excluded.title,
  description = excluded.description,
  enabled = excluded.enabled,
  unlock_required = excluded.unlock_required,
  unlock_duration_seconds = excluded.unlock_duration_seconds,
  soft_unlock_cost = excluded.soft_unlock_cost,
  premium_unlock_cost = excluded.premium_unlock_cost,
  soft_unlock_cost_7d = excluded.soft_unlock_cost_7d,
  premium_unlock_cost_7d = excluded.premium_unlock_cost_7d,
  soft_unlock_cost_30d = excluded.soft_unlock_cost_30d,
  premium_unlock_cost_30d = excluded.premium_unlock_cost_30d,
  free_for_plans = excluded.free_for_plans,
  guarded_feature_codes = excluded.guarded_feature_codes,
  renewable = excluded.renewable,
  revalidate_online = excluded.revalidate_online,
  sort_order = excluded.sort_order,
  notes = excluded.notes;

-- 2) Shared helper: determine whether a license came from public/free get-key or admin/paid key.
create or replace function public.license_reset_key_kind(p_license_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_free boolean := false;
begin
  select exists(
    select 1 from public.licenses_free_issues i where i.license_id = p_license_id
  ) into v_is_free;
  if v_is_free then
    return 'free';
  end if;
  return 'admin';
exception
  when undefined_table then
    return 'admin';
end;
$$;

create or replace function public.license_reset_app_code(p_license_key text)
returns text
language plpgsql
immutable
as $$
declare
  v_key text := upper(coalesce(p_license_key, ''));
begin
  if v_key like 'FAKELAG-%' then return 'fake-lag'; end if;
  if v_key like 'FND-%' or v_key like 'FD-%' then return 'find-dumps'; end if;
  if v_key like 'SUNNY-%' then return 'free-fire'; end if;
  return 'unknown';
end;
$$;

-- 3) Admin reset with penalty. Used by admin reset page. It deletes devices AND subtracts configured %.
create or replace function public.admin_reset_devices_penalty(p_license_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_license record;
  v_settings record;
  v_kind text;
  v_app_code text;
  v_removed int := 0;
  v_prior_count int := 0;
  v_penalty_pct numeric := 0;
  v_now timestamptz := now();
  v_old_expires timestamptz;
  v_new_expires timestamptz;
  v_remaining_seconds numeric := 0;
  v_penalty_seconds numeric := 0;
begin
  select * into v_license
  from public.licenses
  where id = p_license_id
  for update;

  if not found then
    raise exception 'LICENSE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_settings from public.license_reset_settings where id = 1;
  v_kind := public.license_reset_key_kind(p_license_id);
  v_app_code := public.license_reset_app_code(v_license.key);

  select count(*) into v_prior_count
  from public.audit_logs
  where license_key = v_license.key
    and action in ('PUBLIC_RESET','RESET_DEVICES_PENALTY');

  if v_kind = 'free' then
    v_penalty_pct := case when v_prior_count <= 0 then coalesce(v_settings.free_first_penalty_pct, 0) else coalesce(v_settings.free_next_penalty_pct, coalesce(v_settings.free_next_step_penalty_pct, 0)) end;
  else
    v_penalty_pct := case when v_prior_count <= 0 then coalesce(v_settings.paid_first_penalty_pct, 0) else coalesce(v_settings.paid_next_penalty_pct, coalesce(v_settings.paid_next_step_penalty_pct, 0)) end;
  end if;
  v_penalty_pct := greatest(0, least(100, coalesce(v_penalty_pct, 0)));

  delete from public.license_devices where license_id = p_license_id;
  get diagnostics v_removed = row_count;

  v_old_expires := v_license.expires_at;
  if v_penalty_pct > 0 and v_old_expires is not null and v_old_expires > v_now then
    v_remaining_seconds := greatest(0, extract(epoch from (v_old_expires - v_now)));
    v_penalty_seconds := floor(v_remaining_seconds * v_penalty_pct / 100.0);
    v_new_expires := v_old_expires - make_interval(secs => v_penalty_seconds::int);
    if v_new_expires <= v_now then
      v_new_expires := v_now;
    end if;
    update public.licenses
    set expires_at = v_new_expires,
        is_active = case when v_new_expires <= v_now then false else is_active end
    where id = p_license_id;
  else
    v_new_expires := v_old_expires;
  end if;

  insert into public.audit_logs(action, license_key, detail)
  values ('RESET_DEVICES_PENALTY', v_license.key, jsonb_build_object(
    'license_id', p_license_id,
    'app_code', v_app_code,
    'key_kind', v_kind,
    'devices_removed', v_removed,
    'prior_reset_count', v_prior_count,
    'penalty_pct', v_penalty_pct,
    'penalty_seconds', v_penalty_seconds,
    'old_expires_at', v_old_expires,
    'new_expires_at', v_new_expires,
    'source', 'admin'
  ));

  return jsonb_build_object(
    'ok', true,
    'license_id', p_license_id,
    'key', v_license.key,
    'app_code', v_app_code,
    'key_kind', v_kind,
    'devices_removed', v_removed,
    'prior_reset_count', v_prior_count,
    'penalty_pct', v_penalty_pct,
    'penalty_seconds', v_penalty_seconds,
    'old_expires_at', v_old_expires,
    'new_expires_at', v_new_expires,
    'remaining_seconds', case when v_new_expires is null then null else greatest(0, floor(extract(epoch from (v_new_expires - v_now)))) end
  );
end;
$$;

grant execute on function public.admin_reset_devices_penalty(uuid) to authenticated;
grant execute on function public.license_reset_key_kind(uuid) to authenticated;
grant execute on function public.license_reset_app_code(text) to authenticated, anon;
