DO $$
BEGIN
  IF to_regprocedure('public.check_ip_rate_limit(text, integer, integer)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.check_ip_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.check_ip_rate_limit(text, integer, integer) TO service_role;
  END IF;

  IF to_regprocedure('public.check_new_device_rate_limit(text, integer, integer)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.check_new_device_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.check_new_device_rate_limit(text, integer, integer) TO service_role;
  END IF;

  IF to_regprocedure('public.cleanup_verify_tables(integer)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.cleanup_verify_tables(integer) FROM PUBLIC, anon, authenticated;
  END IF;

  IF to_regprocedure('public.cleanup_free_key_tables(integer, integer, integer)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.cleanup_free_key_tables(integer, integer, integer) FROM PUBLIC, anon, authenticated;
  END IF;

  IF to_regprocedure('public.check_free_ip_rate_limit(text, text, integer, integer)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.check_free_ip_rate_limit(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.check_free_ip_rate_limit(text, text, integer, integer) TO service_role;
  END IF;
END $$;
