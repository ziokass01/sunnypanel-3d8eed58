-- Tighten access on sensitive RPCs/views without changing business logic.

DO $$
BEGIN
  IF to_regprocedure('public.check_free_ip_rate_limit(text,integer,integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.check_free_ip_rate_limit(text,integer,integer) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.check_free_ip_rate_limit(text,integer,integer) FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.check_free_ip_rate_limit(text,integer,integer) FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.check_free_ip_rate_limit(text,integer,integer) TO service_role';
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regprocedure('public.check_free_fp_rate_limit(text,text,integer,integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.check_free_fp_rate_limit(text,text,integer,integer) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.check_free_fp_rate_limit(text,text,integer,integer) FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.check_free_fp_rate_limit(text,text,integer,integer) FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.check_free_fp_rate_limit(text,text,integer,integer) TO service_role';
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regprocedure('public.check_rate_limit(text,text,integer,integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text,text,integer,integer) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text,text,integer,integer) FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text,text,integer,integer) FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.check_rate_limit(text,text,integer,integer) TO service_role';
  END IF;
END
$$;

-- Keep dashboard admin flow via authenticated, relying on existing admin guard in function body.
DO $$
BEGIN
  IF to_regprocedure('public.verify_counts_per_day(integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.verify_counts_per_day(integer) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.verify_counts_per_day(integer) FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.verify_counts_per_day(integer) FROM service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.verify_counts_per_day(integer) TO authenticated';
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.free_ip_rate_limits') IS NOT NULL THEN
    EXECUTE 'REVOKE SELECT ON TABLE public.free_ip_rate_limits FROM PUBLIC';
    EXECUTE 'REVOKE SELECT ON TABLE public.free_ip_rate_limits FROM anon';
    EXECUTE 'REVOKE SELECT ON TABLE public.free_ip_rate_limits FROM authenticated';
    EXECUTE 'GRANT SELECT ON TABLE public.free_ip_rate_limits TO service_role';
  END IF;
END
$$;
