-- Optional rollout: do not apply until you are ready.
-- This migration is designed to be additive and not touch the current rent flow.

create table if not exists rent.client_integrations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references rent.accounts(id) on delete cascade,
  client_code text not null unique,
  label text not null,
  allowed_origins text[] not null default '{}',
  worker_secret_hash text,
  rate_limit_per_minute integer not null default 60
    constraint client_integrations_rate_limit_check check (rate_limit_per_minute between 10 and 100000),
  is_enabled boolean not null default true,
  note text,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_integrations_account_id_key unique (account_id)
);

create index if not exists client_integrations_account_idx
  on rent.client_integrations(account_id, created_at desc);

create table if not exists rent.client_request_logs (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid references rent.client_integrations(id) on delete set null,
  account_id uuid references rent.accounts(id) on delete set null,
  origin text,
  ip text,
  device_id text,
  request_key text,
  result_code text,
  valid boolean,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists client_request_logs_integration_idx
  on rent.client_request_logs(integration_id, created_at desc);

create index if not exists client_request_logs_account_idx
  on rent.client_request_logs(account_id, created_at desc);

create or replace function rent.touch_client_integrations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_client_integrations_updated_at on rent.client_integrations;
create trigger trg_touch_client_integrations_updated_at
before update on rent.client_integrations
for each row execute function rent.touch_client_integrations_updated_at();

comment on table rent.client_integrations is
  'Optional table for managing one integration per customer website without exposing accounts.hmac_secret directly to public HTML.';

comment on table rent.client_request_logs is
  'Optional audit table for per-customer website requests.';
