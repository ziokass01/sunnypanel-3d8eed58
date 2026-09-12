-- FREE flow UX/session smoothing for /free -> /free/gate -> /free/claim.
-- Scope: only public free-flow timing knobs. Does not touch verify-key JSON or app verification.

alter table public.licenses_free_settings
  add column if not exists free_session_absolute_seconds integer not null default 500,
  add column if not exists free_claim_window_seconds integer not null default 180,
  add column if not exists free_close_deadline_seconds integer not null default 10;

-- Keep the public session token bounded: enough time for anti-bypass/link flow,
-- but after 500s gate/reveal must fail and no key is created.
update public.licenses_free_settings
set
  free_session_absolute_seconds = 500,
  free_claim_window_seconds = greatest(30, least(coalesce(free_claim_window_seconds, 180), 180)),
  free_close_deadline_seconds = greatest(10, coalesce(free_close_deadline_seconds, free_return_seconds, 10))
where id = 1;

comment on column public.licenses_free_settings.free_session_absolute_seconds
  is 'Absolute lifetime in seconds for public FREE sessions. Capped in edge functions to 500s so keys are not issued after timeout.';
comment on column public.licenses_free_settings.free_claim_window_seconds
  is 'Claim token window after gate succeeds; edge functions also clamp it to the remaining absolute session lifetime.';
comment on column public.licenses_free_settings.free_close_deadline_seconds
  is 'Seconds after successful reveal before the FREE session can be closed server-side; decoupled from UI return timer.';
