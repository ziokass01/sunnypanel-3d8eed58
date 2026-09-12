-- Cache resolved Link4M short URLs so the system does not create a new Link4M link on every Get Key.
create table if not exists public.licenses_free_link4m_cache (
  id bigserial primary key,
  pass_no integer not null check (pass_no in (1,2)),
  rotate_bucket text not null,
  template_hash text not null,
  gate_url text not null,
  short_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_free_link4m_cache_unique
  on public.licenses_free_link4m_cache(pass_no, rotate_bucket, template_hash);

create index if not exists idx_free_link4m_cache_bucket
  on public.licenses_free_link4m_cache(rotate_bucket, pass_no);
