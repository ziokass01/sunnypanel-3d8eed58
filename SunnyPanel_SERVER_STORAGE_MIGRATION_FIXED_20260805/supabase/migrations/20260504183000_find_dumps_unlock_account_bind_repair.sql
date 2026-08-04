-- Hotfix 2026-05-04: Find Dumps feature unlocks must bind account-wide.
-- Symptom in app: "Quyen mo khoa nay da co tren may chu nhung phien hien tai chua bam lai dung ban ghi".
-- Root cause: active unlock row exists on server, but legacy rows can be device-bound / duplicated / mixed-case,
-- so the current runtime session can hit duplicate/existing state while the catalog still shows the gate locked.
-- Scope: find-dumps only. Does not touch Fake Lag policy/APK.

-- 0) Make sure the columns used by newer unlock rules exist before re-seeding pricing.
alter table if exists public.server_app_feature_unlock_rules
  add column if not exists soft_unlock_cost_7d numeric(12,2) not null default 0,
  add column if not exists premium_unlock_cost_7d numeric(12,2) not null default 0,
  add column if not exists soft_unlock_cost_30d numeric(12,2) not null default 0,
  add column if not exists premium_unlock_cost_30d numeric(12,2) not null default 0;

alter table if exists public.server_app_feature_unlocks
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists unlock_source text,
  add column if not exists trace_id text,
  add column if not exists device_id text;

-- 1) Re-seed the current Find Dumps unlock rules from server side.
-- These are the access codes the app should send/open. Prices stay server-controlled.
insert into public.server_app_feature_unlock_rules (
  app_code, access_code, title, description, enabled, unlock_required, unlock_duration_seconds,
  soft_unlock_cost, premium_unlock_cost, soft_unlock_cost_7d, premium_unlock_cost_7d,
  soft_unlock_cost_30d, premium_unlock_cost_30d, free_for_plans, guarded_feature_codes,
  renewable, revalidate_online, sort_order, notes
) values
  ('find-dumps','unlock_binary_workspace','Binary Workspace',
   'Mo quyen vao Binary Workspace. Sau khi mo khoa, scan/browser sau/diff/export van tru credit theo feature rieng.',
   true,true,86400,2,0.1,10,0.5,30,1.5,array['pro'],array['binary_scan_quick','binary_scan_full','ida_export_import','ida_workspace_save','ida_workspace_export','ida_workspace_restore','workspace_batch','workspace_note','workspace_export_result','workspace_browser','workspace_diff'],true,true,310,
   'Gia goc server. App nhan gia sau giam theo goi hien tai.'),
  ('find-dumps','unlock_batch_tools','Batch Search & dien rong',
   'Mo quyen cho batch search, profile search va hang doi nen. Mo khoa chi mo cua; luot chay van tinh credit rieng.',
   true,true,86400,1,0,5,0,15,0,array['plus','pro'],array['batch_search','background_queue','profile_search'],true,true,320,
   'Gia goc server.'),
  ('find-dumps','unlock_export_tools','Export ra ngoai',
   'Mo quyen xuat TXT/JSON/CSV va dau ra lon. Luot export van tinh credit theo rule export.',
   true,true,86400,1,0,4,0,12,0,array['go','plus','pro'],array['export_plain','export_text','export_json','workspace_export_result','ida_workspace_export'],true,true,330,
   'Gia goc server.'),
  ('find-dumps','unlock_migration_tools','Diff / Remap / Migrate',
   'Mo quyen Diff, Remap, Migrate, Compare va Validation. Mo khoa chi mo cua; tac vu lon van tinh credit rieng.',
   true,true,86400,1.5,0.08,7,0.35,21,1.05,array['plus','pro'],array['diff_two_dumps','query_remap','batch_migrate','batch_compare','batch_validate','export_report'],true,true,340,
   'Gia goc server.'),
  ('find-dumps','unlock_dumps_soc','Dumps so.c',
   'Mo quyen phan tich file decompile .so.c bang rule engine rieng. Tinh nang nay tach rieng khoi Binary Workspace.',
   true,true,86400,2,0.1,9,0.45,27,1.35,array['pro'],array['dumps_soc_analyzer'],true,true,350,
   'Gia goc server: 1 ngay thuong 2/VIP 0.1. Vi du goi Go giam 10% thi app tru thuong 1.8.')
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
  notes = excluded.notes,
  updated_at = now();

