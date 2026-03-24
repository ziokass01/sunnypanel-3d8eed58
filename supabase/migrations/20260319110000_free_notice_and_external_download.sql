alter table public.licenses_free_settings
  add column if not exists free_notice_enabled boolean not null default false,
  add column if not exists free_notice_title text,
  add column if not exists free_notice_content text,
  add column if not exists free_notice_mode text not null default 'modal',
  add column if not exists free_notice_closable boolean not null default true,
  add column if not exists free_notice_show_once boolean not null default false,
  add column if not exists free_external_download_enabled boolean not null default false,
  add column if not exists free_external_download_title text,
  add column if not exists free_external_download_description text,
  add column if not exists free_external_download_url text,
  add column if not exists free_external_download_button_label text,
  add column if not exists free_external_download_badge text,
  add column if not exists free_external_download_icon_url text;

alter table public.licenses_free_settings
  drop constraint if exists licenses_free_settings_free_notice_mode_check;

alter table public.licenses_free_settings
  add constraint licenses_free_settings_free_notice_mode_check
  check (free_notice_mode in ('modal', 'inline'));
