#!/usr/bin/env python3
from pathlib import Path
import shutil, sys, time

package = Path(__file__).resolve().parents[1]
repo = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) > 1 else Path.cwd().resolve()
files = [
    (package / 'supabase/functions/verify-key/index.ts', repo / 'supabase/functions/verify-key/index.ts'),
    (package / 'customer-worker/index.js', repo / 'customer-worker/index.js'),
    (package / 'supabase/migrations/20260721_sunny_v34_server_authority.sql', repo / 'supabase/migrations/20260721_sunny_v34_server_authority.sql'),
    (package / 'supabase/migrations/20260721_sunny_v34_server_authority_rollback.sql', repo / 'supabase/migrations/20260721_sunny_v34_server_authority_rollback.sql'),
]
backup = repo / f'.sunny-v34-backup-{int(time.time())}'
for source, destination in files:
    if not source.is_file():
        raise SystemExit(f'Missing package file: {source}')
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        saved = backup / destination.relative_to(repo)
        saved.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(destination, saved)
    shutil.copy2(source, destination)
    print(f'updated: {destination}')
print(f'backup: {backup}')
print('Review git diff, then commit. Database and secrets are deployed separately.')
