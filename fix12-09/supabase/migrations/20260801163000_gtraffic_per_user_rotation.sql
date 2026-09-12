-- Stop treating one user's early GTraffic return as a global provider outage.
-- The Edge function now rotates only that gate/session to the next provider.
-- Clear locks created by the previous global-fallback implementation.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'licenses_free_shortlink_providers'
      AND column_name = 'unavailable_until'
  ) THEN
    EXECUTE 'UPDATE public.licenses_free_shortlink_providers
      SET unavailable_until = NULL
      WHERE unavailable_until IS NOT NULL';

    EXECUTE 'COMMENT ON COLUMN public.licenses_free_shortlink_providers.unavailable_until IS
      ''Deprecated compatibility column. Early GTraffic returns rotate per gate/session and do not set a global lock.''';
  END IF;
END
$$;
