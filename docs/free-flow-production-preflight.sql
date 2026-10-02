-- Read-only. Run in the production SQL editor; do not paste secrets/tokens back.
WITH required(table_name,column_name) AS (VALUES
 ('licenses_free_sessions','out_token_hash'),('licenses_free_sessions','out_token_hash_pass2'),
 ('licenses_free_sessions','claim_token_hash'),('licenses_free_sessions','claim_expires_at'),
 ('licenses_free_sessions','out_expires_at'),('licenses_free_sessions','expires_at'),
 ('licenses_free_sessions','current_pass'),('licenses_free_sessions','passes_required'),
 ('licenses_free_sessions','passes_completed'),('licenses_free_sessions','pass1_ok_at'),
 ('licenses_free_sessions','pass2_ok_at'),('licenses_free_sessions','gate_ok_at'),
 ('licenses_free_sessions','closed_at'),('licenses_free_sessions','gate_flow_version'),
 ('licenses_free_sessions','shortlink_channel'),('licenses_free_sessions','selection_meta'),
 ('licenses_free_sessions','revealed_license_id'),('licenses_free_sessions','issued_server_redeem_key_id'),
 ('licenses_free_issues','server_redeem_key_id'),('licenses_free_issues','app_code'),
 ('licenses_free_issues','ua_hash'),('licenses_free_gate_tokens','activate_after_at'),
 ('licenses_free_gate_tokens','expires_at'),('licenses_free_gate_tokens','used_at'),
 ('licenses_free_gate_tokens','shortlink_channel'),('licenses_free_settings','free_secondary_enabled'))
SELECT r.* FROM required r LEFT JOIN information_schema.columns c
 ON c.table_schema='public' AND c.table_name=r.table_name AND c.column_name=r.column_name
WHERE c.column_name IS NULL;

SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN
 ('licenses_free_sessions','licenses_free_gate_tokens','licenses_free_issues','licenses_free_shortlink_providers');

SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
 ('licenses_free_sessions','licenses_free_gate_tokens','licenses_free_issues','licenses_free_shortlink_providers');

SELECT p.oid::regprocedure AS function,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_can_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_can_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_can_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
AND (p.proname LIKE 'free_flow_%' OR p.proname='insert_free_license_compat');

SELECT extname FROM pg_extension WHERE extname='pg_cron';
SELECT status,current_pass,passes_required,count(*) FROM public.licenses_free_sessions
WHERE created_at>now()-interval '1 day' GROUP BY status,current_pass,passes_required;

-- Post-migration only: expect two rows.
SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND
 ((table_name='licenses_free_sessions' AND column_name='issued_ai_redeem_key_id') OR
 (table_name='licenses_free_issues' AND column_name='ai_redeem_key_id'));
