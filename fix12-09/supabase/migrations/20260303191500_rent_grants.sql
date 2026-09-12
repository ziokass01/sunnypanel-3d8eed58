-- Rent portal: grant minimal privileges to service_role so Edge Functions can access schema rent.
-- Fixes: "permission denied for schema rent" when calling rent/admin functions.

-- Service role needs USAGE on schema + privileges on objects.
GRANT USAGE ON SCHEMA rent TO service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA rent TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA rent TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA rent TO service_role;

-- Future-proof: any new tables/sequences/functions created under rent will inherit grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA rent GRANT ALL PRIVILEGES ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA rent GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA rent GRANT EXECUTE ON FUNCTIONS TO service_role;
