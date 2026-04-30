-- Fix Supabase Advisor: RLS Disabled in Public / Sensitive Columns Exposed
-- Safe/idempotent migration for public tables used by Fake Lag/free gate/runtime audit.
-- Goal:
--   - Enable RLS on exposed public tables.
--   - Do not expose anything to anon.
--   - Allow authenticated panel admins to read/manage only the tables the panel needs.
--   - Keep Edge Functions/service_role flows working.

begin;

-- Ensure the app_role enum exists before helper policies reference it.
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'app_role'
  ) then
    create type public.app_role as enum ('admin', 'moderator', 'user');
  end if;
end $$;

-- Helper used by all policies below.
-- This intentionally relies on the existing public.has_role() helper from the panel-role migration.
create or replace function public.is_panel_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.has_role(auth.uid(), 'admin'::public.app_role), false);
$$;

grant execute on function public.is_panel_admin() to authenticated;

-- Enable RLS on all Advisor-flagged public tables.
alter table if exists public.licenses_free_gate_logs enable row level security;
alter table if exists public.server_app_redeem_key_uses enable row level security;
alter table if exists public.license_access_rules enable row level security;
alter table if exists public.license_ip_bindings enable row level security;
alter table if exists public.server_app_security_blocks enable row level security;

-- Do not expose these tables to anon through PostgREST.
revoke all on table public.licenses_free_gate_logs from anon;
revoke all on table public.server_app_redeem_key_uses from anon;
revoke all on table public.license_access_rules from anon;
revoke all on table public.license_ip_bindings from anon;
revoke all on table public.server_app_security_blocks from anon;

-- Authenticated users still need SQL privileges; RLS policies restrict access to panel admins.
grant select on table public.licenses_free_gate_logs to authenticated;
grant select on table public.server_app_redeem_key_uses to authenticated;
grant select, insert, update, delete on table public.license_access_rules to authenticated;
grant select on table public.license_ip_bindings to authenticated;
grant select, insert, update, delete on table public.server_app_security_blocks to authenticated;

-- Idempotent policy reset.
drop policy if exists "admin read licenses_free_gate_logs" on public.licenses_free_gate_logs;
drop policy if exists "admin read server_app_redeem_key_uses" on public.server_app_redeem_key_uses;
drop policy if exists "admin manage license_access_rules" on public.license_access_rules;
drop policy if exists "admin read license_ip_bindings" on public.license_ip_bindings;
drop policy if exists "admin manage server_app_security_blocks" on public.server_app_security_blocks;

-- Logs/bindings/use reservations: admin read only from the public client.
-- Edge Functions that use service_role bypass RLS and can continue inserting/updating as before.
create policy "admin read licenses_free_gate_logs"
on public.licenses_free_gate_logs
for select
to authenticated
using (public.is_panel_admin());

create policy "admin read server_app_redeem_key_uses"
on public.server_app_redeem_key_uses
for select
to authenticated
using (public.is_panel_admin());

create policy "admin read license_ip_bindings"
on public.license_ip_bindings
for select
to authenticated
using (public.is_panel_admin());

-- Fake Lag server-key panel reads/upserts this table directly, so admin needs full manage.
create policy "admin manage license_access_rules"
on public.license_access_rules
for all
to authenticated
using (public.is_panel_admin())
with check (public.is_panel_admin());

-- Runtime security blocks may need manual admin unblock/manage from the panel.
create policy "admin manage server_app_security_blocks"
on public.server_app_security_blocks
for all
to authenticated
using (public.is_panel_admin())
with check (public.is_panel_admin());

commit;
