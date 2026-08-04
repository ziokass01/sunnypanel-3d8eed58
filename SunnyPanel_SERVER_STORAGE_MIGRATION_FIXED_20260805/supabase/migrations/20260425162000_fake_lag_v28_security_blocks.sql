-- Fake Lag v2.8 anti-crack hardening.
-- Safe/idempotent: adds security block table + policy knobs, does not touch existing key/session logic.

alter table if exists public.server_app_version_policies
  add column if not exists risk_auto_block_enabled boolean not null default true,
  add column if not exists risk_auto_block_threshold integer not null default 2,
  add column if not exists risk_auto_block_window_seconds integer not null default 600;

create table if not exists public.server_app_security_blocks (
  id uuid primary key default gen_random_uuid(),
  app_code text not null default 'fake-lag',
  device_id text,
  ip_hash text,
  reason text not null default 'RUNTIME_RISK',
  enabled boolean not null default false,
  hit_count integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  blocked_until timestamptz,
  details jsonb not null default '{}'::jsonb
);

create index if not exists idx_server_app_security_blocks_app_device
  on public.server_app_security_blocks(app_code, device_id);

create index if not exists idx_server_app_security_blocks_app_ip
  on public.server_app_security_blocks(app_code, ip_hash);

update public.server_app_version_policies
set
  risk_auto_block_enabled = coalesce(risk_auto_block_enabled, true),
  risk_auto_block_threshold = greatest(1, least(10, coalesce(risk_auto_block_threshold, 2))),
  risk_auto_block_window_seconds = greatest(60, least(86400, coalesce(risk_auto_block_window_seconds, 600))),
  allowed_package_names = case
    when allowed_package_names is null then array['com.fakelag.sunnymod']::text[]
    when not ('com.fakelag.sunnymod' = any(allowed_package_names)) then allowed_package_names || array['com.fakelag.sunnymod']::text[]
    else allowed_package_names
  end,
  notes = concat_ws(E'\n', nullif(notes, ''), 'v2.8: package com.fakelag.sunnymod, fail-closed engine heartbeat, security block table for repeated runtime risk.')
where app_code = 'fake-lag';


create index if not exists idx_server_app_security_blocks_last_seen
  on public.server_app_security_blocks(app_code, last_seen_at desc);

update public.server_app_version_policies
set notes = concat_ws(E'\n', nullif(notes, ''), 'v2.8 native guard add-on: server stores native_guard/client_watermark in audit detail and auto-block now uses device OR ip within risk window.')
where app_code = 'fake-lag';
