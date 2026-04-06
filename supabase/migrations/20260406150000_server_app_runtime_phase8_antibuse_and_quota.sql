alter table public.server_app_runtime_controls
  add column if not exists max_requests_per_10m_per_ip integer not null default 0,
  add column if not exists max_requests_per_10m_per_account integer not null default 0,
  add column if not exists max_requests_per_10m_per_device integer not null default 0,
  add column if not exists max_failed_redeems_per_hour_per_ip integer not null default 0,
  add column if not exists max_failed_redeems_per_hour_per_account integer not null default 0,
  add column if not exists max_failed_redeems_per_hour_per_device integer not null default 0,
  add column if not exists max_accounts_per_device integer not null default 0,
  add column if not exists max_devices_per_account integer not null default 0,
  add column if not exists lock_account_to_first_device boolean not null default false,
  add column if not exists lock_account_to_first_ip boolean not null default false,
  add column if not exists success_health_logs_enabled boolean not null default false,
  add column if not exists success_heartbeat_logs_enabled boolean not null default false;

alter table public.server_app_runtime_controls
  add constraint server_app_runtime_controls_max_requests_ip_check check (max_requests_per_10m_per_ip >= 0),
  add constraint server_app_runtime_controls_max_requests_account_check check (max_requests_per_10m_per_account >= 0),
  add constraint server_app_runtime_controls_max_requests_device_check check (max_requests_per_10m_per_device >= 0),
  add constraint server_app_runtime_controls_max_failed_redeems_ip_check check (max_failed_redeems_per_hour_per_ip >= 0),
  add constraint server_app_runtime_controls_max_failed_redeems_account_check check (max_failed_redeems_per_hour_per_account >= 0),
  add constraint server_app_runtime_controls_max_failed_redeems_device_check check (max_failed_redeems_per_hour_per_device >= 0),
  add constraint server_app_runtime_controls_max_accounts_per_device_check check (max_accounts_per_device >= 0),
  add constraint server_app_runtime_controls_max_devices_per_account_check check (max_devices_per_account >= 0);

create table if not exists public.server_app_runtime_counter_buckets (
  app_code text not null references public.server_apps(code) on delete cascade,
  action text not null,
  subject_kind text not null,
  subject_value text not null,
  window_kind text not null,
  window_start timestamptz not null,
  total_count integer not null default 0,
  success_count integer not null default 0,
  failed_count integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (app_code, action, subject_kind, subject_value, window_kind, window_start),
  constraint server_app_runtime_counter_buckets_subject_kind_check check (subject_kind in ('ip', 'account', 'device')),
  constraint server_app_runtime_counter_buckets_window_kind_check check (window_kind in ('10m', '1h', '1d')),
  constraint server_app_runtime_counter_buckets_counts_check check (
    total_count >= 0 and success_count >= 0 and failed_count >= 0
  )
);

create index if not exists server_app_runtime_counter_buckets_lookup_idx
  on public.server_app_runtime_counter_buckets(app_code, action, subject_kind, subject_value, window_kind, window_start);

create table if not exists public.server_app_runtime_account_devices (
  app_code text not null references public.server_apps(code) on delete cascade,
  account_ref text not null,
  device_id text not null,
  first_ip_hash text,
  last_ip_hash text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (app_code, account_ref, device_id)
);

create index if not exists server_app_runtime_account_devices_account_idx
  on public.server_app_runtime_account_devices(app_code, account_ref, last_seen_at desc);

create table if not exists public.server_app_runtime_device_accounts (
  app_code text not null references public.server_apps(code) on delete cascade,
  device_id text not null,
  account_ref text not null,
  first_ip_hash text,
  last_ip_hash text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (app_code, device_id, account_ref)
);

create index if not exists server_app_runtime_device_accounts_device_idx
  on public.server_app_runtime_device_accounts(app_code, device_id, last_seen_at desc);

create table if not exists public.server_app_runtime_account_bindings (
  app_code text not null references public.server_apps(code) on delete cascade,
  account_ref text not null,
  first_device_id text,
  first_ip_hash text,
  last_device_id text,
  last_ip_hash text,
  locked_at timestamptz,
  locked_until timestamptz,
  lock_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (app_code, account_ref)
);

create index if not exists server_app_runtime_account_bindings_lock_idx
  on public.server_app_runtime_account_bindings(app_code, locked_until desc);

alter table public.server_app_runtime_counter_buckets enable row level security;
alter table public.server_app_runtime_account_devices enable row level security;
alter table public.server_app_runtime_device_accounts enable row level security;
alter table public.server_app_runtime_account_bindings enable row level security;

drop policy if exists "Admins view runtime counter buckets" on public.server_app_runtime_counter_buckets;
create policy "Admins view runtime counter buckets"
on public.server_app_runtime_counter_buckets
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Service role manages runtime counter buckets" on public.server_app_runtime_counter_buckets;
create policy "Service role manages runtime counter buckets"
on public.server_app_runtime_counter_buckets
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins view runtime account devices" on public.server_app_runtime_account_devices;
create policy "Admins view runtime account devices"
on public.server_app_runtime_account_devices
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Service role manages runtime account devices" on public.server_app_runtime_account_devices;
create policy "Service role manages runtime account devices"
on public.server_app_runtime_account_devices
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins view runtime device accounts" on public.server_app_runtime_device_accounts;
create policy "Admins view runtime device accounts"
on public.server_app_runtime_device_accounts
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Service role manages runtime device accounts" on public.server_app_runtime_device_accounts;
create policy "Service role manages runtime device accounts"
on public.server_app_runtime_device_accounts
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins view runtime account bindings" on public.server_app_runtime_account_bindings;
create policy "Admins view runtime account bindings"
on public.server_app_runtime_account_bindings
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Service role manages runtime account bindings" on public.server_app_runtime_account_bindings;
create policy "Service role manages runtime account bindings"
on public.server_app_runtime_account_bindings
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop trigger if exists trg_server_app_runtime_counter_buckets_updated_at on public.server_app_runtime_counter_buckets;
create trigger trg_server_app_runtime_counter_buckets_updated_at
before update on public.server_app_runtime_counter_buckets
for each row
execute function public.set_updated_at();

drop trigger if exists trg_server_app_runtime_account_bindings_updated_at on public.server_app_runtime_account_bindings;
create trigger trg_server_app_runtime_account_bindings_updated_at
before update on public.server_app_runtime_account_bindings
for each row
execute function public.set_updated_at();
