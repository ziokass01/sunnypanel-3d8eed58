alter table public.server_app_plans
  add column if not exists soft_balance_cap numeric(12,2) not null default 0,
  add column if not exists premium_balance_cap numeric(12,2) not null default 0;

update public.server_app_plans
set daily_soft_credit = case lower(plan_code)
      when 'classic' then 5
      when 'go' then 6
      when 'plus' then 20
      when 'pro' then 50
      else daily_soft_credit
    end,
    daily_premium_credit = case lower(plan_code)
      when 'classic' then 0
      when 'go' then 0.10
      when 'plus' then 0.50
      when 'pro' then 1
      else daily_premium_credit
    end,
    soft_balance_cap = case lower(plan_code)
      when 'classic' then 5
      when 'go' then 30
      when 'plus' then 200
      when 'pro' then 1000
      else soft_balance_cap
    end,
    premium_balance_cap = case lower(plan_code)
      when 'classic' then 0
      when 'go' then 1
      when 'plus' then 10
      when 'pro' then 30
      else premium_balance_cap
    end,
    soft_cost_multiplier = case lower(plan_code)
      when 'classic' then 1
      when 'go' then 0.95
      when 'plus' then 0.80
      when 'pro' then 0.65
      else soft_cost_multiplier
    end,
    premium_cost_multiplier = case lower(plan_code)
      when 'classic' then 1
      when 'go' then 0.85
      when 'plus' then 0.65
      when 'pro' then 0.45
      else premium_cost_multiplier
    end
where app_code = 'find-dumps';

update public.server_app_wallet_rules
set soft_daily_reset_amount = 5,
    premium_daily_reset_amount = 0,
    soft_floor_credit = 5,
    premium_floor_credit = 0,
    soft_daily_reset_enabled = true,
    premium_daily_reset_enabled = true,
    notes = 'Classic dùng cơ chế floor 5 credit. Go/Plus/Pro cộng dồn theo ngày nhưng bị chặn bởi balance cap của plan.'
where app_code = 'find-dumps';

update public.server_app_reward_packages
set soft_credit_amount = case lower(package_code)
      when 'credit-normal' then 5
      else soft_credit_amount
    end,
    premium_credit_amount = case lower(package_code)
      when 'credit-vip' then 0.30
      else premium_credit_amount
    end,
    entitlement_seconds = case lower(package_code)
      when 'credit-normal' then 72 * 3600
      when 'credit-vip' then 72 * 3600
      else entitlement_seconds
    end,
    description = case lower(package_code)
      when 'credit-normal' then 'Code credit thường, hết hạn sau 72 giờ.'
      when 'credit-vip' then 'Code credit VIP hiếm, hết hạn sau 72 giờ.'
      else description
    end
where app_code = 'find-dumps';

update public.server_app_features
set soft_cost = case lower(feature_code)
      when 'batch_search' then 0.20
      when 'export_plain' then 0.05
      when 'export_json' then 0.10
      when 'workspace_browser' then 0.50
      when 'binary_scan_full' then 1.00
      when 'dumps_soc_analyzer' then 1.50
      else soft_cost
    end,
    premium_cost = case lower(feature_code)
      when 'batch_search' then 0
      when 'export_plain' then 0
      when 'export_json' then 0
      when 'workspace_browser' then 0.05
      when 'binary_scan_full' then 0.10
      when 'dumps_soc_analyzer' then 0.15
      else premium_cost
    end
where app_code = 'find-dumps';

update public.server_app_feature_unlock_rules
set soft_unlock_cost = case lower(access_code)
      when 'unlock_binary_workspace' then 0.50
      when 'unlock_batch_tools' then 0.20
      when 'unlock_export_tools' then 0.10
      when 'unlock_migration_tools' then 0.40
      when 'unlock_dumps_soc' then 0.30
      else soft_unlock_cost
    end,
    premium_unlock_cost = case lower(access_code)
      when 'unlock_binary_workspace' then 0.05
      when 'unlock_batch_tools' then 0
      when 'unlock_export_tools' then 0
      when 'unlock_migration_tools' then 0.04
      when 'unlock_dumps_soc' then 0.03
      else premium_unlock_cost
    end,
    soft_unlock_cost_7d = case lower(access_code)
      when 'unlock_binary_workspace' then 2.00
      when 'unlock_batch_tools' then 1.00
      when 'unlock_export_tools' then 0.50
      when 'unlock_migration_tools' then 1.60
      when 'unlock_dumps_soc' then 1.20
      else soft_unlock_cost_7d
    end,
    premium_unlock_cost_7d = case lower(access_code)
      when 'unlock_binary_workspace' then 0.20
      when 'unlock_batch_tools' then 0.10
      when 'unlock_export_tools' then 0
      when 'unlock_migration_tools' then 0.16
      when 'unlock_dumps_soc' then 0.12
      else premium_unlock_cost_7d
    end,
    soft_unlock_cost_30d = case lower(access_code)
      when 'unlock_binary_workspace' then 6.00
      when 'unlock_batch_tools' then 3.00
      when 'unlock_export_tools' then 1.50
      when 'unlock_migration_tools' then 4.80
      when 'unlock_dumps_soc' then 3.60
      else soft_unlock_cost_30d
    end,
    premium_unlock_cost_30d = case lower(access_code)
      when 'unlock_binary_workspace' then 0.60
      when 'unlock_batch_tools' then 0.30
      when 'unlock_export_tools' then 0.10
      when 'unlock_migration_tools' then 0.48
      when 'unlock_dumps_soc' then 0.36
      else premium_unlock_cost_30d
    end
where app_code = 'find-dumps';
