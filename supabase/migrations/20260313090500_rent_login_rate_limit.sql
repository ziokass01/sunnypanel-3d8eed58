CREATE SCHEMA IF NOT EXISTS rent;

CREATE TABLE IF NOT EXISTS rent.login_rate_limits (
  id bigserial PRIMARY KEY,
  ip_hash text NOT NULL,
  username_norm text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rent_login_rate_limits_lookup
  ON rent.login_rate_limits (ip_hash, username_norm, created_at DESC);

CREATE OR REPLACE FUNCTION rent.check_login_rate_limit(
  p_ip text,
  p_username text,
  p_limit integer DEFAULT 10,
  p_window_sec integer DEFAULT 60
)
RETURNS TABLE(allowed boolean, retry_after_sec integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rent, public
AS $$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 10), 1000));
  v_window_sec integer := GREATEST(1, LEAST(COALESCE(p_window_sec, 60), 3600));
  v_cutoff timestamptz := now() - make_interval(secs => v_window_sec);
  v_count integer;
  v_ip_hash text;
  v_username_norm text;
  v_oldest timestamptz;
BEGIN
  v_ip_hash := md5(COALESCE(trim(p_ip), ''));
  v_username_norm := lower(COALESCE(trim(p_username), ''));

  DELETE FROM rent.login_rate_limits
  WHERE created_at < now() - interval '1 day';

  INSERT INTO rent.login_rate_limits (ip_hash, username_norm, created_at)
  VALUES (v_ip_hash, v_username_norm, now());

  SELECT COUNT(*), MIN(created_at)
    INTO v_count, v_oldest
  FROM rent.login_rate_limits
  WHERE ip_hash = v_ip_hash
    AND username_norm = v_username_norm
    AND created_at >= v_cutoff;

  IF v_count > v_limit THEN
    allowed := false;
    retry_after_sec := GREATEST(1, v_window_sec - floor(EXTRACT(EPOCH FROM (now() - v_oldest)))::integer);
    RETURN NEXT;
    RETURN;
  END IF;

  allowed := true;
  retry_after_sec := 0;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON TABLE rent.login_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE rent.login_rate_limits TO service_role;

REVOKE EXECUTE ON FUNCTION rent.check_login_rate_limit(text,text,integer,integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rent.check_login_rate_limit(text,text,integer,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION rent.check_login_rate_limit(text,text,integer,integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION rent.check_login_rate_limit(text,text,integer,integer) TO service_role;
