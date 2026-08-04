-- Hotfix 2026-05-06: cache Link4M outbound links by rotate bucket.
-- Symptom: /free-start generated a new Link4M short link for every Get Key because
-- the destination contained per-session sid/out token. This table lets the function
-- create/reuse one outbound link per app/key/pass/bucket/template instead.

create table if not exists public.licenses_free_outbound_buckets (
  id uuid primary key default gen_random_uuid(),
  app_code text not null default 'free-fire',
  key_type_code text not null default '',
  pass_no integer not null default 1 check (pass_no in (1, 2)),
  bucket_key text not null,
  template_hash text not null,
  destination_url text not null,
  outbound_url text not null,
  provider text not null default 'link4m',
  rotate_days integer not null default 7,
  nonce integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  unique (app_code, key_type_code, pass_no, bucket_key, template_hash)
);

create index if not exists idx_licenses_free_outbound_buckets_lookup
  on public.licenses_free_outbound_buckets(app_code, key_type_code, pass_no, bucket_key, template_hash);

alter table public.licenses_free_outbound_buckets enable row level security;

drop policy if exists "Admins manage free outbound buckets" on public.licenses_free_outbound_buckets;
create policy "Admins manage free outbound buckets"
on public.licenses_free_outbound_buckets
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop trigger if exists trg_licenses_free_outbound_buckets_updated_at on public.licenses_free_outbound_buckets;
create trigger trg_licenses_free_outbound_buckets_updated_at
before update on public.licenses_free_outbound_buckets
for each row
execute function public.set_updated_at();
