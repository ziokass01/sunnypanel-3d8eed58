-- Verify/DDoS hardening that does not change the menu-facing verify contract.
-- Apply during a low-traffic window because the audit_logs expression index may
-- briefly take a stronger lock while it is created.

create index if not exists idx_audit_logs_verify_ip_created_at
  on public.audit_logs ((detail ->> 'ip'), created_at desc)
  where action = 'VERIFY';

create index if not exists idx_request_nonces_expires_at
  on public.request_nonces (expires_at);

-- This SECURITY DEFINER helper is internal to verify-key. Leaving the default
-- PUBLIC execute privilege in place would let anonymous PostgREST callers run
-- the audit aggregation directly and turn it into a database load amplifier.
do $$
begin
  if to_regprocedure('public.security_metrics_for_ip(text)') is not null then
    revoke execute on function public.security_metrics_for_ip(text) from public, anon, authenticated;
    grant execute on function public.security_metrics_for_ip(text) to service_role;
  end if;
end
$$;

-- Re-assert the intended privilege boundary for verify-only rate limit helpers.
-- These statements are idempotent and protect databases whose older migration
-- history was only partially applied.
do $$
begin
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
end
$$;
