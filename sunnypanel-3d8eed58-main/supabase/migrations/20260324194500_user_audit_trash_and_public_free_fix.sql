-- Allow user-like panel accounts to access their own audit/trash data
-- and let owned restore/hard-delete actions write audit logs.

-- Legacy restrictive policies from 20260206030939_* override later user policies.
-- Drop them so the scoped policies below can actually take effect.
drop policy if exists restrict_select_admins on public.audit_logs;
drop policy if exists restrict_select_admins on public.licenses;
drop policy if exists restrict_select_admins on public.license_devices;

-- User-like accounts can read audit rows for keys they own,
-- plus rows they themselves created through log_audit().
drop policy if exists "Users read own audit logs" on public.audit_logs;
create policy "Users read own audit logs"
on public.audit_logs
for select
to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or (
    (public.has_role(auth.uid(), 'user') or public.has_role(auth.uid(), 'moderator'))
    and (
      coalesce(nullif(detail->>'actor_user_id', ''), '00000000-0000-0000-0000-000000000000')::uuid = auth.uid()
      or exists (
        select 1
        from public.licenses l
        where l.key = audit_logs.license_key
          and l.created_by = auth.uid()
      )
    )
  )
);

-- Extend audit whitelist so user-like accounts can restore and hard delete their own keys.
create or replace function public.log_audit(
  p_action text,
  p_license_key text,
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_action text := upper(trim(coalesce(p_action, '')));
  v_key text := upper(trim(coalesce(p_license_key, '')));
  v_is_admin boolean := false;
  v_owns boolean := false;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  v_is_admin := public.has_role(v_uid, 'admin');

  if not v_is_admin then
    if v_action not in (
      'CREATE',
      'UPDATE',
      'SOFT_DELETE',
      'DELETE',
      'RESTORE',
      'HARD_DELETE',
      'REACTIVATE_RENEW',
      'RESET_DEVICES',
      'RESET_DEVICES_PENALTY'
    ) then
      raise exception 'NOT_ALLOWED';
    end if;

    if v_action <> 'CREATE' then
      select exists (
        select 1
        from public.licenses l
        where l.key = v_key
          and l.created_by = v_uid
      )
      into v_owns;

      if not v_owns then
        raise exception 'NOT_ALLOWED';
      end if;
    end if;
  end if;

  insert into public.audit_logs(action, license_key, detail)
  values (
    v_action,
    v_key,
    coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('actor_user_id', v_uid)
  );
end;
$$;

grant execute on function public.log_audit(text, text, jsonb) to authenticated;
