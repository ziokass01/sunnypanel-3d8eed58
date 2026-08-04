-- Fake Lag app-host + server-side version guard
-- Safe/idempotent: adds a dedicated version policy table and audit log.

create table if not exists public.server_app_version_policies (
  app_code text primary key,
  enabled boolean not null default true,
  force_update_enabled boolean not null default true,
  min_version_name text,
  min_version_code integer not null default 1,
  latest_version_name text,
  latest_version_code integer not null default 1,
  update_url text not null default 'https://mityangho.id.vn/free',
  update_title text not null default 'Có phiên bản mới',
  update_message text not null default 'Phiên bản bạn đang dùng đã cũ. Vui lòng cập nhật để tiếp tục sử dụng.',
  allowed_package_names text[] not null default array[]::text[],
  allowed_signature_sha256 text[] not null default array[]::text[],
  block_unknown_signature boolean not null default false,
  blocked_version_names text[] not null default array[]::text[],
  blocked_version_codes integer[] not null default array[]::integer[],
  blocked_build_ids text[] not null default array[]::text[],
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.server_app_version_audit_logs (
  id uuid primary key default gen_random_uuid(),
  app_code text not null,
  decision text not null,
  code text,
  package_name text,
  version_name text,
  version_code integer,
  build_id text,
  signature_sha256 text,
  device_id text,
  ip_hash text,
  user_agent text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists server_app_version_audit_logs_app_created_idx
  on public.server_app_version_audit_logs (app_code, created_at desc);
create index if not exists server_app_version_audit_logs_device_idx
  on public.server_app_version_audit_logs (app_code, device_id, created_at desc);
create index if not exists server_app_version_audit_logs_decision_idx
  on public.server_app_version_audit_logs (app_code, decision, created_at desc);

alter table public.server_app_version_policies enable row level security;
alter table public.server_app_version_audit_logs enable row level security;

-- Keep existing panel model: authenticated/panel admins can read/write via Supabase UI, service role bypasses RLS for edge functions.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'server_app_version_policies' and policyname = 'server_app_version_policies_auth_read'
  ) then
    create policy server_app_version_policies_auth_read on public.server_app_version_policies
      for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'server_app_version_policies' and policyname = 'server_app_version_policies_auth_write'
  ) then
    create policy server_app_version_policies_auth_write on public.server_app_version_policies
      for all to authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'server_app_version_audit_logs' and policyname = 'server_app_version_audit_logs_auth_read'
  ) then
    create policy server_app_version_audit_logs_auth_read on public.server_app_version_audit_logs
      for select to authenticated using (true);
  end if;
end $$;

-- Register Fake Lag app-host without touching Free Fire / Find Dumps.
insert into public.server_apps (code, label, description, admin_url, public_enabled, notes)
values (
  'fake-lag',
  'Fake Lag',
  'App Fake Lag dùng app-host riêng cho server key, runtime, phiên bản, thiết bị/IP và audit.',
  'https://app.mityangho.id.vn/apps/fake-lag/keys',
  true,
  'Seed từ 20260424180000_fake_lag_apphost_version_guard.sql'
)
on conflict (code) do update set
  label = excluded.label,
  description = coalesce(public.server_apps.description, excluded.description),
  admin_url = coalesce(nullif(public.server_apps.admin_url, ''), excluded.admin_url),
  public_enabled = coalesce(public.server_apps.public_enabled, excluded.public_enabled);

insert into public.server_app_settings (app_code, guest_plan, gift_tab_label, key_persist_until_revoked, daily_reset_hour, free_daily_limit_per_fingerprint, free_daily_limit_per_ip, notes)
values ('fake-lag', 'classic', 'Get key', true, 0, 3, 10, 'Fake Lag: key login, device/IP limits and version guard.')
on conflict (app_code) do update set
  guest_plan = coalesce(public.server_app_settings.guest_plan, excluded.guest_plan),
  gift_tab_label = coalesce(public.server_app_settings.gift_tab_label, excluded.gift_tab_label),
  key_persist_until_revoked = coalesce(public.server_app_settings.key_persist_until_revoked, excluded.key_persist_until_revoked);

