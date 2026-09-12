create table if not exists public.licenses_free_gate_logs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  session_id uuid null references public.licenses_free_sessions(session_id) on delete set null,
  key_type_code text null,
  pass_no integer null check (pass_no in (1, 2)),
  event_code text not null,
  detail jsonb null default '{}'::jsonb,
  fingerprint_hash text null,
  ip_hash text null,
  ua_hash text null
);

create index if not exists idx_free_gate_logs_created_at
  on public.licenses_free_gate_logs(created_at desc);

create index if not exists idx_free_gate_logs_event_code
  on public.licenses_free_gate_logs(event_code);

create index if not exists idx_free_gate_logs_fp_created
  on public.licenses_free_gate_logs(fingerprint_hash, created_at desc);

create index if not exists idx_free_gate_logs_ip_created
  on public.licenses_free_gate_logs(ip_hash, created_at desc);
