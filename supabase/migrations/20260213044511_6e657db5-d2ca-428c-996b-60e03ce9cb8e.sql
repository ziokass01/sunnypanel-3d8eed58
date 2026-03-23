-- FREE rate-limit per fingerprint (missing objects cause SERVER_RATE_LIMIT_MISCONFIG)

CREATE TABLE IF NOT EXISTS public.free_fp_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fp_hash text NOT NULL,
  route text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS free_fp_rate_limits_uniq
  ON public.free_fp_rate_limits(fp_hash, route, window_start);

ALTER TABLE public.free_fp_rate_limits ENABLE ROW LEVEL SECURITY;

-- No policies: table is internal-only (access via SECURITY DEFINER RPC or service role)

CREATE OR REPLACE FUNCTION public.check_free_fp_rate_limit(
  p_fp_hash text,
  p_route text,
  p_limit integer DEFAULT 60,
  p_window_seconds integer DEFAULT 60
)
RETURNS TABLE(allowed boolean, current_count integer, window_start timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_window_start timestamptz;
  v_count integer;
  v_fp text;
  v_route text;
begin
  v_fp := coalesce(nullif(trim(p_fp_hash), ''), 'unknown');
  v_route := coalesce(nullif(trim(p_route), ''), 'unknown');

  if p_limit is null or p_limit < 1 then p_limit := 60; end if;
  if p_window_seconds is null or p_window_seconds < 10 then p_window_seconds := 60; end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.free_fp_rate_limits (fp_hash, route, window_start, count, updated_at)
  values (v_fp, v_route, v_window_start, 1, now())
  on conflict (fp_hash, route, window_start)
  do update set
    count = public.free_fp_rate_limits.count + 1,
    updated_at = now()
  returning public.free_fp_rate_limits.count into v_count;

  return query select (v_count <= p_limit), v_count, v_window_start;
end;
$$;

-- Refresh schema cache for API
select pg_notify('pgrst', 'reload schema');
