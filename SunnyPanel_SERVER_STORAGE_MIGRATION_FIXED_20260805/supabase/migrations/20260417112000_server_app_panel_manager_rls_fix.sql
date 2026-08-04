create or replace function public.is_server_app_panel_manager(_user_id uuid)
returns boolean
language sql
stable
as $$
  select coalesce(public.has_role(_user_id, 'admin'::public.app_role), false)
      or coalesce(public.has_role(_user_id, 'moderator'::public.app_role), false);
$$;

grant execute on function public.is_server_app_panel_manager(uuid) to authenticated;

-- Core panel tables

drop policy if exists "Admins manage server apps" on public.server_apps;
create policy "Panel managers manage server apps"
on public.server_apps
for all
to authenticated
using (public.is_server_app_panel_manager(auth.uid()))
with check (public.is_server_app_panel_manager(auth.uid()));

drop policy if exists "Admins manage server app settings" on public.server_app_settings;
create policy "Panel managers manage server app settings"
on public.server_app_settings
for all
to authenticated
using (public.is_server_app_panel_manager(auth.uid()))
with check (public.is_server_app_panel_manager(auth.uid()));

drop policy if exists "Admins manage server app plans" on public.server_app_plans;
create policy "Panel managers manage server app plans"
on public.server_app_plans
for all
to authenticated
using (public.is_server_app_panel_manager(auth.uid()))
with check (public.is_server_app_panel_manager(auth.uid()));

drop policy if exists "Admins manage server app features" on public.server_app_features;
create policy "Panel managers manage server app features"
on public.server_app_features
for all
to authenticated
using (public.is_server_app_panel_manager(auth.uid()))
with check (public.is_server_app_panel_manager(auth.uid()));

drop policy if exists "Admins manage server app wallet rules" on public.server_app_wallet_rules;
create policy "Panel managers manage server app wallet rules"
on public.server_app_wallet_rules
for all
to authenticated
using (public.is_server_app_panel_manager(auth.uid()))
with check (public.is_server_app_panel_manager(auth.uid()));

drop policy if exists "Admins manage server app reward packages" on public.server_app_reward_packages;
create policy "Panel managers manage server app reward packages"
on public.server_app_reward_packages
for all
to authenticated
using (public.is_server_app_panel_manager(auth.uid()))
with check (public.is_server_app_panel_manager(auth.uid()));

drop policy if exists "Admins manage server app redeem keys" on public.server_app_redeem_keys;
create policy "Panel managers manage server app redeem keys"
on public.server_app_redeem_keys
for all
to authenticated
using (public.is_server_app_panel_manager(auth.uid()))
with check (public.is_server_app_panel_manager(auth.uid()));

drop policy if exists "Admins manage server app entitlements" on public.server_app_entitlements;
create policy "Panel managers manage server app entitlements"
on public.server_app_entitlements
for all
to authenticated
using (public.is_server_app_panel_manager(auth.uid()))
with check (public.is_server_app_panel_manager(auth.uid()));

drop policy if exists "Admins manage server app wallet balances" on public.server_app_wallet_balances;
create policy "Panel managers manage server app wallet balances"
on public.server_app_wallet_balances
for all
to authenticated
using (public.is_server_app_panel_manager(auth.uid()))
with check (public.is_server_app_panel_manager(auth.uid()));

drop policy if exists "Admins manage server app wallet transactions" on public.server_app_wallet_transactions;
create policy "Panel managers manage server app wallet transactions"
on public.server_app_wallet_transactions
for all
to authenticated
using (public.is_server_app_panel_manager(auth.uid()))
with check (public.is_server_app_panel_manager(auth.uid()));

drop policy if exists "Admins manage server app sessions" on public.server_app_sessions;
create policy "Panel managers manage server app sessions"
on public.server_app_sessions
for all
to authenticated
using (public.is_server_app_panel_manager(auth.uid()))
with check (public.is_server_app_panel_manager(auth.uid()));

drop policy if exists "Admins manage server app runtime controls" on public.server_app_runtime_controls;
create policy "Panel managers manage server app runtime controls"
on public.server_app_runtime_controls
for all
to authenticated
using (public.is_server_app_panel_manager(auth.uid()))
with check (public.is_server_app_panel_manager(auth.uid()));

drop policy if exists "Admins view server app runtime events" on public.server_app_runtime_events;
create policy "Panel managers view server app runtime events"
on public.server_app_runtime_events
for select
to authenticated
using (public.is_server_app_panel_manager(auth.uid()));

