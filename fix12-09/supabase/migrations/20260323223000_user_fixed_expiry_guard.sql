begin;

create or replace function public.enforce_license_write_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_is_user_like boolean := false;
  v_limit_seconds integer := 2592000;
  v_start_on_first_use boolean := false;
  v_duration_seconds integer := null;
begin
  if auth.role() is distinct from 'authenticated' or v_uid is null then
    return new;
  end if;

  v_is_admin := public.has_role(v_uid, 'admin');
  v_is_user_like := public.has_role(v_uid, 'user') or public.has_role(v_uid, 'moderator');

  if v_is_admin then
    return new;
  end if;

  if not v_is_user_like then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if new.created_by is null then
    new.created_by := v_uid;
  end if;

  if new.created_by is distinct from v_uid then
    raise exception 'FORBIDDEN_CREATED_BY';
  end if;

  if public.is_free_license(new.note) then
    raise exception 'FORBIDDEN_NOTE_PREFIX';
  end if;

  select coalesce(user_max_duration_seconds, 2592000)
    into v_limit_seconds
  from public.license_reset_settings
  where id = 1;

  v_start_on_first_use :=
    coalesce(new.start_on_first_use, new.starts_on_first_use, false);

  v_duration_seconds :=
    case
      when coalesce(new.duration_seconds, 0) > 0 then new.duration_seconds
      when coalesce(new.duration_days, 0) > 0 then new.duration_days * 86400
      else null
    end;

  if v_start_on_first_use then
    if coalesce(v_duration_seconds, 0) <= 0 then
      raise exception 'DURATION_REQUIRED';
    end if;

    if v_duration_seconds > v_limit_seconds then
      raise exception 'USER_MAX_30_DAYS';
    end if;
  else
    if new.expires_at is null then
      raise exception 'FIXED_EXPIRY_REQUIRED';
    end if;

    if new.expires_at <= now() then
      raise exception 'EXPIRY_MUST_BE_FUTURE';
    end if;

    if new.expires_at > now() + make_interval(secs => v_limit_seconds) then
      raise exception 'USER_MAX_30_DAYS';
    end if;
  end if;

  return new;
end;
$$;

commit;
