-- SunnyMod AI deep-control safety layer.
-- Adds metadata tables for Convex/Stripe/E2B/Docker-style integrations without enabling runtime execution.
-- Safe to run multiple times.

create table if not exists public.ai_sunny_tool_integrations (
  tool_code text primary key,
  label text,
  enabled boolean not null default false,
  mode text not null default 'disabled',
  base_url text,
  daily_limit integer not null default 0,
  monthly_limit integer not null default 0,
  note text,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_sunny_tool_audit_logs (
  id uuid primary key default gen_random_uuid(),
  tool_code text,
  action text not null,
  user_id uuid,
  email text,
  status text,
  input_chars integer not null default 0,
  output_chars integer not null default 0,
  estimated_tokens integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.ai_sunny_tool_integrations (tool_code, label, enabled, mode, note, sort_order, metadata)
values
  ('convex', 'Convex style realtime/thread blueprint', false, 'blueprint', 'Chỉ lấy ý tưởng realtime/thread. Hệ chính vẫn dùng Supabase.', 10, '{"source":"hackerai-main","safe_default":true}'::jsonb),
  ('stripe', 'Stripe billing/paywall blueprint', false, 'blueprint', 'Chưa bật thanh toán thật. Dùng để map plan sau này nếu cần.', 20, '{"source":"hackerai-main","safe_default":true}'::jsonb),
  ('e2b', 'E2B sandbox blueprint', false, 'disabled', 'Chỉ bật khi có worker riêng, network policy, timeout và secrets riêng.', 30, '{"source":"hackerai-main","requires_worker":true,"safe_default":true}'::jsonb),
  ('docker', 'Docker sandbox/job runner blueprint', false, 'disabled', 'Không chạy trong Supabase Edge Function. Cần worker/container riêng.', 40, '{"source":"hackerai-main","requires_worker":true,"safe_default":true}'::jsonb)
on conflict (tool_code) do update set
  label = excluded.label,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Ensure free plan is practical: roughly a few dozen short chat messages/day.
insert into public.ai_sunny_plans (
  plan_code, label, description, enabled, sort_order,
  daily_token_limit, daily_message_limit, max_tokens_per_request, max_input_chars,
  allowed_models, sandbox_enabled, terminal_enabled, tts_enabled, price_label, updated_at
)
values (
  'free', 'Free Coding', 'Gói free sau khi đăng nhập: khoảng vài chục tin nhắn/ngày, chỉ mở model tiết kiệm.', true, 10,
  40000, 30, 800, 6000,
  array['mimo-v2.5']::text[], false, false, false, 'Free', now()
)
on conflict (plan_code) do update set
  label = excluded.label,
  description = excluded.description,
  enabled = true,
  daily_token_limit = excluded.daily_token_limit,
  daily_message_limit = excluded.daily_message_limit,
  max_tokens_per_request = excluded.max_tokens_per_request,
  max_input_chars = excluded.max_input_chars,
  allowed_models = excluded.allowed_models,
  sandbox_enabled = false,
  terminal_enabled = false,
  tts_enabled = false,
  updated_at = now();

insert into public.ai_sunny_plans (
  plan_code, label, description, enabled, sort_order,
  daily_token_limit, daily_message_limit, max_tokens_per_request, max_input_chars,
  allowed_models, sandbox_enabled, terminal_enabled, tts_enabled, price_label, updated_at
)
values (
  'pro', 'Code Debug Pro', 'Gói code/debug mạnh hơn, mở model pro.', true, 20,
  300000, 150, 2000, 18000,
  array['mimo-v2.5','mimo-v2-pro','mimo-v2.5-pro']::text[], false, false, false, 'Pro', now()
)
on conflict (plan_code) do nothing;

insert into public.ai_sunny_plans (
  plan_code, label, description, enabled, sort_order,
  daily_token_limit, daily_message_limit, max_tokens_per_request, max_input_chars,
  allowed_models, sandbox_enabled, terminal_enabled, tts_enabled, price_label, updated_at
)
values (
  'max', 'Max Coding + Sandbox', 'Gói cao nhất, dùng cho sandbox/terminal sau khi bật worker an toàn.', false, 30,
  1000000, 400, 4000, 30000,
  array['mimo-v2.5','mimo-v2-pro','mimo-v2.5-pro','mimo-v2-omni','mimo-v2.5-tts']::text[], false, false, true, 'Max', now()
)
on conflict (plan_code) do nothing;
