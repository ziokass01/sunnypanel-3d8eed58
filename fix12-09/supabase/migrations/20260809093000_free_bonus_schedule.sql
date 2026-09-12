-- Scheduled Free Key bonus configuration.
-- Runtime evaluation is done in Asia/Ho_Chi_Minh on each request; no cron toggles.
begin;

alter table public.licenses_free_settings
  add column if not exists free_bonus_config jsonb not null default
  '{
    "enabled": false,
    "timezone": "Asia/Ho_Chi_Minh",
    "start_time": "00:00",
    "end_time": "12:00",
    "disable_secondary": true,
    "notice_title": "Khung giờ Bonus",
    "notice_content": "Bonus đang diễn ra. Link phụ sẽ mở lại khi hết khung giờ Bonus.",
    "notice_dismiss_seconds": 3600,
    "rules": []
  }'::jsonb;

update public.licenses_free_settings
set free_bonus_config =
  '{
    "enabled": false,
    "timezone": "Asia/Ho_Chi_Minh",
    "start_time": "00:00",
    "end_time": "12:00",
    "disable_secondary": true,
    "notice_title": "Khung giờ Bonus",
    "notice_content": "Bonus đang diễn ra. Link phụ sẽ mở lại khi hết khung giờ Bonus.",
    "notice_dismiss_seconds": 3600,
    "rules": []
  }'::jsonb
where free_bonus_config is null
   or jsonb_typeof(free_bonus_config) <> 'object';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'licenses_free_settings_free_bonus_config_object'
      and conrelid = 'public.licenses_free_settings'::regclass
  ) then
    alter table public.licenses_free_settings
      add constraint licenses_free_settings_free_bonus_config_object
      check (jsonb_typeof(free_bonus_config) = 'object');
  end if;
end
$$;

notify pgrst, 'reload schema';
commit;