-- 2) Keep matching catalog feature rows present. This is server catalog only; no APK rebuild.
insert into public.server_app_features (
  app_code, feature_code, title, description, enabled, min_plan, requires_credit,
  soft_cost, premium_cost, reset_period, sort_order,
  category, group_key, icon_key, badge_label, visible_to_guest,
  charge_unit, charge_on_success_only, client_accumulate_units
) values
  ('find-dumps','unlock_migration_tools','Mo khoa Diff / Remap / Migrate','Quyen vao khu nang phien ban dump de dung Diff, Remap, Migrate va Validation.',true,'classic',true,0,0,'daily',335,'unlock','access','lock','Mo khoa',true,1,true,false),
  ('find-dumps','unlock_dumps_soc','Mo khoa Dumps so.c','Quyen phan tich file decompile .so.c bang rule engine rieng.',true,'classic',true,0,0,'daily',345,'unlock','access','lock','Mo khoa',true,1,true,false),
  ('find-dumps','dumps_soc_analyzer','Dumps so.c analyzer','Phan tich file decompile .so.c bang rule engine rieng.',true,'classic',true,0.6,0.2,'daily',350,'binary','soc','binary','Dumps so.c',true,1,true,false)
on conflict (app_code, feature_code) do update set
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

-- 3) Expire rows that are technically still status='active' but have already passed expires_at.
-- The unique index ignores expires_at, so these stale rows can block repair/renewal.
update public.server_app_feature_unlocks
set status = 'expired',
    revoked_at = coalesce(revoked_at, now()),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'expired_by', '20260504183000_find_dumps_unlock_account_bind_repair',
      'expired_by_reason', 'expires_at_already_passed',
      'expired_by_at', now()
    ),
    updated_at = now()
where lower(app_code) = 'find-dumps'
  and status = 'active'
  and revoked_at is null
  and expires_at is not null
  and expires_at <= now();

-- 4) Collapse duplicate active rows before making unlocks account-wide.
-- Winner = row with the longest remaining expiry, then newest start/create time.
with ranked as (
  select
    id,
    row_number() over (
      partition by lower(trim(app_code)), lower(trim(access_code)), lower(trim(account_ref))
      order by
        case when expires_at is null then 1 else 0 end desc,
        expires_at desc nulls first,
        started_at desc nulls last,
        created_at desc nulls last,
        id desc
    ) as rn
  from public.server_app_feature_unlocks
  where lower(app_code) = 'find-dumps'
    and status = 'active'
    and revoked_at is null
    and (expires_at is null or expires_at > now())
)
update public.server_app_feature_unlocks u
set status = 'expired',
    revoked_at = now(),
    metadata = coalesce(u.metadata, '{}'::jsonb) || jsonb_build_object(
      'collapsed_by', '20260504183000_find_dumps_unlock_account_bind_repair',
      'collapsed_reason', 'duplicate_active_account_unlock',
      'collapsed_at', now()
    ),
    updated_at = now()
from ranked r
where u.id = r.id
  and r.rn > 1;

-- 5) Convert the remaining active Find Dumps unlocks to canonical account-wide rows.
-- This is the core fix for server has-row / session not-bound mismatch.
update public.server_app_feature_unlocks
set app_code = 'find-dumps',
    access_code = lower(trim(access_code)),
    account_ref = lower(trim(account_ref)),
    device_id = null,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'account_bound_by', '20260504183000_find_dumps_unlock_account_bind_repair',
      'account_bound_at', now()
    ),
    updated_at = now()
where lower(app_code) = 'find-dumps'
  and status = 'active'
  and revoked_at is null
  and (expires_at is null or expires_at > now());

-- 6) Align live Find Dumps sessions to lowercase account_ref so runtime lookup does not miss by case.
update public.server_app_sessions
set app_code = 'find-dumps',
    account_ref = lower(trim(account_ref)),
    updated_at = now()
