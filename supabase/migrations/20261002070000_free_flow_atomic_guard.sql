-- Atomic Free Key transitions. Additive; no verify/reset contract changes.
-- Only service_role may invoke these functions. All decision times come from DB.
-- AI keys belong to ai_sunny_redeem_keys, not server_app_redeem_keys.
-- Separate nullable IDs preserve the existing Find Dumps foreign keys.
ALTER TABLE public.licenses_free_sessions ADD COLUMN IF NOT EXISTS issued_ai_redeem_key_id uuid;
ALTER TABLE public.licenses_free_issues ADD COLUMN IF NOT EXISTS ai_redeem_key_id uuid;
DO $ai$
BEGIN
 IF to_regclass('public.ai_sunny_redeem_keys') IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.licenses_free_sessions'::regclass AND conname='free_sessions_ai_redeem_fk') THEN
   ALTER TABLE public.licenses_free_sessions ADD CONSTRAINT free_sessions_ai_redeem_fk FOREIGN KEY(issued_ai_redeem_key_id) REFERENCES public.ai_sunny_redeem_keys(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.licenses_free_issues'::regclass AND conname='free_issues_ai_redeem_fk') THEN
   ALTER TABLE public.licenses_free_issues ADD CONSTRAINT free_issues_ai_redeem_fk FOREIGN KEY(ai_redeem_key_id) REFERENCES public.ai_sunny_redeem_keys(id) ON DELETE SET NULL NOT VALID;
  END IF;
 END IF;
END $ai$;

CREATE OR REPLACE FUNCTION public.free_flow_burn(p_session_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.licenses_free_sessions SET status='closed', closed_at=clock_timestamp(),
    out_token_hash=NULL, out_token_hash_pass2=NULL, claim_token_hash=NULL,
    out_expires_at=clock_timestamp(), claim_expires_at=NULL, last_error=p_reason
  WHERE session_id=p_session_id AND status NOT IN ('revealing','revealed');
  IF FOUND THEN
    UPDATE public.licenses_free_gate_tokens SET status='closed', burned_at=clock_timestamp(), fail_reason=p_reason
    WHERE session_id=p_session_id AND status<>'closed';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.free_flow_consume_gate(
  p_gate_hash text, p_out_hash text, p_fp_hash text, p_ip_hash text, p_ua_hash text,
  p_session_id text, p_pass integer, p_next_out_hash text, p_claim_hash text,
  p_claim_window integer DEFAULT 180)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.licenses_free_sessions%ROWTYPE; g public.licenses_free_gate_tokens%ROWTYPE;
  sid uuid; n timestamptz; reason text; expected_out text; required integer;
BEGIN
  SELECT session_id INTO sid FROM public.licenses_free_gate_tokens WHERE token_hash=p_gate_hash;
  IF sid IS NULL THEN RETURN jsonb_build_object('ok',false,'code','GATE_TOKEN_INVALID'); END IF;
  -- Global lock order is session -> gate. Never close somebody else's session
  -- merely because a client supplied their session_id or an incorrect secret.
  SELECT * INTO s FROM public.licenses_free_sessions WHERE session_id=sid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','SESSION_NOT_FOUND'); END IF;
  SELECT * INTO g FROM public.licenses_free_gate_tokens WHERE token_hash=p_gate_hash FOR UPDATE;
  n := clock_timestamp();
  expected_out := CASE WHEN g.pass_no=2 THEN s.out_token_hash_pass2 ELSE s.out_token_hash END;
  IF p_out_hash IS NULL OR p_out_hash='' OR expected_out IS NULL OR p_out_hash<>expected_out THEN
    RETURN jsonb_build_object('ok',false,'code','OUT_TOKEN_MISMATCH');
  END IF;
  IF s.status IN ('revealing','revealed') THEN RETURN jsonb_build_object('ok',false,'code','ALREADY_REVEALED'); END IF;
  IF s.status='closed' OR s.closed_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'code','SESSION_CLOSED'); END IF;
  IF g.status<>'pending' THEN RETURN jsonb_build_object('ok',false,'code','GATE_TOKEN_ALREADY_USED'); END IF;
  required := CASE WHEN s.passes_required=2 THEN 2 ELSE 1 END;
  reason := CASE
    WHEN EXISTS(SELECT 1 FROM public.licenses_free_blocklist b WHERE b.enabled AND
      (b.blocked_until IS NULL OR b.blocked_until>n) AND (b.fingerprint_hash=s.fingerprint_hash OR b.ip_hash=s.ip_hash)) THEN 'BLOCKED'
    WHEN NOT EXISTS(SELECT 1 FROM public.licenses_free_settings cfg WHERE cfg.id=1 AND
      CASE WHEN s.shortlink_channel='secondary' THEN coalesce(cfg.free_secondary_enabled,false) ELSE coalesce(cfg.free_enabled,false) END) THEN 'FREE_DISABLED'
    WHEN s.expires_at IS NULL OR s.expires_at<=n OR s.out_expires_at IS NULL OR s.out_expires_at<=n THEN 'SESSION_EXPIRED'
    WHEN s.gate_flow_version<>'tokenized_v1' OR s.gate_flow_version IS NULL THEN 'TOKENIZED_GATE_REQUIRED'
    WHEN p_session_id IS NOT NULL AND p_session_id<>'' AND p_session_id<>sid::text THEN 'SESSION_MISMATCH'
    WHEN p_pass IS NULL OR p_pass NOT IN (1,2) OR g.pass_no IS NULL OR p_pass<>g.pass_no
      OR s.passes_required NOT IN (1,2) OR s.passes_required IS NULL OR s.current_pass IS DISTINCT FROM g.pass_no
      OR s.passes_completed IS DISTINCT FROM (g.pass_no-1) OR g.pass_no>required
      OR s.status<>CASE WHEN g.pass_no=2 THEN 'waiting_pass2' ELSE 'waiting' END THEN 'GATE_PASS_INVALID'
    WHEN p_fp_hash IS NULL OR p_fp_hash='' OR s.fingerprint_hash IS DISTINCT FROM p_fp_hash
      OR g.fingerprint_hash IS DISTINCT FROM p_fp_hash THEN 'DEVICE_MISMATCH'
    WHEN p_ip_hash IS NULL OR p_ip_hash='' OR s.ip_hash IS DISTINCT FROM p_ip_hash
      OR g.ip_hash IS DISTINCT FROM p_ip_hash THEN 'IP_MISMATCH'
    WHEN p_ua_hash IS NULL OR p_ua_hash='' OR s.ua_hash IS DISTINCT FROM p_ua_hash
      OR g.ua_hash IS DISTINCT FROM p_ua_hash THEN 'UA_MISMATCH'
    WHEN g.activate_after_at IS NULL OR g.expires_at IS NULL OR g.expires_at<=g.activate_after_at THEN 'GATE_TIME_INVALID'
    WHEN n<g.activate_after_at THEN 'GATE_TOO_EARLY'
    WHEN n>=g.expires_at THEN 'GATE_TOKEN_EXPIRED'
    ELSE NULL END;
  -- Any shortlink provider may return prematurely; rotate only an authenticated pair.
  -- This is a replacement attempt, never a successful pass; retire the entire
  -- old pair and restart the delay with a fresh opaque destination.
  IF reason='GATE_TOO_EARLY' THEN
    IF coalesce((s.selection_meta->>'free_rotation_count')::integer,0)>=3 THEN
      reason:='SHORTLINK_ROTATION_LIMIT';
    ELSIF p_next_out_hash IS NULL OR length(p_next_out_hash)<>64 OR p_next_out_hash=p_out_hash THEN
      RETURN jsonb_build_object('ok',false,'code','NEXT_TOKEN_INVALID');
    ELSE
      UPDATE public.licenses_free_gate_tokens SET status='closed',burned_at=n,
        fail_reason='SHORTLINK_EARLY_RETURN_FALLBACK' WHERE id=g.id;
      UPDATE public.licenses_free_sessions SET
        out_token_hash=CASE WHEN g.pass_no=1 THEN p_next_out_hash ELSE NULL END,
        out_token_hash_pass2=CASE WHEN g.pass_no=2 THEN p_next_out_hash ELSE NULL END,
        selection_meta=coalesce(selection_meta,'{}'::jsonb)||jsonb_build_object('free_rotation_count',
          coalesce((selection_meta->>'free_rotation_count')::integer,0)+1)
      WHERE session_id=sid;
      RETURN jsonb_build_object('ok',true,'next','SHORTLINK_FALLBACK','session_id',sid,
        'pass_no',g.pass_no,'exclude_provider_id',g.provider_id);
    END IF;
  END IF;
  IF reason IS NOT NULL THEN
    PERFORM public.free_flow_burn(sid,reason);
    RETURN jsonb_build_object('ok',false,'code',reason);
  END IF;
  IF g.pass_no=1 AND required=2 THEN
    IF p_next_out_hash IS NULL OR length(p_next_out_hash)<>64 OR p_next_out_hash=p_out_hash THEN
      RETURN jsonb_build_object('ok',false,'code','NEXT_TOKEN_INVALID');
    END IF;
    UPDATE public.licenses_free_gate_tokens SET status='used',used_at=n WHERE id=g.id;
    UPDATE public.licenses_free_sessions SET status='waiting_pass2',passes_completed=1,current_pass=2,
      pass1_ok_at=n,gate_ok_at=NULL,out_token_hash=NULL,out_token_hash_pass2=p_next_out_hash,
      claim_token_hash=NULL,claim_expires_at=NULL,last_error=NULL WHERE session_id=sid;
    RETURN jsonb_build_object('ok',true,'next','PASS2','session_id',sid,'pass_no',g.pass_no);
  END IF;
  IF p_claim_hash IS NULL OR length(p_claim_hash)<>64 THEN RETURN jsonb_build_object('ok',false,'code','CLAIM_TOKEN_INVALID'); END IF;
  UPDATE public.licenses_free_gate_tokens SET status='used',used_at=n WHERE id=g.id;
  UPDATE public.licenses_free_sessions SET status='gate_ok',passes_completed=required,current_pass=g.pass_no,
    gate_ok_at=n,pass1_ok_at=CASE WHEN g.pass_no=1 THEN n ELSE pass1_ok_at END,
    pass2_ok_at=CASE WHEN g.pass_no=2 THEN n ELSE NULL END,
    claim_token_hash=p_claim_hash,
    claim_expires_at=LEAST(s.expires_at,n+make_interval(secs=>GREATEST(30,LEAST(600,p_claim_window)))),last_error=NULL
  WHERE session_id=sid RETURNING * INTO s;
  RETURN jsonb_build_object('ok',true,'next','CLAIM','session_id',sid,'claim_expires_at',s.claim_expires_at);
END $$;

CREATE OR REPLACE FUNCTION public.free_flow_publish_gate(
  p_pass integer,p_session_id uuid,p_out_hash text,p_gate_hash text,p_short_url text,p_provider_id uuid,
  p_delay integer,p_life integer,p_channel text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.licenses_free_sessions%ROWTYPE; n timestamptz;
BEGIN
  SELECT * INTO s FROM public.licenses_free_sessions WHERE session_id=p_session_id FOR UPDATE;
  n:=clock_timestamp();
  IF NOT FOUND OR s.status<>(CASE WHEN p_pass=2 THEN 'waiting_pass2' ELSE 'waiting' END) OR s.closed_at IS NOT NULL
    OR p_pass NOT IN (1,2) OR s.current_pass<>p_pass OR s.passes_completed<>p_pass-1
    OR (CASE WHEN p_pass=2 THEN s.out_token_hash_pass2 ELSE s.out_token_hash END) IS DISTINCT FROM p_out_hash
    OR s.expires_at IS NULL OR s.expires_at<=n+make_interval(secs=>GREATEST(0,p_delay)) THEN RETURN jsonb_build_object('ok',false,'code','PASS2_NOT_READY'); END IF;
  IF EXISTS (SELECT 1 FROM public.licenses_free_gate_tokens WHERE session_id=p_session_id AND pass_no=p_pass AND (status='pending' OR used_at IS NOT NULL)) THEN
    RETURN jsonb_build_object('ok',false,'code','PASS2_ALREADY_CREATED'); END IF;
  IF length(p_gate_hash)<>64 OR p_gate_hash IS NULL OR p_short_url IS NULL OR p_short_url!~'^https://' THEN
    RETURN jsonb_build_object('ok',false,'code','PASS2_SHORTLINK_INVALID'); END IF;
  INSERT INTO public.licenses_free_gate_tokens(session_id,pass_no,token_hash,status,activate_after_at,expires_at,
    provider_id,shortlink_channel,short_url,ip_hash,ua_hash,fingerprint_hash)
  VALUES(p_session_id,p_pass,p_gate_hash,'pending',n+make_interval(secs=>GREATEST(0,p_delay)),
    LEAST(s.expires_at,n+make_interval(secs=>GREATEST(0,p_delay)+GREATEST(60,LEAST(1800,p_life)))),
    p_provider_id,p_channel,p_short_url,s.ip_hash,s.ua_hash,s.fingerprint_hash);
  UPDATE public.licenses_free_sessions SET provider_id_pass1=CASE WHEN p_pass=1 THEN p_provider_id ELSE provider_id_pass1 END,
    provider_id_pass2=CASE WHEN p_pass=2 THEN p_provider_id ELSE provider_id_pass2 END,last_error=NULL WHERE session_id=p_session_id;
  RETURN jsonb_build_object('ok',true);
END $$;

CREATE OR REPLACE FUNCTION public.free_flow_begin_claim(
  p_claim_hash text,p_out_hash text,p_fp_hash text,p_ip_hash text,p_ua_hash text,p_session_id text,
  p_fp_limit integer DEFAULT 0,p_ip_limit integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.licenses_free_sessions%ROWTYPE; g public.licenses_free_gate_tokens%ROWTYPE;
  n timestamptz; previous_used timestamptz; reason text; required integer; i integer;
  day_start timestamptz; quota_count bigint; in_progress bigint;
BEGIN
  -- Serializes quota reservation across sessions for this app/identity, then
  -- serializes issuance for this particular session.
  SELECT * INTO s FROM public.licenses_free_sessions WHERE claim_token_hash=p_claim_hash;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','SESSION_NOT_FOUND'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('free-ip:'||coalesce(s.app_code,'free-fire')||':'||s.ip_hash,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('free-fp:'||coalesce(s.app_code,'free-fire')||':'||s.fingerprint_hash,0));
  SELECT * INTO s FROM public.licenses_free_sessions WHERE session_id=s.session_id FOR UPDATE;
  n:=clock_timestamp();
  IF s.claim_token_hash IS DISTINCT FROM p_claim_hash
    OR p_out_hash IS NULL OR p_out_hash='' OR p_out_hash IS DISTINCT FROM
      (CASE WHEN s.passes_required=2 THEN s.out_token_hash_pass2 ELSE s.out_token_hash END) THEN
    RETURN jsonb_build_object('ok',false,'code','TOKEN_PAIR_INVALID'); END IF;
  IF s.status='revealing' THEN RETURN jsonb_build_object('ok',false,'code','REVEAL_IN_PROGRESS'); END IF;
  IF s.status='revealed' THEN RETURN jsonb_build_object('ok',false,'code','CLAIM_ALREADY_USED'); END IF;
  required:=CASE WHEN s.passes_required=2 THEN 2 ELSE 1 END;
  reason:=CASE
    WHEN s.status IS NULL OR s.status='closed' OR s.closed_at IS NOT NULL THEN 'SESSION_CLOSED'
    WHEN EXISTS(SELECT 1 FROM public.licenses_free_blocklist b WHERE b.enabled AND
      (b.blocked_until IS NULL OR b.blocked_until>n) AND (b.fingerprint_hash=s.fingerprint_hash OR b.ip_hash=s.ip_hash)) THEN 'BLOCKED'
    WHEN NOT EXISTS(SELECT 1 FROM public.licenses_free_settings cfg WHERE cfg.id=1 AND
      CASE WHEN s.shortlink_channel='secondary' THEN coalesce(cfg.free_secondary_enabled,false) ELSE coalesce(cfg.free_enabled,false) END) THEN 'FREE_DISABLED'
    WHEN s.expires_at IS NULL OR s.expires_at<=n OR s.out_expires_at IS NULL OR s.out_expires_at<=n THEN 'SESSION_EXPIRED'
    WHEN s.claim_expires_at IS NULL OR s.claim_expires_at<=n THEN 'CLAIM_EXPIRED'
    WHEN s.status<>'gate_ok' OR s.gate_flow_version IS DISTINCT FROM 'tokenized_v1' THEN 'GATE_STATUS_INVALID'
    WHEN s.passes_required IS NULL OR s.passes_required NOT IN (1,2) OR s.passes_completed IS DISTINCT FROM required OR s.current_pass IS DISTINCT FROM required THEN 'GATE_PASSES_INCOMPLETE'
    WHEN p_session_id IS NOT NULL AND p_session_id<>'' AND p_session_id<>s.session_id::text THEN 'SESSION_MISMATCH'
    WHEN p_fp_hash IS NULL OR p_fp_hash='' OR s.fingerprint_hash IS DISTINCT FROM p_fp_hash THEN 'FP_MISMATCH'
    WHEN p_ip_hash IS NULL OR p_ip_hash='' OR s.ip_hash IS DISTINCT FROM p_ip_hash THEN 'IP_MISMATCH'
    WHEN p_ua_hash IS NULL OR p_ua_hash='' OR s.ua_hash IS DISTINCT FROM p_ua_hash THEN 'UA_MISMATCH'
    ELSE NULL END;
  IF reason IS NULL THEN
    FOR i IN 1..required LOOP
      SELECT * INTO g FROM public.licenses_free_gate_tokens WHERE session_id=s.session_id AND pass_no=i
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
      IF NOT FOUND OR g.status<>'used' OR g.used_at IS NULL OR g.activate_after_at IS NULL OR g.expires_at IS NULL
        OR g.used_at<g.activate_after_at OR g.used_at>=g.expires_at
        OR g.fingerprint_hash IS DISTINCT FROM s.fingerprint_hash OR g.ip_hash IS DISTINCT FROM s.ip_hash
        OR g.ua_hash IS DISTINCT FROM s.ua_hash
        OR (i=1 AND s.pass1_ok_at IS DISTINCT FROM g.used_at)
        OR (i=2 AND (s.pass2_ok_at IS DISTINCT FROM g.used_at OR g.created_at<previous_used)) THEN
        reason:='GATE_CHAIN_INVALID'; EXIT;
      END IF;
      previous_used:=g.used_at;
    END LOOP;
    IF reason IS NULL AND s.gate_ok_at IS DISTINCT FROM previous_used THEN reason:='GATE_CHAIN_INVALID'; END IF;
  END IF;
  IF reason IS NOT NULL THEN
    PERFORM public.free_flow_burn(s.session_id,reason);
    RETURN jsonb_build_object('ok',false,'code',reason);
  END IF;
  day_start:=date_trunc('day',n AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  IF p_fp_limit>0 THEN
    SELECT count(*) INTO quota_count FROM public.licenses_free_issues WHERE fingerprint_hash=s.fingerprint_hash
      AND app_code=coalesce(s.app_code,'free-fire') AND created_at>=day_start AND created_at<day_start+interval '1 day';
    SELECT count(*) INTO in_progress FROM public.licenses_free_sessions WHERE fingerprint_hash=s.fingerprint_hash
      AND app_code=coalesce(s.app_code,'free-fire') AND status='revealing' AND revealed_at>=day_start;
    IF quota_count+in_progress>=p_fp_limit THEN
      PERFORM public.free_flow_burn(s.session_id,'DAILY_QUOTA_FP'); RETURN jsonb_build_object('ok',false,'code','RATE_LIMIT'); END IF;
  END IF;
  IF p_ip_limit>0 THEN
    SELECT count(*) INTO quota_count FROM public.licenses_free_issues WHERE ip_hash=s.ip_hash
      AND app_code=coalesce(s.app_code,'free-fire') AND created_at>=day_start AND created_at<day_start+interval '1 day';
    SELECT count(*) INTO in_progress FROM public.licenses_free_sessions WHERE ip_hash=s.ip_hash
      AND app_code=coalesce(s.app_code,'free-fire') AND status='revealing' AND revealed_at>=day_start;
    IF quota_count+in_progress>=p_ip_limit THEN
      PERFORM public.free_flow_burn(s.session_id,'DAILY_QUOTA_IP'); RETURN jsonb_build_object('ok',false,'code','RATE_LIMIT'); END IF;
  END IF;
  UPDATE public.licenses_free_sessions SET status='revealing',reveal_count=1,revealed_at=n,last_error=NULL WHERE session_id=s.session_id;
  RETURN jsonb_build_object('ok',true,'session_id',s.session_id);
END $$;

CREATE OR REPLACE FUNCTION public.free_flow_finish_claim(
 p_session_id uuid,p_license_id uuid,p_key_mask text,p_expires_at timestamptz,
 p_app_code text,p_signature text,p_redeem_id uuid,p_reward_mode text,p_close_seconds integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.licenses_free_sessions%ROWTYPE; n timestamptz:=clock_timestamp();
BEGIN
 SELECT * INTO s FROM public.licenses_free_sessions WHERE session_id=p_session_id FOR UPDATE;
 IF NOT FOUND OR s.status<>'revealing' OR s.reveal_count<>1 THEN
   RETURN jsonb_build_object('ok',false,'code','ISSUE_STATE_INVALID'); END IF;
 IF p_license_id IS NULL AND p_redeem_id IS NULL THEN
   RETURN jsonb_build_object('ok',false,'code','ISSUE_ID_REQUIRED'); END IF;
 INSERT INTO public.licenses_free_issues(license_id,key_mask,expires_at,session_id,ip_hash,fingerprint_hash,
   ua_hash,app_code,key_signature,server_redeem_key_id,ai_redeem_key_id)
 VALUES(p_license_id,p_key_mask,p_expires_at,p_session_id,s.ip_hash,s.fingerprint_hash,s.ua_hash,p_app_code,p_signature,CASE WHEN p_app_code='ai-coding' THEN NULL ELSE p_redeem_id END,
   CASE WHEN p_app_code='ai-coding' THEN p_redeem_id ELSE NULL END);
 UPDATE public.licenses_free_sessions SET status='revealed',last_error=NULL,revealed_at=n,
   revealed_license_id=p_license_id,issued_server_redeem_key_id=CASE WHEN p_app_code='ai-coding' THEN NULL ELSE p_redeem_id END,
   issued_ai_redeem_key_id=CASE WHEN p_app_code='ai-coding' THEN p_redeem_id ELSE NULL END,issued_server_reward_mode=p_reward_mode,
   out_token_hash=NULL,out_token_hash_pass2=NULL,claim_token_hash=NULL,claim_expires_at=NULL,out_expires_at=n,
   close_deadline_at=n+make_interval(secs=>GREATEST(10,p_close_seconds)),copied_at=NULL
 WHERE session_id=p_session_id;
 UPDATE public.licenses_free_gate_tokens SET status='closed' WHERE session_id=p_session_id;
 RETURN jsonb_build_object('ok',true);
END $$;

-- Traffic-driven expiry plus optional existing pg_cron. Audit rows remain,
-- but all bearer hashes are revoked; no expired token can authorize a request.
CREATE OR REPLACE FUNCTION public.free_flow_expire()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; count_closed integer:=0;
BEGIN
  FOR r IN SELECT s.session_id FROM public.licenses_free_sessions s
    WHERE s.status IN ('waiting','waiting_pass2','gate_ok') AND
      (s.expires_at<=clock_timestamp() OR s.out_expires_at<=clock_timestamp()
        OR (s.status='gate_ok' AND s.claim_expires_at<=clock_timestamp())
        OR EXISTS(SELECT 1 FROM public.licenses_free_gate_tokens g WHERE g.session_id=s.session_id
          AND g.status='pending' AND g.expires_at<=clock_timestamp()))
    LIMIT 100 FOR UPDATE OF s SKIP LOCKED LOOP
    PERFORM public.free_flow_burn(r.session_id,'TOKEN_TTL_EXPIRED'); count_closed:=count_closed+1;
  END LOOP;
  RETURN count_closed;
END $$;

REVOKE ALL ON FUNCTION public.free_flow_burn(uuid,text),
  public.free_flow_consume_gate(text,text,text,text,text,text,integer,text,text,integer),
  public.free_flow_publish_gate(integer,uuid,text,text,text,uuid,integer,integer,text),
  public.free_flow_begin_claim(text,text,text,text,text,text,integer,integer), public.free_flow_expire(),
  public.free_flow_finish_claim(uuid,uuid,text,timestamptz,text,text,uuid,text,integer)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.free_flow_burn(uuid,text),
  public.free_flow_consume_gate(text,text,text,text,text,text,integer,text,text,integer),
  public.free_flow_publish_gate(integer,uuid,text,text,text,uuid,integer,integer,text),
  public.free_flow_begin_claim(text,text,text,text,text,text,integer,integer), public.free_flow_expire(),
  public.free_flow_finish_claim(uuid,uuid,text,timestamptz,text,text,uuid,text,integer)
TO service_role;
NOTIFY pgrst,'reload schema';

-- Reuse pg_cron only when already installed; never install extensions here.
DO $cron$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
   EXECUTE $job$SELECT cron.schedule('sunny-free-flow-expire','* * * * *','SELECT public.free_flow_expire()')$job$;
 END IF;
END $cron$;
