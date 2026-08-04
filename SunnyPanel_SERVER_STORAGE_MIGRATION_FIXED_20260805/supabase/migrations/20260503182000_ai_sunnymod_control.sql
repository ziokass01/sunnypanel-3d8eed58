-- SunnyMod Coding AI control plane
-- Safe additive migration: only creates ai_sunny_* tables/indexes and default rows.
-- Does not modify fake-lag/free/rent/reset tables or existing functions.

create extension if not exists pgcrypto;

create table if not exists public.ai_sunny_config (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default true,
  public_enabled boolean not null default true,
  maintenance_message text not null default 'SunnyMod Coding AI đang bảo trì, vui lòng thử lại sau.',
  default_model text not null default 'mimo-v2.5',
  pro_model text not null default 'mimo-v2.5-pro',
  mimo_base_url text not null default 'https://token-plan-sgp.xiaomimimo.com/v1',
  global_daily_token_limit integer not null default 80000000,
  global_monthly_stop_at_tokens integer not null default 1500000000,
  max_input_chars integer not null default 24000,
  system_prompt text not null default 'You are SunnyMod Coding AI, a coding assistant for debugging, explaining logs, reviewing code, and helping with safe software development.',
  sandbox_global_enabled boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.ai_sunny_config (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.ai_sunny_plans (
  plan_code text primary key,
  label text not null,
  description text not null default '',
  enabled boolean not null default true,
  sort_order integer not null default 100,
  daily_token_limit integer not null default 0,
  daily_message_limit integer not null default 0,
  monthly_token_limit integer not null default 0,
  max_tokens_per_request integer not null default 1200,
  max_input_chars integer not null default 12000,
  allowed_models text[] not null default '{}'::text[],
  sandbox_enabled boolean not null default false,
  terminal_enabled boolean not null default false,
  tts_enabled boolean not null default false,
  price_label text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.ai_sunny_plans (
  plan_code, label, description, sort_order, daily_token_limit, daily_message_limit,
  monthly_token_limit, max_tokens_per_request, max_input_chars, allowed_models,
  sandbox_enabled, terminal_enabled, tts_enabled, price_label
) values
  ('trial', 'Trial / Key vượt', 'Gói thử sau khi nhập key vượt. Chỉ mở chat/code nhẹ trong ngày.', 10, 50000, 20, 0, 700, 6000, array['mimo-v2.5']::text[], false, false, false, 'Key vượt'),
  ('basic', 'Basic Coding', 'Chat thường, giải thích code, viết code nhẹ.', 20, 250000, 100, 0, 1200, 12000, array['mimo-v2.5','mimo-v2-pro']::text[], false, false, false, 'Basic'),
  ('pro', 'Pro Debug', 'Debug code/log/build, phân tích repo và lỗi khó.', 30, 1200000, 300, 0, 2500, 24000, array['mimo-v2.5','mimo-v2-pro','mimo-v2.5-pro']::text[], false, false, false, 'Pro'),
  ('max', 'Max Agent Sandbox', 'Gói cao nhất, mở quyền model mạnh và sandbox/terminal khi admin bật.', 40, 3500000, 500, 0, 4000, 32000, array['mimo-v2.5','mimo-v2-pro','mimo-v2.5-pro','mimo-v2-omni','mimo-v2.5-tts']::text[], true, true, true, 'Max')
on conflict (plan_code) do nothing;

create table if not exists public.ai_sunny_user_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  email text,
  plan_code text not null references public.ai_sunny_plans(plan_code),
  status text not null default 'active' check (status in ('active','blocked','expired')),
  daily_token_limit_override integer,
  daily_message_limit_override integer,
  daily_ip_limit_override integer,
  daily_device_limit_override integer,
  expires_at timestamptz,
  source text not null default 'admin',
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_sunny_user_access_email_idx on public.ai_sunny_user_access(lower(coalesce(email,'')));
create index if not exists ai_sunny_user_access_expires_idx on public.ai_sunny_user_access(expires_at);

create table if not exists public.ai_sunny_redeem_keys (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  code_mask text not null,
  title text not null default 'SunnyMod AI key',
  status text not null default 'active' check (status in ('active','disabled','expired')),
  plan_code_to_grant text not null references public.ai_sunny_plans(plan_code),
  grant_hours integer not null default 24,
  bonus_daily_tokens integer not null default 50000,
  bonus_daily_messages integer not null default 20,
  allowed_models text[] not null default '{}'::text[],
  max_uses_total integer not null default 1,
  max_uses_per_day integer not null default 1,
  per_user_once boolean not null default true,
  daily_ip_limit integer not null default 1,
  daily_device_limit integer not null default 1,
  require_device_id boolean not null default true,
  expires_at timestamptz,
  used_count integer not null default 0,
  created_by text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_sunny_redeem_keys_status_idx on public.ai_sunny_redeem_keys(status, expires_at);

create table if not exists public.ai_sunny_redeem_logs (
  id uuid primary key default gen_random_uuid(),
  redeem_key_id uuid not null references public.ai_sunny_redeem_keys(id) on delete cascade,
  user_id uuid not null unique,
  email text,
  day_key text not null,
  ip_hash text,
  device_hash text,
  ua_hash text,
  bonus_daily_tokens integer not null default 0,
  bonus_daily_messages integer not null default 0,
  granted_plan_code text,
  created_at timestamptz not null default now()
);

create index if not exists ai_sunny_redeem_logs_key_day_idx on public.ai_sunny_redeem_logs(redeem_key_id, day_key);
create index if not exists ai_sunny_redeem_logs_user_idx on public.ai_sunny_redeem_logs(user_id, redeem_key_id);
create index if not exists ai_sunny_redeem_logs_ip_day_idx on public.ai_sunny_redeem_logs(redeem_key_id, day_key, ip_hash);
create index if not exists ai_sunny_redeem_logs_device_day_idx on public.ai_sunny_redeem_logs(redeem_key_id, day_key, device_hash);

create table if not exists public.ai_sunny_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text,
  plan_code text,
  model text not null,
  mode text not null default 'chat',
  day_key text not null,
  ip_hash text,
  device_hash text,
  ua_hash text,
  input_chars integer not null default 0,
  output_chars integer not null default 0,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  estimated_tokens integer not null default 0,
  request_status text not null default 'ok',
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_sunny_usage_user_day_idx on public.ai_sunny_usage_logs(user_id, day_key);
create index if not exists ai_sunny_usage_day_idx on public.ai_sunny_usage_logs(day_key);
create index if not exists ai_sunny_usage_ip_day_idx on public.ai_sunny_usage_logs(day_key, ip_hash);
create index if not exists ai_sunny_usage_device_day_idx on public.ai_sunny_usage_logs(day_key, device_hash);

create table if not exists public.ai_sunny_sandbox_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  email text,
  provider text not null default 'disabled',
  status text not null default 'created' check (status in ('created','running','stopped','killed','failed')),
  reason text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.ai_sunny_config enable row level security;
alter table public.ai_sunny_plans enable row level security;
alter table public.ai_sunny_user_access enable row level security;
alter table public.ai_sunny_redeem_keys enable row level security;
alter table public.ai_sunny_redeem_logs enable row level security;
alter table public.ai_sunny_usage_logs enable row level security;
alter table public.ai_sunny_sandbox_sessions enable row level security;

-- Keep frontend read access minimal. Edge Functions use service role for all writes.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ai_sunny_plans' and policyname='ai_sunny_plans_public_read_enabled') then
    create policy ai_sunny_plans_public_read_enabled on public.ai_sunny_plans
      for select using (enabled = true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ai_sunny_config' and policyname='ai_sunny_config_public_read') then
    create policy ai_sunny_config_public_read on public.ai_sunny_config
      for select using (true);
  end if;
end $$;
