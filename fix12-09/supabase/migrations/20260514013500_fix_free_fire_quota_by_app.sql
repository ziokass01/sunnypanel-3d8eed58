insert into public.server_app_settings (
  app_code,
  free_daily_limit_per_fingerprint,
  free_daily_limit_per_ip,
  updated_at
)
values (
  'free-fire',
  50,
  50,
  now()
)
on conflict (app_code) do update
set
  free_daily_limit_per_fingerprint = 50,
  free_daily_limit_per_ip = 50,
  updated_at = now();
