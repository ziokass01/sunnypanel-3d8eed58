alter table public.licenses_free_key_types
  add column if not exists app_code text not null default 'free-fire',
  add column if not exists app_label text,
  add column if not exists key_signature text,
  add column if not exists allow_reset boolean not null default true;

update public.licenses_free_key_types
set
  app_code = coalesce(nullif(app_code, ''), 'free-fire'),
  app_label = coalesce(nullif(app_label, ''), 'Free Fire'),
  key_signature = coalesce(nullif(key_signature, ''), 'FF'),
  allow_reset = coalesce(allow_reset, true)
where true;
