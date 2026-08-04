create table if not exists public.server_app_runtime_controls (
  app_code text primary key references public.server_apps(code) on delete cascade,
  runtime_enabled boolean not null default true,
  catalog_enabled boolean not null default true,
  redeem_enabled boolean not null default true,
  consume_enabled boolean not null default true,
  heartbeat_enabled boolean not null default true,
  maintenance_notice text,
  min_client_version text,
  blocked_client_versions text[] not null default '{}'::text[],
  blocked_accounts text[] not null default '{}'::text[],
  blocked_devices text[] not null default '{}'::text[],
  blocked_ip_hashes text[] not null default '{}'::text[],
  max_daily_redeems_per_account integer not null default 0,
  max_daily_redeems_per_device integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.server_app_runtime_events (
  id uuid primary key default gen_random_uuid(),
  app_code text not null references public.server_apps(code) on delete cascade,
  event_type text not null,
  ok boolean not null default true,
  code text,
  message text,
  account_ref text,
  device_id text,
  session_id uuid references public.server_app_sessions(id) on delete set null,
  redeem_key_id uuid references public.server_app_redeem_keys(id) on delete set null,
  feature_code text,
  wallet_kind text,
  ip_hash text,
  client_version text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists server_app_runtime_events_app_created_idx
  on public.server_app_runtime_events(app_code, created_at desc);

create index if not exists server_app_runtime_events_app_event_created_idx
  on public.server_app_runtime_events(app_code, event_type, created_at desc);

create index if not exists server_app_runtime_events_account_created_idx
  on public.server_app_runtime_events(app_code, account_ref, created_at desc);

create index if not exists server_app_runtime_events_device_created_idx
  on public.server_app_runtime_events(app_code, device_id, created_at desc);

alter table public.server_app_runtime_controls enable row level security;
alter table public.server_app_runtime_events enable row level security;

drop policy if exists "Admins manage server app runtime controls" on public.server_app_runtime_controls;
create policy "Admins manage server app runtime controls"
on public.server_app_runtime_controls
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins view server app runtime events" on public.server_app_runtime_events;
create policy "Admins view server app runtime events"
on public.server_app_runtime_events
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Service role inserts runtime events" on public.server_app_runtime_events;
create policy "Service role inserts runtime events"
on public.server_app_runtime_events
for insert
to authenticated
with check (public.has_role(auth.uid(), 'admin'));

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
  code,
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
from public.server_apps
on conflict (app_code) do update
set
  updated_at = now();
