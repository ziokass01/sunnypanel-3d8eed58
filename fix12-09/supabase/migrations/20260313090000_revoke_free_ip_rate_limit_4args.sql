DO $$
BEGIN
  IF to_regprocedure('public.check_free_ip_rate_limit(text,text,integer,integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.check_free_ip_rate_limit(text,text,integer,integer) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.check_free_ip_rate_limit(text,text,integer,integer) FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.check_free_ip_rate_limit(text,text,integer,integer) FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.check_free_ip_rate_limit(text,text,integer,integer) TO service_role';
  END IF;
END
$$;
