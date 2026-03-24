-- rent: admin-managed download links for user portal
create table if not exists rent.download_links (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  note text,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists download_links_enabled_idx on rent.download_links (enabled, created_at desc);
