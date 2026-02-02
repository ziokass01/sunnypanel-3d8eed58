-- FREE 1-DAY KEY system (add-only)

-- 1) Tables
create table if not exists public.licenses_free_sessions (
  session_id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'init',
  ip_hash text not null,
  ua_hash text not null,
  fingerprint_hash text not null,
  reveal_count integer not null default 0,
  closed_at timestamptz null,
  last_error text null,
  claim_token_hash text null,
  claim_expires_at timestamptz null
);

create index if not exists idx_lfs_created_at on public.licenses_free_sessions (created_at desc);
create index if not exists idx_lfs_status on public.licenses_free_sessions (status);
create index if not exists idx_lfs_fp_hash on public.licenses_free_sessions (fingerprint_hash);
create index if not exists idx_lfs_ip_hash on public.licenses_free_sessions (ip_hash);

create table if not exists public.licenses_free_issues (
  issue_id uuid primary key default gen_random_uuid(),
  license_id uuid not null,
  key_mask text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  session_id uuid not null references public.licenses_free_sessions(session_id) on delete cascade,
  ip_hash text not null,
  fingerprint_hash text not null
);

create index if not exists idx_lfi_created_at on public.licenses_free_issues (created_at desc);
create index if not exists idx_lfi_fp_hash on public.licenses_free_issues (fingerprint_hash);
create index if not exists idx_lfi_ip_hash on public.licenses_free_issues (ip_hash);

-- Rate limit table for free endpoints
create table if not exists public.free_ip_rate_limits (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  route text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(ip_hash, route, window_start)
);

create index if not exists idx_free_rl_window on public.free_ip_rate_limits (window_start desc);

-- 2) RLS
alter table public.licenses_free_sessions enable row level security;
alter table public.licenses_free_issues enable row level security;
alter table public.free_ip_rate_limits enable row level security;

-- Fail closed (no public access)
create policy "Admins manage free sessions"
on public.licenses_free_sessions
for all
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

create policy "Admins manage free issues"
on public.licenses_free_issues
for all
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

create policy "Admins manage free rate limits"
on public.free_ip_rate_limits
for all
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3) Helpers
create or replace function public.check_free_ip_rate_limit(
  p_ip_hash text,
  p_route text,
  p_limit integer default 60,
  p_window_seconds integer default 60
)
returns table(allowed boolean, current_count integer, window_start timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count integer;
  v_ip text;
  v_route text;
begin
  v_ip := coalesce(nullif(trim(p_ip_hash), ''), 'unknown');
  v_route := coalesce(nullif(trim(p_route), ''), 'unknown');

  if p_limit is null or p_limit < 1 then p_limit := 60; end if;
  if p_window_seconds is null or p_window_seconds < 10 then p_window_seconds := 60; end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.free_ip_rate_limits (ip_hash, route, window_start, count, updated_at)
  values (v_ip, v_route, v_window_start, 1, now())
  on conflict (ip_hash, route, window_start)
  do update set
    count = public.free_ip_rate_limits.count + 1,
    updated_at = now()
  returning public.free_ip_rate_limits.count into v_count;

  return query select (v_count <= p_limit), v_count, v_window_start;
end;
$$;

create or replace function public.cleanup_free_key_tables(
  p_nonce_ttl_days integer default 7,
  p_session_ttl_days integer default 7,
  p_rate_limit_ttl_days integer default 14
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- sessions: remove expired/old closed
  delete from public.licenses_free_sessions
  where created_at < now() - make_interval(days => greatest(coalesce(p_session_ttl_days, 7), 1));

  -- issues: keep a while for audit
  delete from public.licenses_free_issues
  where created_at < now() - make_interval(days => greatest(coalesce(p_session_ttl_days, 7), 1));

  delete from public.free_ip_rate_limits
  where window_start < now() - make_interval(days => greatest(coalesce(p_rate_limit_ttl_days, 14), 1));

  -- also clean existing verify tables (re-use)
  perform public.cleanup_verify_tables(greatest(coalesce(p_rate_limit_ttl_days, 14), 1));
end;
$$;

-- 4) Cron (hourly)
create extension if not exists pg_cron;
select cron.schedule(
  'cleanup-free-key-tables-hourly',
  '13 * * * *',
  $$ select public.cleanup_free_key_tables(); $$
)
where not exists (
  select 1 from cron.job where jobname = 'cleanup-free-key-tables-hourly'
);
