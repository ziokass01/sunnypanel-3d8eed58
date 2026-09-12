-- Fake Lag v2.7 anti-crack hardening (server-side, safe/idempotent)
-- Mục tiêu: không phá luồng key/session hiện có, chỉ bổ sung cột policy để auth/check dùng strict hơn.

alter table if exists public.server_app_version_policies
  add column if not exists require_signature_match boolean not null default false,
  add column if not exists block_missing_identity boolean not null default true,
  add column if not exists login_token_ttl_seconds integer not null default 900,
  add column if not exists engine_token_ttl_seconds integer not null default 180,
  add column if not exists heartbeat_seconds integer not null default 45;

-- Giữ tương thích với UI cũ: nếu admin đã bật "block_unknown_signature" thì auth cũng coi như require_signature_match.
update public.server_app_version_policies
set
  require_signature_match = coalesce(require_signature_match, false) or coalesce(block_unknown_signature, false),
  block_missing_identity = coalesce(block_missing_identity, true),
  login_token_ttl_seconds = greatest(300, least(3600, coalesce(login_token_ttl_seconds, 900))),
  engine_token_ttl_seconds = greatest(60, least(900, coalesce(engine_token_ttl_seconds, 180))),
  heartbeat_seconds = greatest(20, least(180, coalesce(heartbeat_seconds, 45))),
  notes = concat_ws(E'\n', nullif(notes, ''), 'v2.7: strict auth/check policy, token TTL riêng cho login/engine, hỗ trợ heartbeat. Không tự nâng min_version để tránh khóa nhầm bản đang test.')
where app_code = 'fake-lag';
