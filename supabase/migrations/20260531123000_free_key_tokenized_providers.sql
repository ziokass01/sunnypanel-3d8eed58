-- FREE KEY tokenized gate + multi shortlink providers.
-- Scope: public /free flow only. Does NOT touch verify-key / rent-verify-key logic.

alter table public.licenses_free_settings
  add column if not exists free_shortlink_mode text not null default 'round_robin',
  add column if not exists free_shortlink_last_provider_id_pass1 uuid null,
  add column if not exists free_shortlink_last_provider_id_pass2 uuid null,
  add column if not exists free_shortlink_next_index_pass1 integer not null default 0,
  add column if not exists free_shortlink_next_index_pass2 integer not null default 0,
  add column if not exists free_gate_token_life_seconds integer not null default 600;

alter table public.licenses_free_settings
  drop constraint if exists licenses_free_settings_free_shortlink_mode_check;
alter table public.licenses_free_settings
  add constraint licenses_free_settings_free_shortlink_mode_check
  check (free_shortlink_mode in ('round_robin', 'random'));

update public.licenses_free_settings
set
  free_shortlink_mode = case when free_shortlink_mode in ('round_robin', 'random') then free_shortlink_mode else 'round_robin' end,
  free_gate_token_life_seconds = greatest(60, least(coalesce(free_gate_token_life_seconds, 600), 1800)),
  -- Token flow needs enough time for delay + 10 minute gate life + claim window.
  free_session_absolute_seconds = greatest(coalesce(free_session_absolute_seconds, 500), 900),
  free_claim_window_seconds = greatest(60, least(coalesce(free_claim_window_seconds, 180), 600))
where id = 1;

create table if not exists public.licenses_free_shortlink_providers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  provider text not null default 'custom',
  api_token_secret text null,
  api_url_template text null,
  enabled boolean not null default true,
  pass_scope text not null default 'both',
  sort_order integer not null default 100,
  last_used_at timestamptz null,
  last_error text null,
  fail_count integer not null default 0,
  note text null
);

alter table public.licenses_free_shortlink_providers
  drop constraint if exists licenses_free_shortlink_providers_pass_scope_check;
alter table public.licenses_free_shortlink_providers
  add constraint licenses_free_shortlink_providers_pass_scope_check
  check (pass_scope in ('both', 'pass1', 'pass2'));

alter table public.licenses_free_shortlink_providers
  drop constraint if exists licenses_free_shortlink_providers_provider_check;
alter table public.licenses_free_shortlink_providers
  add constraint licenses_free_shortlink_providers_provider_check
  check (provider in ('custom', 'link4m', 'traffic68', 'nhapma', 'layma', 'none'));

create index if not exists idx_lfsp_enabled_scope_order
  on public.licenses_free_shortlink_providers(enabled, pass_scope, sort_order, created_at);

drop trigger if exists trg_licenses_free_shortlink_providers_updated_at on public.licenses_free_shortlink_providers;
create trigger trg_licenses_free_shortlink_providers_updated_at
before update on public.licenses_free_shortlink_providers
for each row
execute function public.set_updated_at();

alter table public.licenses_free_shortlink_providers enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'licenses_free_shortlink_providers'
      and policyname = 'Admins manage free shortlink providers'
  ) then
    create policy "Admins manage free shortlink providers"
    on public.licenses_free_shortlink_providers
    for all
    using (public.has_role(auth.uid(), 'admin'::public.app_role))
    with check (public.has_role(auth.uid(), 'admin'::public.app_role));
  end if;
end $$;

