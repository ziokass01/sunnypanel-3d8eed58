-- AI Sunny tool RLS + performance hotfix
-- Fixes Supabase Security Advisor warnings:
--   public.ai_sunny_tool_integrations: RLS disabled in public
--   public.ai_sunny_tool_audit_logs: policy exists but RLS disabled
-- Also adds partial indexes used by ai-sunny-chat quota checks.

create extension if not exists pgcrypto;

-- These two tables were introduced by 20260504021000_ai_sunny_deep_integrations.sql
-- but RLS was not enabled there. Keep this migration idempotent so it is safe
-- on older projects where the tables may not exist yet.
do $$
begin
  if to_regclass('public.ai_sunny_tool_integrations') is not null then
    alter table public.ai_sunny_tool_integrations enable row level security;
  end if;

  if to_regclass('public.ai_sunny_tool_audit_logs') is not null then
    alter table public.ai_sunny_tool_audit_logs enable row level security;
  end if;
end $$;

-- Public clients may only read integrations that are explicitly enabled.
-- Edge Functions/admin panel use the service-role key and still bypass RLS for full admin work.
do $$
begin
  if to_regclass('public.ai_sunny_tool_integrations') is not null
     and not exists (
       select 1 from pg_policies
       where schemaname = 'public'
         and tablename = 'ai_sunny_tool_integrations'
         and policyname = 'ai_sunny_tool_integrations_public_read_enabled'
     ) then
    create policy ai_sunny_tool_integrations_public_read_enabled
      on public.ai_sunny_tool_integrations
      for select
      to anon, authenticated
      using (enabled = true);
  end if;
end $$;

-- Users can only see audit rows tied to their auth.uid().
-- Writes should stay server-side through Edge Functions/service role.
do $$
begin
  if to_regclass('public.ai_sunny_tool_audit_logs') is not null
     and not exists (
       select 1 from pg_policies
       where schemaname = 'public'
         and tablename = 'ai_sunny_tool_audit_logs'
         and policyname = 'Users can view their own audit logs'
     ) then
    create policy "Users can view their own audit logs"
      on public.ai_sunny_tool_audit_logs
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;
end $$;

-- Helpful indexes for the AI/admin screens and per-user audit lookup.
create index if not exists ai_sunny_tool_integrations_enabled_sort_idx
  on public.ai_sunny_tool_integrations(enabled, sort_order)
  where enabled = true;

create index if not exists ai_sunny_tool_audit_logs_user_created_idx
  on public.ai_sunny_tool_audit_logs(user_id, created_at desc);

create index if not exists ai_sunny_tool_audit_logs_tool_created_idx
  on public.ai_sunny_tool_audit_logs(tool_code, created_at desc);

-- Quota checks in ai-sunny-chat mostly look at successful rows for a single day.
-- Partial indexes keep daily quota checks fast when ai_sunny_usage_logs grows.
create index if not exists ai_sunny_usage_user_day_ok_idx
  on public.ai_sunny_usage_logs(user_id, day_key)
  where request_status = 'ok';

create index if not exists ai_sunny_usage_user_day_ip_ok_idx
  on public.ai_sunny_usage_logs(user_id, day_key, ip_hash)
  where request_status = 'ok';

create index if not exists ai_sunny_usage_user_day_device_ok_idx
  on public.ai_sunny_usage_logs(user_id, day_key, device_hash)
  where request_status = 'ok';

create index if not exists ai_sunny_usage_day_ok_idx
  on public.ai_sunny_usage_logs(day_key)
  where request_status = 'ok';

notify pgrst, 'reload schema';
