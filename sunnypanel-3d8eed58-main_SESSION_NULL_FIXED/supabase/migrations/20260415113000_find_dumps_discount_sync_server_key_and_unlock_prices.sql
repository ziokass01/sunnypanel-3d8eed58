-- Rebalance Find Dumps plans, feature prices, unlock tiers, and keep free-flow defaults aligned.

update public.server_app_plans
set daily_soft_credit = case lower(plan_code)
      when 'classic' then 5
      when 'go' then 8
      when 'plus' then 25
      when 'pro' then 60
      else daily_soft_credit end,
    daily_premium_credit = case lower(plan_code)
      when 'classic' then 0
      when 'go' then 0
      when 'plus' then 0.5
      when 'pro' then 1
      else daily_premium_credit end,
    soft_balance_cap = case lower(plan_code)
      when 'classic' then 5
      when 'go' then 40
      when 'plus' then 250
      when 'pro' then 900
      else soft_balance_cap end,
    premium_balance_cap = case lower(plan_code)
      when 'classic' then 0
      when 'go' then 0
      when 'plus' then 6
      when 'pro' then 18
      else premium_balance_cap end,
    soft_cost_multiplier = case lower(plan_code)
      when 'classic' then 1
      when 'go' then 0.92
      when 'plus' then 0.65
      when 'pro' then 0.40
      else soft_cost_multiplier end,
    premium_cost_multiplier = case lower(plan_code)
      when 'classic' then 1
      when 'go' then 0.90
      when 'plus' then 0.55
      when 'pro' then 0.30
      else premium_cost_multiplier end,
    updated_at = now()
where app_code = 'find-dumps';

update public.server_app_wallet_rules
set premium_daily_reset_amount = 0,
    premium_floor_credit = 0,
    soft_allow_negative = false,
    premium_allow_negative = false,
    updated_at = now()
where app_code = 'find-dumps';

update public.server_app_features
set min_plan = case lower(feature_code)
      when 'export_json' then 'go'
      else min_plan end,
    soft_cost = case lower(feature_code)
      when 'batch_search' then 0.20
      when 'export_plain' then 0.05
      when 'export_json' then 0.12
      when 'background_queue' then 0.80
      when 'workspace_browser' then 0.60
      when 'binary_scan_full' then 1.20
      when 'game_profiles' then 0
      when 'convert_image' then 0
      when 'encode_decode' then 0
      when 'hex_edit' then 0
      else soft_cost end,
    premium_cost = case lower(feature_code)
      when 'batch_search' then 0
      when 'export_plain' then 0
      when 'export_json' then 0
      when 'background_queue' then 0.08
      when 'workspace_browser' then 0.05
      when 'binary_scan_full' then 0.08
      else premium_cost end,
    updated_at = now()
where app_code = 'find-dumps';

update public.server_app_feature_unlock_rules
set soft_unlock_cost = case lower(access_code)
      when 'unlock_binary_workspace' then 0.80
      when 'unlock_batch_tools' then 0.25
      when 'unlock_export_tools' then 0.15
      when 'unlock_migration_tools' then 0.45
      when 'unlock_dumps_soc' then 0.50
      else soft_unlock_cost end,
    premium_unlock_cost = case lower(access_code)
      when 'unlock_binary_workspace' then 0.05
      when 'unlock_batch_tools' then 0
      when 'unlock_export_tools' then 0
      when 'unlock_migration_tools' then 0.03
      when 'unlock_dumps_soc' then 0.05
      else premium_unlock_cost end,
    soft_unlock_cost_7d = case lower(access_code)
      when 'unlock_binary_workspace' then 3.50
      when 'unlock_batch_tools' then 1.20
      when 'unlock_export_tools' then 0.70
      when 'unlock_migration_tools' then 2.00
      when 'unlock_dumps_soc' then 2.50
      else soft_unlock_cost_7d end,
    premium_unlock_cost_7d = case lower(access_code)
      when 'unlock_binary_workspace' then 0.20
      when 'unlock_batch_tools' then 0.05
      when 'unlock_export_tools' then 0.05
      when 'unlock_migration_tools' then 0.15
      when 'unlock_dumps_soc' then 0.20
      else premium_unlock_cost_7d end,
    soft_unlock_cost_30d = case lower(access_code)
      when 'unlock_binary_workspace' then 10
      when 'unlock_batch_tools' then 3.50
      when 'unlock_export_tools' then 2.20
      when 'unlock_migration_tools' then 5.80
      when 'unlock_dumps_soc' then 7
      else soft_unlock_cost_30d end,
    premium_unlock_cost_30d = case lower(access_code)
      when 'unlock_binary_workspace' then 0.60
      when 'unlock_batch_tools' then 0.20
      when 'unlock_export_tools' then 0.15
      when 'unlock_migration_tools' then 0.45
      when 'unlock_dumps_soc' then 0.60
      else premium_unlock_cost_30d end,
    enabled = case lower(access_code)
      when 'unlock_migration_tools' then true
      else enabled end,
    updated_at = now()
where app_code = 'find-dumps';

update public.server_app_reward_packages
set title = case lower(package_code)
      when 'credit-normal' then 'Find Dumps +5 credit thường'
      when 'credit-vip' then 'Find Dumps +0.2 credit VIP'
      else title end,
    soft_credit_amount = case lower(package_code)
      when 'credit-normal' then 5
      else soft_credit_amount end,
    premium_credit_amount = case lower(package_code)
      when 'credit-vip' then 0.2
      else premium_credit_amount end,
    entitlement_seconds = case lower(package_code)
      when 'credit-normal' then 72 * 3600
      when 'credit-vip' then 72 * 3600
      else entitlement_seconds end,
    updated_at = now()
where app_code = 'find-dumps';

update public.licenses_free_key_types
set label = coalesce(nullif(label, ''), case when free_selection_mode = 'credit' then 'Find Dumps credit' else 'Find Dumps package' end),
    app_code = 'find-dumps',
    app_label = coalesce(nullif(app_label, ''), 'Find Dumps'),
    key_signature = coalesce(nullif(key_signature, ''), 'SUNNY'),
    free_selection_expand = true,
    updated_at = now()
where app_code = 'find-dumps';
