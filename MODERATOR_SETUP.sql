-- Đổi EMAIL_HELPER thành email tài khoản phụ quản lý panel.
-- Metadata role sẽ luôn được set trước.
-- Nếu public.user_roles đã tồn tại, script sẽ backfill luôn vào bảng role.

update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('panel_role', 'moderator')
where email = 'EMAIL_HELPER';

do $$
begin
  if to_regclass('public.user_roles') is not null then
    insert into public.user_roles (user_id, role)
    select id, 'moderator'::public.app_role
    from auth.users
    where email = 'EMAIL_HELPER'
    on conflict (user_id, role) do nothing;
  else
    raise notice 'public.user_roles is missing, metadata updated only';
  end if;
end
$$;
