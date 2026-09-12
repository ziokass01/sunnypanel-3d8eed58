-- Verify/DDoS hardening without changing the menu-facing verify contract.
create index if not exists idx_audit_logs_verify_ip_created_at
  on public.audit_logs ((detail ->> 'ip'), created_at desc)
  where action = 'VERIFY';

create index if not exists idx_request_nonces_expires_at
  on public.request_nonces (expires_at);

do $$
begin
  if to_regprocedure('public.security_metrics_for_ip(text)') is not null then
    revoke execute on function public.security_metrics_for_ip(text) from public, anon, authenticated;
    grant execute on function public.security_metrics_for_ip(text) to service_role;
  end if;
  if to_regprocedure('public.check_ip_rate_limit(text,integer,integer)') is not null then
    revoke execute on function public.check_ip_rate_limit(text,integer,integer) from public, anon, authenticated;
    grant execute on function public.check_ip_rate_limit(text,integer,integer) to service_role;
  end if;
  if to_regprocedure('public.check_rate_limit(text,text,integer,integer)') is not null then
    revoke execute on function public.check_rate_limit(text,text,integer,integer) from public, anon, authenticated;
    grant execute on function public.check_rate_limit(text,text,integer,integer) to service_role;
  end if;
  if to_regprocedure('public.check_new_device_rate_limit(text,integer,integer)') is not null then
    revoke execute on function public.check_new_device_rate_limit(text,integer,integer) from public, anon, authenticated;
    grant execute on function public.check_new_device_rate_limit(text,integer,integer) to service_role;
  end if;
  -- This SECURITY DEFINER quota function previously only granted service_role
  -- without revoking PostgreSQL's default PUBLIC execute privilege. An anon
  -- caller could otherwise burn another key's Fake Lag verify quota by UUID.
  if to_regprocedure('public.increment_fake_lag_license_use(uuid,text,text)') is not null then
    revoke execute on function public.increment_fake_lag_license_use(uuid,text,text) from public, anon, authenticated;
    grant execute on function public.increment_fake_lag_license_use(uuid,text,text) to service_role;
  end if;
end
$$;
