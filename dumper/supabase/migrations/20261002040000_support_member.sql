-- Additive: independent of Free Key, verify/reset and server runtime.
create table if not exists public.sunny_support_settings (
  id smallint primary key check (id = 1),
  config jsonb not null check (jsonb_typeof(config) = 'object' and octet_length(config::text) <= 60000),
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.sunny_support_settings enable row level security;
revoke all on public.sunny_support_settings from anon, authenticated;
grant select on public.sunny_support_settings to anon, authenticated;
grant update on public.sunny_support_settings to authenticated;
drop policy if exists support_public_read on public.sunny_support_settings;
create policy support_public_read on public.sunny_support_settings for select to anon, authenticated using (true);
drop policy if exists support_admin_write on public.sunny_support_settings;
create policy support_admin_write on public.sunny_support_settings for update to authenticated
using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

insert into public.sunny_support_settings (id,config) values (1,'{
  "title":"Kết nối với SunnyMod","notice":"Tham gia nhóm để nhận thông báo và bản cập nhật mới nhất",
  "community_title":"Cộng đồng SunnyMod","community_description":"Nhận bản cập nhật, hướng dẫn sử dụng và trao đổi cùng các thành viên.",
  "bubble_enabled":true,"banner_enabled":true,
  "links":[
    {"id":"admin","label":"Liên hệ Admin","description":"Hỗ trợ trực tiếp qua Zalo","url":"https://zalo.me/84373752504","platform":"zalo","placement":"contact","enabled":true},
    {"id":"group","label":"Tham gia nhóm Telegram","description":"Cập nhật mới nhất từ SunnyMod","url":"https://t.me/SunnyModCommunity","platform":"telegram","placement":"community","enabled":true}
  ]
}'::jsonb) on conflict (id) do nothing;

-- Revision changes even for direct admin updates, so concurrent editors cannot
-- silently overwrite each other. Validate data at the database boundary too.
create or replace function public.validate_sunny_support() returns trigger
language plpgsql set search_path = public as $$
declare l jsonb; k text; n integer; ids integer;
begin
  foreach k in array array['title','notice','community_title','community_description'] loop
    if jsonb_typeof(new.config->k) is distinct from 'string' or length(new.config->>k)>500 then raise exception 'Invalid support text'; end if;
  end loop;
  if btrim(new.config->>'title')='' or btrim(new.config->>'community_title')='' then raise exception 'Missing support title'; end if;
  if jsonb_typeof(new.config->'bubble_enabled') is distinct from 'boolean' or jsonb_typeof(new.config->'banner_enabled') is distinct from 'boolean' or jsonb_typeof(new.config->'links') is distinct from 'array' then raise exception 'Invalid support config'; end if;
  n:=jsonb_array_length(new.config->'links');
  if n>20 then raise exception 'Too many support links'; end if;
  select count(distinct value->>'id') into ids from jsonb_array_elements(new.config->'links');
  if n<>ids then raise exception 'Duplicate support link id'; end if;
  for l in select value from jsonb_array_elements(new.config->'links') loop
    foreach k in array array['id','label','description','url','platform','placement'] loop
      if jsonb_typeof(l->k) is distinct from 'string' then raise exception 'Invalid support link'; end if;
    end loop;
    if btrim(l->>'id')='' or btrim(l->>'label')='' or length(l->>'label')>100 or length(l->>'description')>500 or length(l->>'url')>2048 or (l->>'url') !~* '^https?://[^[:space:]@/]+([/?#]|$)' or (l->>'platform') not in ('telegram','zalo','youtube','link') or (l->>'placement') not in ('community','contact','other') or jsonb_typeof(l->'enabled') is distinct from 'boolean' then raise exception 'Invalid support link fields'; end if;
  end loop;
  if tg_op='UPDATE' then new.revision:=old.revision+1; else new.revision:=1; end if;
  new.updated_at:=now();
  return new;
end $$;
drop trigger if exists sunny_support_validate on public.sunny_support_settings;
create trigger sunny_support_validate before insert or update on public.sunny_support_settings for each row execute function public.validate_sunny_support();

create or replace function public.save_sunny_support(p_config jsonb, p_expected_revision integer) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare r public.sunny_support_settings;
begin
  if auth.uid() is null or not public.has_role(auth.uid(),'admin') then raise exception 'Admin required' using errcode='42501'; end if;
  update public.sunny_support_settings set config=p_config where id=1 and revision=p_expected_revision returning * into r;
  if not found then raise exception 'Support settings changed; reload before saving' using errcode='40001'; end if;
  return jsonb_build_object('config',r.config,'revision',r.revision);
end $$;
revoke all on function public.save_sunny_support(jsonb,integer) from public, anon;
grant execute on function public.save_sunny_support(jsonb,integer) to authenticated;

notify pgrst, 'reload schema';