create table if not exists public.licenses_free_gate_tokens (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.licenses_free_sessions(session_id) on delete cascade,
  pass_no integer not null default 1,
  token_hash text not null unique,
  status text not null default 'pending',
  activate_after_at timestamptz not null,
  expires_at timestamptz not null,
  used_at timestamptz null,
  burned_at timestamptz null,
  provider_id uuid null references public.licenses_free_shortlink_providers(id) on delete set null,
  short_url text null,
  ip_hash text null,
  ua_hash text null,
  fingerprint_hash text null,
  fail_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.licenses_free_gate_tokens
  drop constraint if exists licenses_free_gate_tokens_status_check;
alter table public.licenses_free_gate_tokens
  add constraint licenses_free_gate_tokens_status_check
  check (status in ('pending', 'burned_early', 'gate_ok', 'expired', 'used', 'closed'));

create index if not exists idx_lfgt_session_pass on public.licenses_free_gate_tokens(session_id, pass_no, created_at desc);
create index if not exists idx_lfgt_status_expires on public.licenses_free_gate_tokens(status, expires_at);
create index if not exists idx_lfgt_provider on public.licenses_free_gate_tokens(provider_id, created_at desc);

drop trigger if exists trg_licenses_free_gate_tokens_updated_at on public.licenses_free_gate_tokens;
create trigger trg_licenses_free_gate_tokens_updated_at
before update on public.licenses_free_gate_tokens
for each row
execute function public.set_updated_at();

alter table public.licenses_free_gate_tokens enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'licenses_free_gate_tokens'
      and policyname = 'Admins manage free gate tokens'
  ) then
    create policy "Admins manage free gate tokens"
    on public.licenses_free_gate_tokens
    for all
    using (public.has_role(auth.uid(), 'admin'::public.app_role))
    with check (public.has_role(auth.uid(), 'admin'::public.app_role));
  end if;
end $$;

alter table public.licenses_free_sessions
  add column if not exists gate_flow_version text null,
  add column if not exists gate_token_life_seconds integer null,
  add column if not exists provider_id_pass1 uuid null references public.licenses_free_shortlink_providers(id) on delete set null,
  add column if not exists provider_id_pass2 uuid null references public.licenses_free_shortlink_providers(id) on delete set null;

create index if not exists idx_lfs_gate_flow_version on public.licenses_free_sessions(gate_flow_version);
create index if not exists idx_lfs_provider_pass1 on public.licenses_free_sessions(provider_id_pass1);
create index if not exists idx_lfs_provider_pass2 on public.licenses_free_sessions(provider_id_pass2);

-- Seed 1 legacy provider from existing old config so deploy does not break old admins.
insert into public.licenses_free_shortlink_providers
  (name, provider, api_url_template, enabled, pass_scope, sort_order, note)
select
  'Legacy Pass1', 'custom', nullif(trim(free_outbound_url), ''), true, 'pass1', 10,
  'Migrated from licenses_free_settings.free_outbound_url'
from public.licenses_free_settings
where id = 1
  and nullif(trim(coalesce(free_outbound_url, '')), '') is not null
  and not exists (select 1 from public.licenses_free_shortlink_providers where pass_scope in ('both', 'pass1'));

insert into public.licenses_free_shortlink_providers
  (name, provider, api_url_template, enabled, pass_scope, sort_order, note)
select
  'Legacy Pass2', 'custom', nullif(trim(free_outbound_url_pass2), ''), true, 'pass2', 20,
  'Migrated from licenses_free_settings.free_outbound_url_pass2'
from public.licenses_free_settings
where id = 1
  and nullif(trim(coalesce(free_outbound_url_pass2, '')), '') is not null
  and not exists (select 1 from public.licenses_free_shortlink_providers where pass_scope = 'pass2');

comment on table public.licenses_free_shortlink_providers
  is 'Admin-managed shortlink API/token list for public FREE key flow. API tokens are server-side only.';
comment on table public.licenses_free_gate_tokens
  is 'Single-use public FREE gate tokens. One token can advance exactly one session/pass and cannot mint multiple keys.';
comment on column public.licenses_free_settings.free_gate_token_life_seconds
  is 'Seconds after activate_after_at that a gate token remains valid. Default 600 = 10 minutes.';
