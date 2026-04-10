# RUNBOOK DEPLOY AND REPAIR

## 1) Push patch zip without deleting repo

```bash
cd ~
pkg install -y git unzip rsync

REPO=~/sunnypanel-3d8eed58
ZIP=~/storage/downloads/TEN_FILE_ZIP.zip
TMP=~/sp_patch_tmp
MSG="noi dung commit cua ban"

mkdir -p "$TMP"
rm -rf "$TMP"/*
unzip -o "$ZIP" -d "$TMP"

cd "$REPO" || exit 1
git fetch origin
git checkout main
git pull --ff-only origin main

if [ -d "$TMP/sunnypanel-3d8eed58-main" ]; then
  SRC="$TMP/sunnypanel-3d8eed58-main"
elif [ -d "$TMP/sunnypanel-3d8eed58" ]; then
  SRC="$TMP/sunnypanel-3d8eed58"
else
  SRC="$TMP"
fi

rsync -av --exclude '.git' --exclude 'node_modules' "$SRC"/ "$REPO"/

git add -A
git commit -m "$MSG" || echo "Khong co thay doi de commit"
git fetch origin
git rebase origin/main
git push -u origin main
```

## 2) If push is rejected with fetch first / non-fast-forward

```bash
cd ~/sunnypanel-3d8eed58 || exit 1
git fetch origin
git rebase origin/main
git push -u origin main
```

If rebase gets messy:

```bash
cd ~/sunnypanel-3d8eed58 || exit 1
git rebase --abort 2>/dev/null || true
git pull --rebase --autostash origin main
git push -u origin main
```

## 3) Manual Supabase migration repair when Actions says remote migration versions not found

Run this in Codespaces:

```bash
cd /workspaces/sunnypanel-3d8eed58 || exit 1
export SUPABASE_ACCESS_TOKEN="SUPABASE_ACCESS_TOKEN_CUA_BAN"

npx supabase login --token "$SUPABASE_ACCESS_TOKEN"
npx supabase link --project-ref ijvhlhdrncxtxosmnbtt
npx supabase migration repair --status reverted 20260327
yes | npx supabase db push --include-all
```

If terminal shows `bash: y: command not found` after that, ignore it if `Finished supabase db push.` already appeared.

## 4) Trigger a fresh deploy after manual repair

```bash
cd ~/sunnypanel-3d8eed58 && git commit --allow-empty -m "trigger fresh deploy" && git push origin main
```

Or in Codespaces:

```bash
cd /workspaces/sunnypanel-3d8eed58 && git commit --allow-empty -m "trigger fresh deploy" && git push origin main
```

## 5) Restore and test server-app-runtime function in Codespaces

```bash
cd /workspaces/sunnypanel-3d8eed58 || exit 1

git fetch origin
git checkout main
git reset --hard origin/main
git clean -fd

git checkout origin/main -- supabase/functions/server-app-runtime
git checkout origin/main -- supabase/functions/_shared/server_app_runtime.ts

ls -la supabase/functions/server-app-runtime
grep -n "raw.split" supabase/functions/_shared/server_app_runtime.ts

export SUPABASE_ACCESS_TOKEN="TOKEN_CUA_BAN"
npx supabase login --token "$SUPABASE_ACCESS_TOKEN"
npx supabase functions deploy server-app-runtime --project-ref ijvhlhdrncxtxosmnbtt
```

Expected grep output should contain:

```txt
raw.split(/[,\n\r]+/)
```

## 6) Fast checks

### Check current branch and status

```bash
git branch
git status
```

### Check remote config

```bash
git remote -v
```

### Check no nested repo happened

```bash
find ~/sunnypanel-3d8eed58 -maxdepth 2 -type d | sed -n '1,30p'
```

## 7) Notes

- In Codespaces use `/workspaces/sunnypanel-3d8eed58`
- In Termux use `~/sunnypanel-3d8eed58`
- Do not rerun old failed Actions jobs after manual DB repair. Trigger a new push instead.
- Do not copy `.git` from zip into repo.
- Exclude `node_modules` when syncing patch zip.
