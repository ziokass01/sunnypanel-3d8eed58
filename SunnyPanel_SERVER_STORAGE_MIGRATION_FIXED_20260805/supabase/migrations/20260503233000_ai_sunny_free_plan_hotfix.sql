-- SunnyMod AI free-plan + schema hotfix
-- Safe additive/idempotent: creates ai_sunny_* objects if an older deploy missed the first AI migration.
-- Also opens AI by default, fixes MiMo base URL, and adds a small free plan.

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
  system_prompt text not null default 'You are SunnyMod Coding AI, a coding assistant for debugging, explaining logs, reviewing code, and helping with safe software development. Reply in Vietnamese by default when the user writes Vietnamese. Do not expose secrets or encourage unsafe abuse.',
  sandbox_global_enabled boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.ai_sunny_config (
  id, enabled, public_enabled, maintenance_message, default_model, pro_model,
  mimo_base_url, global_daily_token_limit, global_monthly_stop_at_tokens,
  max_input_chars, system_prompt, sandbox_global_enabled, updated_by, updated_at
)
values (
  1, true, true, 'SunnyMod Coding AI đang bảo trì, vui lòng thử lại sau.', 'mimo-v2.5', 'mimo-v2.5-pro',
  'https://token-plan-sgp.xiaomimimo.com/v1', 80000000, 1500000000,
  24000,
  'You are SunnyMod Coding AI, a coding assistant for debugging, explaining logs, reviewing code, and helping with safe software development. Reply in Vietnamese by default when the user writes Vietnamese. Do not expose secrets or encourage unsafe abuse.',
  false, 'ai-free-hotfix', now()
)
on conflict (id) do update set
  enabled = true,
  public_enabled = true,
  mimo_base_url = excluded.mimo_base_url,
  default_model = excluded.default_model,
  pro_model = excluded.pro_model,
  global_daily_token_limit = excluded.global_daily_token_limit,
  global_monthly_stop_at_tokens = excluded.global_monthly_stop_at_tokens,
  max_input_chars = excluded.max_input_chars,
  system_prompt = coalesce(nullif(public.ai_sunny_config.system_prompt, ''), excluded.system_prompt),
  updated_by = 'ai-free-hotfix',
  updated_at = now();

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
  plan_code, label, description, enabled, sort_order, daily_token_limit, daily_message_limit,
  monthly_token_limit, max_tokens_per_request, max_input_chars, allowed_models,
  sandbox_enabled, terminal_enabled, tts_enabled, price_label, updated_at
) values
  ('free', 'Free Coding', 'Gói free sau khi đăng nhập: chat thử khoảng vài chục tin/ngày, chỉ dùng model tiết kiệm.', true, 5, 40000, 30, 0, 800, 6000, array['mimo-v2.5']::text[], false, false, false, 'Free', now()),
  ('trial', 'Trial / Key vượt', 'Gói mở bằng key vượt trong ngày: thêm quota và dùng chat/code nhẹ.', true, 10, 60000, 30, 0, 900, 7000, array['mimo-v2.5']::text[], false, false, false, 'Key vượt', now()),
  ('basic', 'Basic Coding', 'Chat thường, giải thích code, viết code nhẹ.', true, 20, 250000, 100, 0, 1200, 12000, array['mimo-v2.5','mimo-v2-pro']::text[], false, false, false, 'Basic', now()),
  ('pro', 'Pro Debug', 'Debug code/log/build, phân tích repo và lỗi khó.', true, 30, 1200000, 300, 0, 2500, 24000, array['mimo-v2.5','mimo-v2-pro','mimo-v2.5-pro']::text[], false, false, false, 'Pro', now()),
  ('max', 'Max Agent Sandbox', 'Gói cao nhất, mở model mạnh và sandbox/terminal khi admin bật.', true, 40, 3500000, 500, 0, 4000, 32000, array['mimo-v2.5','mimo-v2-pro','mimo-v2.5-pro','mimo-v2-omni','mimo-v2.5-tts']::text[], true, true, true, 'Max', now())
on conflict (plan_code) do update set
  label = excluded.label,
  description = excluded.description,
  enabled = true,
  sort_order = excluded.sort_order,
  daily_token_limit = excluded.daily_token_limit,
  daily_message_limit = excluded.daily_message_limit,
  max_tokens_per_request = excluded.max_tokens_per_request,
  max_input_chars = excluded.max_input_chars,
  allowed_models = excluded.allowed_models,
  sandbox_enabled = excluded.sandbox_enabled,
  terminal_enabled = excluded.terminal_enabled,
  tts_enabled = excluded.tts_enabled,
  price_label = excluded.price_label,
  updated_at = now();

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
  bonus_daily_tokens integer not null default 60000,
  bonus_daily_messages integer not null default 30,
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
  user_id uuid not null,
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

do $$
begin
  alter table public.ai_sunny_redeem_logs drop constraint if exists ai_sunny_redeem_logs_user_id_key;
exception when undefined_table then
  null;
end $$;

create index if not exists ai_sunny_redeem_logs_key_day_idx on public.ai_sunny_redeem_logs(redeem_key_id, day_key);
create index if not exists ai_sunny_redeem_logs_user_idx on public.ai_sunny_redeem_logs(user_id, redeem_key_id);
create unique index if not exists ai_sunny_redeem_logs_user_key_once_idx on public.ai_sunny_redeem_logs(redeem_key_id, user_id);
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
  user_id uuid not null,
  email text,
  provider text not null default 'disabled',
  status text not null default 'created' check (status in ('created','running','stopped','killed','failed')),
  reason text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

do $$
begin
  alter table public.ai_sunny_config enable row level security;
  alter table public.ai_sunny_plans enable row level security;
  alter table public.ai_sunny_user_access enable row level security;
  alter table public.ai_sunny_redeem_keys enable row level security;
  alter table public.ai_sunny_redeem_logs enable row level security;
  alter table public.ai_sunny_usage_logs enable row level security;
  alter table public.ai_sunny_sandbox_sessions enable row level security;
exception when undefined_table then
  null;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ai_sunny_plans' and policyname='ai_sunny_plans_public_read_enabled') then
    create policy ai_sunny_plans_public_read_enabled on public.ai_sunny_plans for select using (enabled = true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ai_sunny_config' and policyname='ai_sunny_config_public_read') then
    create policy ai_sunny_config_public_read on public.ai_sunny_config for select using (true);
  end if;
end $$;

-- Ask PostgREST/Supabase to refresh schema cache after new AI tables.
notify pgrst, 'reload schema';
