BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Real crypto smoke test runs on the target database before any changes.
DO $$ DECLARE ext text; encrypted bytea; decrypted text;BEGIN
 SELECT n.nspname INTO ext FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgcrypto';
 EXECUTE format('SELECT %I.pgp_sym_encrypt($1,$2,''cipher-algo=aes256,compress-algo=0'')',ext) INTO encrypted USING 'key-vault-preflight',gen_random_uuid()::text;
 IF encrypted IS NULL THEN RAISE EXCEPTION 'KEY_VAULT_CRYPTO_UNAVAILABLE';END IF;
 -- Round-trip with a throwaway test password; no actual key is printed.
 EXECUTE format('SELECT %I.pgp_sym_decrypt(%I.pgp_sym_encrypt($1,$2,''cipher-algo=aes256,compress-algo=0''),$2)',ext,ext) INTO decrypted USING 'key-vault-preflight','temporary-preflight-password';
 IF decrypted IS DISTINCT FROM 'key-vault-preflight' THEN RAISE EXCEPTION 'KEY_VAULT_CRYPTO_FAILED';END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS sunny_key_private;
REVOKE ALL ON SCHEMA sunny_key_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE IF NOT EXISTS sunny_key_private.master_key (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), secret text NOT NULL
);
INSERT INTO sunny_key_private.master_key(singleton,secret)
 VALUES(true,gen_random_uuid()::text||gen_random_uuid()::text) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS sunny_key_private.key_vault (
 key_id uuid PRIMARY KEY REFERENCES public.customs_keys(id) ON DELETE CASCADE,
 ciphertext bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON ALL TABLES IN SCHEMA sunny_key_private FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION sunny_key_private.store_key(p_id uuid,p_raw text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE k public.customs_keys%ROWTYPE; secret text; ext text; hashed text; encrypted bytea;
BEGIN
 SELECT * INTO k FROM public.customs_keys WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'KEY_NOT_FOUND';END IF;
 IF p_raw IS NULL OR p_raw !~ ('^'||k.signature||'-[A-F0-9]{32}$') THEN RAISE EXCEPTION 'BAD_KEY';END IF;
 SELECT n.nspname INTO ext FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgcrypto';
 EXECUTE format('SELECT encode(%I.digest($1,''sha256''),''hex'')',ext) INTO hashed USING p_raw;
 IF hashed IS DISTINCT FROM k.key_hash THEN RAISE EXCEPTION 'KEY_HASH_MISMATCH';END IF;
 SELECT m.secret INTO secret FROM sunny_key_private.master_key m WHERE singleton;
 EXECUTE format('SELECT %I.pgp_sym_encrypt($1,$2,''cipher-algo=aes256,compress-algo=0'')',ext) INTO encrypted USING p_raw,secret;
 INSERT INTO sunny_key_private.key_vault(key_id,ciphertext) VALUES(p_id,encrypted) ON CONFLICT(key_id) DO NOTHING;
END $$;

-- Keep existing creation/charging rules intact. Strip raw key before audit/ledger.
DO $$ BEGIN
 IF to_regprocedure('sunny_key_private.customs_admin_manage(text,text,uuid,jsonb)') IS NULL THEN
  ALTER FUNCTION public.customs_admin_manage(text,text,uuid,jsonb) SET SCHEMA sunny_key_private;
 END IF;
 IF to_regprocedure('sunny_key_private.moderator_key_action(text,uuid,jsonb)') IS NULL THEN
  ALTER FUNCTION public.moderator_key_action(text,uuid,jsonb) SET SCHEMA sunny_key_private;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.customs_admin_manage(p_action text,p_signature text,p_id uuid DEFAULT NULL,p_data jsonb DEFAULT '{}')
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r jsonb;BEGIN
 r=sunny_key_private.customs_admin_manage(p_action,p_signature,p_id,p_data-'raw_key');
 IF p_action='create' AND r->>'ok'='true' AND p_data ? 'raw_key' THEN
  PERFORM sunny_key_private.store_key((r->>'id')::uuid,p_data->>'raw_key');
 END IF;
 RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.moderator_key_action(p_action text,p_request uuid,p_data jsonb DEFAULT '{}')
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r jsonb;BEGIN
 r=sunny_key_private.moderator_key_action(p_action,p_request,p_data-'raw_key');
 IF p_action='create' AND p_data->>'engine'='customs' AND r->>'ok'='true' AND p_data ? 'raw_key' THEN
  PERFORM sunny_key_private.store_key((r->>'id')::uuid,p_data->>'raw_key');
 END IF;
 RETURN r;
END $$;

-- Separate RPC avoids overload ambiguity and permits rolling backend deployment.
CREATE OR REPLACE FUNCTION public.free_flow_issue_customs_saved(p_session_id uuid,p_key_hash text,p_key_hint text,p_raw_key text,p_close_seconds integer DEFAULT 30)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r jsonb;BEGIN
 r=public.free_flow_issue_customs(p_session_id,p_key_hash,p_key_hint,p_close_seconds);
 IF r->>'ok'='true' THEN PERFORM sunny_key_private.store_key((r->>'id')::uuid,p_raw_key);END IF;
 RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.license_key_reveal(p_engine text,p_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u uuid=auth.uid(); raw text; encrypted bytea; secret text; ext text;
BEGIN
 IF u IS NULL OR NOT (
  COALESCE(public.has_role(u,'admin'::public.app_role),false) OR
  (COALESCE(public.has_role(u,'moderator'::public.app_role),false) AND EXISTS(
   SELECT 1 FROM public.moderator_key_purchases WHERE user_id=u AND engine=p_engine AND license_id=p_id))
 ) THEN RAISE EXCEPTION 'KEY_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF p_engine='sunny' THEN SELECT key INTO raw FROM public.licenses WHERE id=p_id;
 ELSIF p_engine='customs' THEN
  SELECT ciphertext INTO encrypted FROM sunny_key_private.key_vault WHERE key_id=p_id;
  IF encrypted IS NOT NULL THEN
   SELECT m.secret INTO secret FROM sunny_key_private.master_key m WHERE singleton;
   SELECT n.nspname INTO ext FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgcrypto';
   EXECUTE format('SELECT %I.pgp_sym_decrypt($1,$2)',ext) INTO raw USING encrypted,secret;
  END IF;
 ELSE RAISE EXCEPTION 'BAD_ENGINE';END IF;
 RETURN jsonb_build_object('ok',true,'key',raw,'available',raw IS NOT NULL);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sunny_key_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.customs_admin_manage(text,text,uuid,jsonb),public.moderator_key_action(text,uuid,jsonb),public.license_key_reveal(text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.customs_admin_manage(text,text,uuid,jsonb),public.moderator_key_action(text,uuid,jsonb),public.license_key_reveal(text,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.free_flow_issue_customs_saved(uuid,text,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.free_flow_issue_customs_saved(uuid,text,text,text,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
