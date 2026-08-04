-- Fake Lag final hardening + trash + server-key source of truth.
-- Safe additive repair. Keeps Free Fire and Find Dumps unchanged.

alter table public.licenses
  add column if not exists app_code text default 'free-fire',
  add column if not exists deleted_at timestamptz,
  add column if not exists max_ips integer,
  add column if not exists max_verify integer,
  add column if not exists verify_count integer not null default 0,
  add column if not exists first_used_at timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists start_on_first_use boolean default false,
  add column if not exists starts_on_first_use boolean default false,
  add column if not exists duration_seconds integer,
  add column if not exists public_reset_disabled boolean default false;

insert into public.license_access_rules (
  app_code, key_prefix, default_duration_seconds, max_devices_per_key, max_ips_per_key, max_verify_per_key, public_enabled, allow_reset, notes
)
values (
  'fake-lag', 'FAKELAG', 86400, 1, 1, 1, true, false,
  'Fake Lag server key là nguồn cấu hình riêng cho key FAKELAG; không dùng rule của Free Fire/Find Dumps.'
)
on conflict (app_code) do update set
  key_prefix = coalesce(nullif(public.license_access_rules.key_prefix, ''), excluded.key_prefix),
  default_duration_seconds = greatest(60, coalesce(public.license_access_rules.default_duration_seconds, excluded.default_duration_seconds)),
  max_devices_per_key = greatest(1, coalesce(public.license_access_rules.max_devices_per_key, excluded.max_devices_per_key)),
  max_ips_per_key = greatest(1, coalesce(public.license_access_rules.max_ips_per_key, excluded.max_ips_per_key)),
  max_verify_per_key = greatest(1, coalesce(public.license_access_rules.max_verify_per_key, excluded.max_verify_per_key)),
  updated_at = now();

-- Đảm bảo toàn bộ key FAKELAG tự nhận diện app_code=fake-lag.
update public.licenses
set app_code = 'fake-lag',
    max_ips = coalesce(max_ips, (select max_ips_per_key from public.license_access_rules where app_code = 'fake-lag'), 1),
    max_verify = coalesce(max_verify, (select max_verify_per_key from public.license_access_rules where app_code = 'fake-lag'), 1),
    max_devices = greatest(1, coalesce(max_devices, (select max_devices_per_key from public.license_access_rules where app_code = 'fake-lag'), 1))
where upper(key) like 'FAKELAG-%';

create index if not exists licenses_fake_lag_active_idx on public.licenses(app_code, deleted_at, is_active) where app_code = 'fake-lag';
create index if not exists licenses_fake_lag_trash_idx on public.licenses(app_code, deleted_at) where app_code = 'fake-lag' and deleted_at is not null;

-- Free key type của Fake Lag chỉ quyết định thời lượng/nhãn để user chọn ở /free.
-- Giới hạn thiết bị/IP/lượt nhập lấy từ license_access_rules khi phát key.
update public.licenses_free_key_types
set app_code = 'fake-lag',
    app_label = 'Fake Lag',
    key_signature = 'FAKELAG',
    allow_reset = false,
    free_selection_mode = 'none',
    free_selection_expand = false,
    default_package_code = null,
    default_credit_code = null,
    default_wallet_kind = null
where upper(coalesce(key_signature, '')) = 'FAKELAG'
   or lower(coalesce(app_code, '')) = 'fake-lag'
   or lower(code) like 'fakelag_%'
   or lower(code) like 'fake_lag_%';