where lower(app_code) = 'find-dumps'
  and account_ref is not null
  and account_ref <> lower(trim(account_ref));

-- 7) Replace the old device-scoped active uniqueness with account-wide active uniqueness.
-- This prevents the same account from getting another active row on a different/new device.
drop index if exists public.server_app_feature_unlocks_active_unique;

create unique index if not exists server_app_feature_unlocks_active_account_unique
  on public.server_app_feature_unlocks(app_code, access_code, account_ref)
  where status = 'active' and revoked_at is null;

-- 8) If credit was already charged for an unlock but no active visible unlock row exists, recreate it account-wide.
-- This prevents double-charging after the duplicate/bind bug.
insert into public.server_app_feature_unlocks (
  app_code,
  access_code,
  account_ref,
  device_id,
  status,
  unlock_source,
  started_at,
  expires_at,
  trace_id,
  metadata,
  updated_at
)
select
  charged.app_code,
  charged.access_code,
  charged.account_ref,
  null,
  'active',
  'repair_from_charged_unlock_transaction_20260504',
  charged.created_at,
  greatest(
    now() + interval '1 hour',
    charged.created_at + make_interval(secs => charged.duration_seconds)
  ),
  charged.trace_id,
  jsonb_build_object(
    'repaired_by', '20260504183000_find_dumps_unlock_account_bind_repair',
    'wallet_transaction_id', charged.id,
    'original_created_at', charged.created_at,
    'soft_delta', charged.soft_delta,
    'premium_delta', charged.premium_delta
  ) || coalesce(charged.metadata, '{}'::jsonb),
  now()
from (
  select distinct on (lower(t.app_code), lower(t.feature_code), lower(t.account_ref))
    t.id,
    lower(t.app_code) as app_code,
    lower(t.feature_code) as access_code,
    lower(trim(t.account_ref)) as account_ref,
    coalesce(t.created_at, now()) as created_at,
    coalesce(t.soft_delta, 0) as soft_delta,
    coalesce(t.premium_delta, 0) as premium_delta,
    coalesce(t.metadata, '{}'::jsonb) as metadata,
    t.metadata->>'trace_id' as trace_id,
    greatest(3600, coalesce(
      case when coalesce(t.metadata->>'duration_seconds','') ~ '^[0-9]+$' then (t.metadata->>'duration_seconds')::int else null end,
      r.unlock_duration_seconds,
      86400
    )) as duration_seconds
  from public.server_app_wallet_transactions t
  join public.server_app_feature_unlock_rules r
    on lower(r.app_code) = lower(t.app_code)
   and lower(r.access_code) = lower(t.feature_code)
  where lower(t.app_code) = 'find-dumps'
    and coalesce(t.transaction_type,'') = 'consume'
    and (coalesce(t.soft_delta,0) < 0 or coalesce(t.premium_delta,0) < 0)
    and lower(coalesce(t.feature_code,'')) in (
      'unlock_binary_workspace',
      'unlock_batch_tools',
      'unlock_export_tools',
      'unlock_migration_tools',
      'unlock_dumps_soc'
    )
    and coalesce(t.created_at, now()) >= now() - interval '90 days'
  order by lower(t.app_code), lower(t.feature_code), lower(t.account_ref), coalesce(t.created_at, now()) desc
) charged
where charged.account_ref <> ''
  and not exists (
    select 1
    from public.server_app_feature_unlocks u
    where u.app_code = charged.app_code
      and u.access_code = charged.access_code
      and u.account_ref = charged.account_ref
      and u.status = 'active'
      and u.revoked_at is null
      and (u.expires_at is null or u.expires_at > now())
  )
on conflict do nothing;

-- 9) Touch updated_at again for any repaired active unlock so heartbeat/catalog returns fresh state.
update public.server_app_feature_unlocks
set updated_at = now()
where app_code = 'find-dumps'
  and status = 'active'
  and revoked_at is null
  and (expires_at is null or expires_at > now())
  and lower(access_code) in (
    'unlock_binary_workspace',
    'unlock_batch_tools',
    'unlock_export_tools',
    'unlock_migration_tools',
    'unlock_dumps_soc'
  );
