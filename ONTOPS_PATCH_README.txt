SunnyPanel Ontops short-link provider patch - 2026-09-30

Muc tieu:
- Them provider Ontops chinh thuc vao dropdown admin Free Key.
- API base: https://api-management.ontops.link/api/public/create-short-link
- Request server-side: ?apikey=<token>&url=<encoded gate url>
- Khong hardcode token vao source/frontend.
- Giu nguyen GTraffic, Link4M, LayMa, Traffic68, NhapMa va Custom.
- Migration tu dong doi row Custom Ontops hien co sang provider=ontops NEU row da co Token rieng.
  Token, enabled, pass scope, quota va sort_order duoc giu nguyen.
- Neu row Custom Ontops khong co Token rieng thi migration khong tu dong sua row do de tranh mat credential.

Migration moi:
  20260930154500_add_ontops_shortlink_provider.sql

Deploy patch tren Termux (repo hien tai):
  cd ~/sunnypanel-3d8eed58 || exit 1
  unzip -o ~/storage/downloads/sunnypanel_ONTOPS_PATCH_20260930.zip -d ~/sunnypanel-3d8eed58
  git status
  git add -A
  git commit -m "add Ontops shortlink provider"
  git push origin main

Khong dung rsync --delete.

Sau khi Actions xanh, vao Admin Free Key -> API/Token:
- Dong Ontops cu se duoc doi sang provider Ontops neu ten/API match va Token field da co.
- API se ve base chuan cua Ontops.
- Token van nam server-side trong api_token_secret.

Kiem tra migration tren Supabase SQL Editor:
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version = '20260930154500';

Kiem tra row Ontops:
SELECT id, name, provider, api_url_template, enabled, secondary_enabled, pass_scope, sort_order
FROM public.licenses_free_shortlink_providers
WHERE provider = 'ontops' OR lower(name) = 'ontops';
