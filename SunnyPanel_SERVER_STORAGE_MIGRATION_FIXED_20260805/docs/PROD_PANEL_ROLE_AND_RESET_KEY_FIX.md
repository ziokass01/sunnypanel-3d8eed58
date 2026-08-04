# Prod fix checklist: reset-key + panel role

## 1) Deploy DB migrations first

```bash
supabase db push
```

Migration `20260324050000_reset_key_and_panel_hardening.sql` adds:
- countdown-safe penalty handling for `admin_reset_devices_penalty()` and `public_reset_key()`
- `get_public_key_info()` fix so start-on-first-use keys no longer show `Không giới hạn` by mistake
- hardening: revoke direct client execute on public reset RPCs, keep service-role only
- panel-role sync from `auth.users.raw_app_meta_data.panel_role` or `auth.users.raw_app_meta_data.role`
- admin helper RPC: `admin_set_panel_role(p_user_id, p_role)`

## 2) Redeploy Edge Functions

```bash
supabase functions deploy reset-key
supabase functions deploy verify-key
```

`supabase/config.toml` now also contains:

```toml
[functions.reset-key]
verify_jwt = false
```

## 3) Fix helper admin/user blocked at panel login

### Fastest direct SQL fix

```sql
select id, email
from auth.users
where email = 'helper@example.com';

insert into public.user_roles(user_id, role)
values ('PUT-UUID-HERE', 'user')
on conflict (user_id, role) do nothing;
```

### Optional metadata-based sync fix

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('panel_role', 'user')
where email = 'helper@example.com';
```

The new trigger will sync that metadata role into `public.user_roles` automatically.

## 4) Reset-key smoke checks

- `POST /functions/v1/reset-key` should no longer return `401`
- start-on-first-use countdown keys must return the real remaining duration on `/reset-key`
- admin `Reset devices -20%` must reduce countdown duration even before first activation
- direct browser RPC to `public_reset_key()` / `get_public_key_info()` should be blocked
