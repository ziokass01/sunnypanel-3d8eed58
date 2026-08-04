-- Deep redeem runtime logic support:
-- - per-key lookup indexes for account/device/ip counting
-- - clarify metadata columns used by Create Redeem rules

create index if not exists server_app_sessions_redeem_key_account_idx
  on public.server_app_sessions(app_code, redeem_key_id, account_ref, created_at desc)
  where redeem_key_id is not null;

create index if not exists server_app_sessions_redeem_key_device_idx
  on public.server_app_sessions(app_code, redeem_key_id, device_id, created_at desc)
  where redeem_key_id is not null;

create index if not exists server_app_sessions_redeem_key_ip_idx
  on public.server_app_sessions(app_code, redeem_key_id, ip_hash, created_at desc)
  where redeem_key_id is not null and ip_hash is not null;

comment on column public.server_app_redeem_keys.max_redeems_per_ip is '0 = unlimited. Counted per redeem key via session history.';
comment on column public.server_app_redeem_keys.max_redeems_per_device is '0 = unlimited. Counted per redeem key via session history.';
comment on column public.server_app_redeem_keys.max_redeems_per_account is '0 = unlimited. Counted per redeem key via session history.';
comment on column public.server_app_redeem_keys.same_plan_credit_only is 'If true, same-plan redeem defaults to credit-only unless allow_same_plan_extension also decides to extend.';
comment on column public.server_app_redeem_keys.keep_higher_plan is 'If true, lower-plan redeem will not downgrade an account already on a higher plan.';
comment on column public.server_app_redeem_keys.apply_plan_if_higher is 'If true, a higher-plan redeem upgrades the account plan before creating session.';
