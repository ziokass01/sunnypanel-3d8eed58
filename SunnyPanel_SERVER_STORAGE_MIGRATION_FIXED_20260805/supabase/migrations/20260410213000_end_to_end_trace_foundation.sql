-- End-to-end trace foundation for Free -> Find Dumps -> Runtime
alter table public.licenses_free_sessions
  add column if not exists trace_id text;

update public.licenses_free_sessions
set trace_id = substring(replace(gen_random_uuid()::text, '-', '') from 1 for 24)
where coalesce(trace_id, '') = '';

alter table public.licenses_free_sessions
  alter column trace_id set not null;

create index if not exists idx_lfs_trace_id on public.licenses_free_sessions(trace_id);

alter table public.licenses_free_security_logs
  add column if not exists trace_id text,
  add column if not exists session_id uuid references public.licenses_free_sessions(session_id) on delete set null;
create index if not exists idx_lfsl_trace_id on public.licenses_free_security_logs(trace_id, created_at desc);

alter table public.licenses_free_gate_logs
  add column if not exists trace_id text;
create index if not exists idx_lfgl_trace_id on public.licenses_free_gate_logs(trace_id, created_at desc);

alter table public.server_app_redeem_keys
  add column if not exists trace_id text,
  add column if not exists source_free_session_id uuid references public.licenses_free_sessions(session_id) on delete set null;
create index if not exists idx_sark_trace_id on public.server_app_redeem_keys(trace_id, created_at desc);
create index if not exists idx_sark_source_free_session_id on public.server_app_redeem_keys(source_free_session_id);

alter table public.server_app_sessions
  add column if not exists trace_id text;
create index if not exists idx_sas_trace_id on public.server_app_sessions(trace_id, created_at desc);

alter table public.server_app_wallet_transactions
  add column if not exists trace_id text;
create index if not exists idx_sawt_trace_id on public.server_app_wallet_transactions(trace_id, created_at desc);

alter table public.server_app_runtime_events
  add column if not exists trace_id text;
create index if not exists idx_sare_trace_id on public.server_app_runtime_events(trace_id, created_at desc);
