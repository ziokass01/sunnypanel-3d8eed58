-- Harden client integrations so one rent account maps to at most one integration row.
-- Safe behavior target:
-- 1) delete account => delete integration automatically via FK cascade
-- 2) one account => one integration row
-- 3) rate limit stays in a sane range

alter table rent.client_integrations
  add constraint client_integrations_account_id_key unique (account_id);

alter table rent.client_integrations
  add constraint client_integrations_rate_limit_check
  check (rate_limit_per_minute between 10 and 100000);

comment on constraint client_integrations_account_id_key on rent.client_integrations is
  'Each rent account may have at most one customer integration row. This makes SQL previews and edit-form setup deterministic.';

comment on constraint client_integrations_rate_limit_check on rent.client_integrations is
  'Reject obviously broken or abusive rate limit values.';
