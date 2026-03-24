-- Add explicit deny-all policies to satisfy linter without exposing internal table
DO $$ BEGIN
  -- Policies must be unique names; create if missing
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='free_fp_rate_limits' AND policyname='deny_all_select'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all_select ON public.free_fp_rate_limits FOR SELECT USING (false)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='free_fp_rate_limits' AND policyname='deny_all_insert'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all_insert ON public.free_fp_rate_limits FOR INSERT WITH CHECK (false)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='free_fp_rate_limits' AND policyname='deny_all_update'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all_update ON public.free_fp_rate_limits FOR UPDATE USING (false)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='free_fp_rate_limits' AND policyname='deny_all_delete'
  ) THEN
    EXECUTE 'CREATE POLICY deny_all_delete ON public.free_fp_rate_limits FOR DELETE USING (false)';
  END IF;
END $$;

select pg_notify('pgrst', 'reload schema');
