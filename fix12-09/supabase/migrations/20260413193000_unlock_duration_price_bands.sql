alter table public.server_app_feature_unlock_rules
  add column if not exists soft_unlock_cost_7d numeric not null default 0,
  add column if not exists premium_unlock_cost_7d numeric not null default 0,
  add column if not exists soft_unlock_cost_30d numeric not null default 0,
  add column if not exists premium_unlock_cost_30d numeric not null default 0;

update public.server_app_feature_unlock_rules
set soft_unlock_cost_7d = case when coalesce(soft_unlock_cost_7d, 0) > 0 then soft_unlock_cost_7d else coalesce(soft_unlock_cost, 0) * 3 end,
    premium_unlock_cost_7d = case when coalesce(premium_unlock_cost_7d, 0) > 0 then premium_unlock_cost_7d else coalesce(premium_unlock_cost, 0) * 3 end,
    soft_unlock_cost_30d = case when coalesce(soft_unlock_cost_30d, 0) > 0 then soft_unlock_cost_30d else coalesce(soft_unlock_cost, 0) * 9 end,
    premium_unlock_cost_30d = case when coalesce(premium_unlock_cost_30d, 0) > 0 then premium_unlock_cost_30d else coalesce(premium_unlock_cost, 0) * 9 end
where app_code = 'find-dumps';
