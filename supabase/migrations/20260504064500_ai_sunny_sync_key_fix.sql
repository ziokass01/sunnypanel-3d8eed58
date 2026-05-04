-- SunnyMod AI sync/key fix
-- Purpose:
-- 1) Ensure plan allowed_models match frontend/admin expectations.
-- 2) Ensure aisunny_h01 is configured as ai-coding free key type with reset support.
-- 3) Fix NOT NULL columns (kind/value/sort_order) so db push does not fail on licenses_free_key_types.
-- Safe/idempotent; only touches ai_sunny_* and the specific aisunny_h01 free-key type.

insert into public.ai_sunny_plans (
  plan_code, label, description, enabled, sort_order,
  daily_token_limit, daily_message_limit, monthly_token_limit,
  max_tokens_per_request, max_input_chars, allowed_models,
  sandbox_enabled, terminal_enabled, tts_enabled, price_label, updated_at
) values
  ('free',  'Free Coding',          'Gói free sau khi đăng nhập: chat thử khoảng vài chục tin/ngày.', true, 10, 40000,   30, 0, 800,  6000,  array['mimo-v2.5']::text[], false, false, false, 'Free', now()),
  ('trial', 'Trial / Key vượt',     'Key vượt 1 ngày/30 tin, dùng cho trang free.', true, 20, 60000,   30, 0, 1000, 8000,  array['mimo-v2.5']::text[], false, false, false, 'Key vượt', now()),
  ('basic', 'Basic Coding',         'Mở chat thường + code tiết kiệm.', true, 30, 250000, 100, 0, 1400, 12000, array['mimo-v2.5','mimo-v2-pro']::text[], false, false, false, 'Basic', now()),
  ('pro',   'Pro Debug',            'Mở model mạnh nhất cho code/debug.', true, 40, 1200000, 300, 0, 2200, 24000, array['mimo-v2.5','mimo-v2-pro','mimo-v2.5-pro']::text[], true, false, false, 'Pro', now()),
  ('max',   'Max Agent Sandbox',    'Mở gần đủ model, sandbox blueprint và terminal khi admin bật global.', true, 50, 3500000, 500, 0, 3200, 32000, array['mimo-v2.5','mimo-v2-pro','mimo-v2.5-pro','mimo-v2-omni','mimo-v2.5-tts']::text[], true, true, true, 'Max', now())
on conflict (plan_code) do update set
  label = excluded.label,
  description = excluded.description,
  enabled = true,
  sort_order = excluded.sort_order,
  daily_token_limit = excluded.daily_token_limit,
  daily_message_limit = excluded.daily_message_limit,
  monthly_token_limit = excluded.monthly_token_limit,
  max_tokens_per_request = excluded.max_tokens_per_request,
  max_input_chars = excluded.max_input_chars,
  allowed_models = excluded.allowed_models,
  sandbox_enabled = excluded.sandbox_enabled,
  terminal_enabled = excluded.terminal_enabled,
  tts_enabled = excluded.tts_enabled,
  price_label = excluded.price_label,
  updated_at = now();

insert into public.licenses_free_key_types (
  code, label, duration_seconds, kind, value, sort_order, enabled,
  app_code, app_label, key_signature, allow_reset,
  free_selection_mode, free_selection_expand
) values (
  'aisunny_h01', 'Key thêm token AI 🧯', 86400, 'day', 1, 901, true,
  'ai-coding', 'SunnyMod Coding AI', 'AI-SUNNY', true,
  'none', false
)
on conflict (code) do update set
  label = excluded.label,
  duration_seconds = excluded.duration_seconds,
  kind = excluded.kind,
  value = excluded.value,
  sort_order = excluded.sort_order,
  enabled = true,
  app_code = excluded.app_code,
  app_label = excluded.app_label,
  key_signature = excluded.key_signature,
  allow_reset = true,
  free_selection_mode = excluded.free_selection_mode,
  free_selection_expand = excluded.free_selection_expand,
  updated_at = now();