insert into public.server_app_runtime_controls (
  app_code, runtime_enabled, catalog_enabled, redeem_enabled, consume_enabled, heartbeat_enabled,
  maintenance_notice, min_client_version, blocked_client_versions,
  max_daily_redeems_per_account, max_daily_redeems_per_device,
  session_idle_timeout_minutes, session_max_age_minutes, event_retention_days
)
values (
  'fake-lag', true, true, true, true, true,
  null, '1.0.0', array[]::text[],
  5, 5, 30, 720, 30
)
on conflict (app_code) do update set
  runtime_enabled = coalesce(public.server_app_runtime_controls.runtime_enabled, excluded.runtime_enabled),
  min_client_version = coalesce(public.server_app_runtime_controls.min_client_version, excluded.min_client_version),
  session_idle_timeout_minutes = coalesce(public.server_app_runtime_controls.session_idle_timeout_minutes, excluded.session_idle_timeout_minutes),
  session_max_age_minutes = coalesce(public.server_app_runtime_controls.session_max_age_minutes, excluded.session_max_age_minutes);

insert into public.server_app_version_policies (
  app_code, enabled, force_update_enabled, min_version_name, min_version_code,
  latest_version_name, latest_version_code, update_url, update_title, update_message,
  allowed_package_names, allowed_signature_sha256, block_unknown_signature,
  notes
)
values (
  'fake-lag', true, true, '1.0.0', 1,
  '1.0.0', 1, 'https://mityangho.id.vn/free',
  'Yêu cầu cập nhật',
  'Phiên bản Fake Lag bạn đang dùng đã bị chặn hoặc quá cũ. Vui lòng cập nhật để tiếp tục sử dụng.',
  array['com.fakelag.cryhard8']::text[],
  array[]::text[],
  false,
  'Khi có release chính thức, thêm SHA-256 chữ ký release vào allowed_signature_sha256 và bật block_unknown_signature.'
)
on conflict (app_code) do nothing;

insert into public.server_app_reward_packages (
  app_code, package_code, title, description, enabled, reward_mode, plan_code,
  soft_credit_amount, premium_credit_amount, entitlement_days, entitlement_seconds,
  device_limit_override, account_limit_override, sort_order, notes
)
values
  ('fake-lag','fl_go_7d','Fake Lag Go 7 ngày','Key Fake Lag Go 7 ngày.',true,'plan','go',0,0,7,604800,1,1,10,'Seed default'),
  ('fake-lag','fl_plus_30d','Fake Lag Plus 30 ngày','Key Fake Lag Plus 30 ngày.',true,'plan','plus',0,0,30,2592000,2,1,20,'Seed default'),
  ('fake-lag','fl_admin_custom','Fake Lag Admin Custom','Key Fake Lag admin tùy chỉnh.',true,'plan','pro',0,0,30,2592000,3,1,30,'Seed default')
on conflict (app_code, package_code) do nothing;

insert into public.licenses_free_key_types (
  code, label, duration_seconds, kind, value, sort_order, enabled,
  app_code, app_label, key_signature, allow_reset,
  free_selection_mode, free_selection_expand, default_package_code, default_credit_code, default_wallet_kind
)
values
  ('fl_go','Fake Lag Go 7 ngày',604800,'day',7,402,true,'fake-lag','Fake Lag','FAKELAG',false,'package',true,'go',null,null),
  ('fl_plus','Fake Lag Plus 30 ngày',2592000,'day',30,403,true,'fake-lag','Fake Lag','FAKELAG',false,'package',true,'plus',null,null),
  ('fl_usage','Fake Lag lượt dùng',2592000,'day',30,410,true,'fake-lag','Fake Lag','FAKELAG',false,'credit',true,null,'usage-normal','normal')
on conflict (code) do update set
  app_code = excluded.app_code,
  app_label = excluded.app_label,
  key_signature = excluded.key_signature,
  free_selection_mode = excluded.free_selection_mode,
  free_selection_expand = excluded.free_selection_expand,
  default_package_code = excluded.default_package_code,
  default_credit_code = excluded.default_credit_code,
  default_wallet_kind = excluded.default_wallet_kind;
