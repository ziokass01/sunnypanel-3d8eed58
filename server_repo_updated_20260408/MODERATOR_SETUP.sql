-- Đổi EMAIL_HELPER thành email tài khoản phụ quản lý panel

update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('panel_role', 'moderator')
where email = 'EMAIL_HELPER';

insert into public.user_roles (user_id, role)
select id, 'moderator'::public.app_role
from auth.users
where email = 'EMAIL_HELPER'
on conflict (user_id, role) do nothing;