-- Giữ sẵn vài loại thời lượng public. Admin có thể bật/tắt từng loại trong Admin Free key.
insert into public.licenses_free_key_types (
  code, label, duration_seconds, kind, value, sort_order, enabled,
  app_code, app_label, key_signature, allow_reset,
  free_selection_mode, free_selection_expand, default_package_code, default_credit_code, default_wallet_kind
) values
  ('fakelag_h01', 'Fake Lag 1 giờ', 3600, 'hour', 1, 420, true, 'fake-lag', 'Fake Lag', 'FAKELAG', false, 'none', false, null, null, null),
  ('fakelag_h05', 'Fake Lag 5 giờ', 18000, 'hour', 5, 425, true, 'fake-lag', 'Fake Lag', 'FAKELAG', false, 'none', false, null, null, null),
  ('fakelag_d01', 'Fake Lag 1 ngày', 86400, 'day', 1, 501, true, 'fake-lag', 'Fake Lag', 'FAKELAG', false, 'none', false, null, null, null),
  ('fakelag_d07', 'Fake Lag 7 ngày', 604800, 'day', 7, 507, true, 'fake-lag', 'Fake Lag', 'FAKELAG', false, 'none', false, null, null, null)
on conflict (code) do update set
  label = excluded.label,
  duration_seconds = excluded.duration_seconds,
  kind = excluded.kind,
  value = excluded.value,
  sort_order = excluded.sort_order,
  app_code = excluded.app_code,
  app_label = excluded.app_label,
  key_signature = excluded.key_signature,
  allow_reset = excluded.allow_reset,
  free_selection_mode = excluded.free_selection_mode,
  free_selection_expand = excluded.free_selection_expand,
  default_package_code = excluded.default_package_code,
  default_credit_code = excluded.default_credit_code,
  default_wallet_kind = excluded.default_wallet_kind;

create or replace function public.increment_fake_lag_license_use(
  p_license_id uuid,
  p_app_code text,
  p_ip_hash text
)
returns table(ok boolean, msg text, verify_count integer, ip_count integer)
language plpgsql
security definer
as $$
declare
  v_rule public.license_access_rules%rowtype;
  v_license public.licenses%rowtype;
  v_ip_count integer := 0;
  v_verify_count integer := 0;
  v_max_ips integer := 1;
  v_max_verify integer := 1;
begin
  select * into v_rule from public.license_access_rules where app_code = coalesce(nullif(p_app_code, ''), 'fake-lag');
  if not found then select * into v_rule from public.license_access_rules where app_code = 'fake-lag'; end if;

  if found and not coalesce(v_rule.public_enabled, true) then
    return query select false, 'APP_KEY_DISABLED', 0, 0; return;
  end if;

  select * into v_license from public.licenses where id = p_license_id for update;
  if not found then return query select false, 'KEY_NOT_FOUND', 0, 0; return; end if;
  if v_license.deleted_at is not null then return query select false, 'KEY_DELETED', coalesce(v_license.verify_count, 0), 0; return; end if;
  if not coalesce(v_license.is_active, true) then return query select false, 'KEY_BLOCKED', coalesce(v_license.verify_count, 0), 0; return; end if;

  v_max_ips := greatest(1, coalesce(v_license.max_ips, v_rule.max_ips_per_key, 1));
  v_max_verify := greatest(1, coalesce(v_license.max_verify, v_rule.max_verify_per_key, 1));

  if p_ip_hash = any(coalesce(v_rule.blocked_ip_hashes, '{}')) then
    return query select false, 'IP_BLOCKED', coalesce(v_license.verify_count, 0), 0; return;
  end if;

  insert into public.license_ip_bindings (license_id, app_code, ip_hash, verify_count)
  values (p_license_id, coalesce(nullif(p_app_code, ''), 'fake-lag'), p_ip_hash, 1)
  on conflict (license_id, ip_hash)
  do update set last_seen_at = now(), verify_count = public.license_ip_bindings.verify_count + 1;

  select count(*) into v_ip_count from public.license_ip_bindings where license_id = p_license_id;

  if v_ip_count > v_max_ips then
    return query select false, 'IP_LIMIT_EXCEEDED', coalesce(v_license.verify_count, 0), v_ip_count; return;
  end if;

  update public.licenses
  set verify_count = coalesce(verify_count, 0) + 1
  where id = p_license_id
  returning verify_count into v_verify_count;

  if v_verify_count > v_max_verify then
    return query select false, 'VERIFY_LIMIT_EXCEEDED', v_verify_count, v_ip_count; return;
  end if;

  return query select true, 'OK', v_verify_count, v_ip_count;
end;
$$;