drop policy if exists "Service role inserts runtime events" on public.server_app_runtime_events;
create policy "Panel managers insert server app runtime events"
on public.server_app_runtime_events
for insert
to authenticated
with check (public.is_server_app_panel_manager(auth.uid()));

drop policy if exists "Admins manage feature unlock rules" on public.server_app_feature_unlock_rules;
create policy "Panel managers manage feature unlock rules"
on public.server_app_feature_unlock_rules
for all
to authenticated
using (public.is_server_app_panel_manager(auth.uid()))
with check (public.is_server_app_panel_manager(auth.uid()));

drop policy if exists "Admins manage feature unlocks" on public.server_app_feature_unlocks;
create policy "Panel managers manage feature unlocks"
on public.server_app_feature_unlocks
for all
to authenticated
using (public.is_server_app_panel_manager(auth.uid()))
with check (public.is_server_app_panel_manager(auth.uid()));

drop policy if exists "Admins manage server app admin audit logs" on public.server_app_admin_audit_logs;
create policy "Panel managers manage server app admin audit logs"
on public.server_app_admin_audit_logs
for all
to authenticated
using (public.is_server_app_panel_manager(auth.uid()))
with check (public.is_server_app_panel_manager(auth.uid()));

-- Runtime anti-abuse support tables used by Control/Audit pages

drop policy if exists "Admins view runtime counter buckets" on public.server_app_runtime_counter_buckets;
create policy "Panel managers view runtime counter buckets"
on public.server_app_runtime_counter_buckets
for select
to authenticated
using (public.is_server_app_panel_manager(auth.uid()));

drop policy if exists "Service role manages runtime counter buckets" on public.server_app_runtime_counter_buckets;
create policy "Panel managers manage runtime counter buckets"
on public.server_app_runtime_counter_buckets
for all
to authenticated
using (public.is_server_app_panel_manager(auth.uid()))
with check (public.is_server_app_panel_manager(auth.uid()));

drop policy if exists "Admins view runtime account devices" on public.server_app_runtime_account_devices;
create policy "Panel managers view runtime account devices"
on public.server_app_runtime_account_devices
for select
to authenticated
using (public.is_server_app_panel_manager(auth.uid()));

drop policy if exists "Service role manages runtime account devices" on public.server_app_runtime_account_devices;
create policy "Panel managers manage runtime account devices"
on public.server_app_runtime_account_devices
for all
to authenticated
using (public.is_server_app_panel_manager(auth.uid()))
with check (public.is_server_app_panel_manager(auth.uid()));

drop policy if exists "Admins view runtime device accounts" on public.server_app_runtime_device_accounts;
create policy "Panel managers view runtime device accounts"
on public.server_app_runtime_device_accounts
for select
to authenticated
using (public.is_server_app_panel_manager(auth.uid()));

drop policy if exists "Service role manages runtime device accounts" on public.server_app_runtime_device_accounts;
create policy "Panel managers manage runtime device accounts"
on public.server_app_runtime_device_accounts
for all
to authenticated
using (public.is_server_app_panel_manager(auth.uid()))
with check (public.is_server_app_panel_manager(auth.uid()));

drop policy if exists "Admins view runtime account bindings" on public.server_app_runtime_account_bindings;
create policy "Panel managers view runtime account bindings"
on public.server_app_runtime_account_bindings
for select
to authenticated
using (public.is_server_app_panel_manager(auth.uid()));

drop policy if exists "Service role manages runtime account bindings" on public.server_app_runtime_account_bindings;
create policy "Panel managers manage runtime account bindings"
on public.server_app_runtime_account_bindings
for all
to authenticated
using (public.is_server_app_panel_manager(auth.uid()))
with check (public.is_server_app_panel_manager(auth.uid()));

-- Self-heal runtime rows so panel upsert hits update paths consistently.
insert into public.server_app_runtime_controls (
  app_code,
  runtime_enabled,
  catalog_enabled,
  redeem_enabled,
  consume_enabled,
  heartbeat_enabled,
  maintenance_notice,
  min_client_version,
  blocked_client_versions,
  blocked_accounts,
  blocked_devices,
  blocked_ip_hashes,
  max_daily_redeems_per_account,
  max_daily_redeems_per_device
)
select
  sa.code,
  true,
  true,
  true,
  true,
  true,
  null,
  null,
  '{}'::text[],
  '{}'::text[],
  '{}'::text[],
  '{}'::text[],
  0,
  0
from public.server_apps sa
left join public.server_app_runtime_controls rc on rc.app_code = sa.code
where rc.app_code is null
on conflict (app_code) do nothing;
