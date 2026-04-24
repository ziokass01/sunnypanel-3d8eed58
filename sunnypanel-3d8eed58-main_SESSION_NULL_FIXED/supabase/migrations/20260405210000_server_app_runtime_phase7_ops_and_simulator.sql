alter table public.server_app_runtime_controls
  add column if not exists session_idle_timeout_minutes integer not null default 1440,
  add column if not exists session_max_age_minutes integer not null default 43200,
  add column if not exists event_retention_days integer not null default 30;

alter table public.server_app_runtime_controls
  drop constraint if exists server_app_runtime_controls_session_idle_timeout_check,
  add constraint server_app_runtime_controls_session_idle_timeout_check check (session_idle_timeout_minutes >= 0);

alter table public.server_app_runtime_controls
  drop constraint if exists server_app_runtime_controls_session_max_age_check,
  add constraint server_app_runtime_controls_session_max_age_check check (session_max_age_minutes >= 0);

alter table public.server_app_runtime_controls
  drop constraint if exists server_app_runtime_controls_event_retention_days_check,
  add constraint server_app_runtime_controls_event_retention_days_check check (event_retention_days >= 1);
