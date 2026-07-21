begin;
drop function if exists public.issue_sunny_v34_lease(uuid,text,text,text);
delete from public.security_client_builds where build_id = 'sunny-v34-ac-20260721';
-- Device key and generation columns are intentionally retained to avoid destructive rollback.
commit;
