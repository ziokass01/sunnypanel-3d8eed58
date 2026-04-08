alter table public.server_app_wallet_rules
add column if not exists consume_priority text not null default 'soft_first';

update public.server_app_wallet_rules
set consume_priority = case
  when app_code = 'find-dumps' then 'soft_first'
  else coalesce(consume_priority, 'soft_first')
end
where consume_priority is distinct from case
  when app_code = 'find-dumps' then 'soft_first'
  else coalesce(consume_priority, 'soft_first')
end;

alter table public.server_app_wallet_rules
drop constraint if exists server_app_wallet_rules_consume_priority_check;

alter table public.server_app_wallet_rules
add constraint server_app_wallet_rules_consume_priority_check
check (consume_priority in ('soft_first', 'premium_first'));
