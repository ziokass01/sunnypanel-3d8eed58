-- Run once in Supabase SQL Editor only when `supabase db push` fails with:
-- role "postgres" is a member of role "cli_login_postgres"
-- The Supabase CLI will recreate this transient login role correctly.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cli_login_postgres') THEN
    EXECUTE 'REVOKE cli_login_postgres FROM postgres';
    EXECUTE 'REVOKE postgres FROM cli_login_postgres';
    EXECUTE 'REASSIGN OWNED BY cli_login_postgres TO postgres';
    EXECUTE 'DROP OWNED BY cli_login_postgres';
    EXECUTE 'DROP ROLE cli_login_postgres';
  END IF;
END
$$;
