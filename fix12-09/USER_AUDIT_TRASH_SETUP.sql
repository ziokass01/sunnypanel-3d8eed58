-- Replace HELPER_EMAIL with your helper/staff account email.
-- This gives the account panel role `user` so it can access Dashboard, Licenses, Audit logs and Trash.

update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('panel_role', 'user')
where email = 'HELPER_EMAIL';

insert into public.user_roles(user_id, role)
select id, 'user'::public.app_role
from auth.users
where email = 'HELPER_EMAIL'
on conflict (user_id, role) do nothing;
