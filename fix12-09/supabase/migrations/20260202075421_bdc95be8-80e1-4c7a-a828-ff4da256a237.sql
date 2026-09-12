alter table public.licenses_free_issues add column if not exists ua_hash text not null default '';
create index if not exists idx_lfi_ua_hash on public.licenses_free_issues (ua_hash);
