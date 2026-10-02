CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE licenses_free_sessions (
 session_id uuid PRIMARY KEY, status text DEFAULT 'waiting', closed_at timestamptz,
 out_token_hash text,out_token_hash_pass2 text,claim_token_hash text,
 expires_at timestamptz,out_expires_at timestamptz,claim_expires_at timestamptz,
 fingerprint_hash text,ip_hash text,ua_hash text,passes_required integer DEFAULT 1,
 passes_completed integer DEFAULT 0,current_pass integer DEFAULT 1,gate_flow_version text,
 pass1_ok_at timestamptz,pass2_ok_at timestamptz,gate_ok_at timestamptz,
 last_error text,reveal_count integer DEFAULT 0,revealed_at timestamptz,
 app_code text DEFAULT 'free-fire',selection_meta jsonb,started_at timestamptz,
 key_type_code text,duration_seconds integer,trace_id text,gate_token_life_seconds integer,
 provider_id_pass1 uuid,provider_id_pass2 uuid,shortlink_channel text,
 package_code text,credit_code text,wallet_kind text,revealed_license_id uuid,
 close_deadline_at timestamptz,copied_at timestamptz,issued_server_redeem_key_id uuid,
 issued_server_reward_mode text
);
CREATE TABLE licenses_free_gate_tokens(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid,pass_no integer,
 token_hash text UNIQUE NOT NULL,status text,activate_after_at timestamptz,expires_at timestamptz,
 used_at timestamptz,burned_at timestamptz,provider_id uuid,shortlink_channel text,short_url text,
 ip_hash text,ua_hash text,fingerprint_hash text,fail_reason text,created_at timestamptz DEFAULT clock_timestamp()
);
CREATE TABLE licenses_free_shortlink_providers(id uuid PRIMARY KEY,provider text);
CREATE TABLE licenses_free_blocklist(id uuid DEFAULT gen_random_uuid(),enabled boolean,blocked_until timestamptz,fingerprint_hash text,ip_hash text);
CREATE TABLE licenses_free_issues(issue_id uuid DEFAULT gen_random_uuid(),license_id uuid,key_mask text,expires_at timestamptz,
 session_id uuid,ip_hash text,fingerprint_hash text,ua_hash text,app_code text,key_signature text,server_redeem_key_id uuid,
 created_at timestamptz DEFAULT clock_timestamp());
CREATE TABLE licenses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),key text UNIQUE,app_code text,expires_at timestamptz);

CREATE TABLE server_app_redeem_keys(id uuid PRIMARY KEY);
CREATE TABLE ai_sunny_redeem_keys(id uuid PRIMARY KEY);
ALTER TABLE licenses_free_sessions ADD FOREIGN KEY(issued_server_redeem_key_id) REFERENCES server_app_redeem_keys(id),
 ADD FOREIGN KEY(revealed_license_id) REFERENCES licenses(id);
ALTER TABLE licenses_free_issues ADD FOREIGN KEY(server_redeem_key_id) REFERENCES server_app_redeem_keys(id),
 ADD FOREIGN KEY(license_id) REFERENCES licenses(id);

CREATE TABLE licenses_free_settings(id integer PRIMARY KEY,free_enabled boolean,free_secondary_enabled boolean);
INSERT INTO licenses_free_settings VALUES(1,true,true);
