-- Admin control center audit + richer redeem controls + soft/negative redeem amounts

create table if not exists public.server_app_admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  app_code text not null references public.server_apps(code) on delete cascade,
  account_ref text,
  target_kind text not null default 'account',
  target_value text,
  action text not null,
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint server_app_admin_audit_logs_target_kind_check
    check (target_kind in ('account','device','ip','redeem','setting','feature','session','wallet','entitlement'))
);

create index if not exists server_app_admin_audit_logs_lookup_idx
  on public.server_app_admin_audit_logs(app_code, created_at desc);
create index if not exists server_app_admin_audit_logs_account_idx
  on public.server_app_admin_audit_logs(app_code, account_ref, created_at desc);

alter table public.server_app_admin_audit_logs enable row level security;

drop policy if exists "Admins manage server app admin audit logs" on public.server_app_admin_audit_logs;
create policy "Admins manage server app admin audit logs"
on public.server_app_admin_audit_logs
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

alter table public.server_app_redeem_keys
  add column if not exists max_redeems_per_ip integer not null default 0,
  add column if not exists max_redeems_per_device integer not null default 0,
  add column if not exists max_redeems_per_account integer not null default 0,
  add column if not exists allow_same_plan_extension boolean not null default false,
  add column if not exists apply_days_only_if_greater boolean not null default true,
  add column if not exists same_plan_credit_only boolean not null default true,
  add column if not exists keep_higher_plan boolean not null default true,
  add column if not exists apply_plan_if_higher boolean not null default true;

alter table public.server_app_redeem_keys
  drop constraint if exists server_app_redeem_keys_amounts_check;

alter table public.server_app_redeem_keys
  add constraint server_app_redeem_keys_amounts_check
  check (
    soft_credit_amount >= -999999.99
    and premium_credit_amount >= -999999.99
  );

alter table public.server_app_redeem_keys
  drop constraint if exists server_app_redeem_keys_per_ip_check;

alter table public.server_app_redeem_keys
  add constraint server_app_redeem_keys_per_ip_check
  check (max_redeems_per_ip >= 0 and max_redeems_per_device >= 0 and max_redeems_per_account >= 0);

comment on column public.server_app_redeem_keys.max_redeems_per_ip is '0 = unlimited. Separate from total max_redemptions.';
comment on column public.server_app_redeem_keys.allow_same_plan_extension is 'If true, same-plan redeems may add days when the new day count is greater.';
comment on column public.server_app_redeem_keys.apply_days_only_if_greater is 'If true, only apply entitlement_days when it improves current remaining days.';

