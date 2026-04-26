begin;

update public.server_app_features
set premium_cost = round((soft_cost::numeric / 20.0), 2)
where app_code = 'find-dumps'
  and coalesce(enabled, true) = true
  and coalesce(requires_credit, false) = true
  and coalesce(soft_cost, 0) > 0
  and coalesce(premium_cost, 0) <= 0;

update public.server_app_feature_unlock_rules
set
  premium_unlock_cost = case
    when coalesce(soft_unlock_cost, 0) > 0 and coalesce(premium_unlock_cost, 0) <= 0
      then round((soft_unlock_cost::numeric / 20.0), 2)
    else premium_unlock_cost
  end,
  premium_unlock_cost_7d = case
    when coalesce(soft_unlock_cost_7d, 0) > 0 and coalesce(premium_unlock_cost_7d, 0) <= 0
      then round((soft_unlock_cost_7d::numeric / 20.0), 2)
    else premium_unlock_cost_7d
  end,
  premium_unlock_cost_30d = case
    when coalesce(soft_unlock_cost_30d, 0) > 0 and coalesce(premium_unlock_cost_30d, 0) <= 0
      then round((soft_unlock_cost_30d::numeric / 20.0), 2)
    else premium_unlock_cost_30d
  end
where app_code = 'find-dumps'
  and coalesce(enabled, true) = true;

commit;
