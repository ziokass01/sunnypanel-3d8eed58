#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "supabase/migrations/20260721_sunny_v34_server_authority.sql"

if not TARGET.is_file():
    raise SystemExit(f"Không tìm thấy migration gốc: {TARGET}")

source = TARGET.read_text(encoding="utf-8")

pattern = re.compile(
    r"on conflict \(build_id\)\s*\n"
    r"do update set\s*\n"
    r"\s*product_id\s*=\s*excluded\.product_id,\s*\n"
    r"\s*is_active\s*=\s*true,\s*\n"
    r"\s*not_before\s*=\s*least\([^;]+?\),\s*\n"
    r"\s*expires_at\s*=\s*greatest\([^;]+?\),\s*\n"
    r"\s*exp_generation\s*=\s*greatest\([^;]+?\),\s*\n"
    r"\s*updated_at\s*=\s*now\(\);",
    flags=re.IGNORECASE | re.DOTALL,
)

replacement = """on conflict (build_id)\ndo nothing;"""
updated, count = pattern.subn(replacement, source, count=1)

if count != 1:
    if "on conflict (build_id)\ndo nothing;" in source:
        print("Migration gốc đã ở trạng thái an toàn; không cần sửa lại.")
        sys.exit(0)
    raise SystemExit(
        "Không tìm thấy đúng khối ON CONFLICT nguy hiểm. "
        "Không sửa file để tránh thay nhầm."
    )

comment_old = (
    "-- Running this migration starts the independent V34 build lease at deploy time."
)
comment_new = (
    "-- First application creates one fixed V34 build deadline. "
    "Re-running this migration never extends or reactivates it."
)
updated = updated.replace(comment_old, comment_new, 1)

backup = TARGET.with_suffix(".sql.before_exp_final")
if not backup.exists():
    backup.write_text(source, encoding="utf-8")

TARGET.write_text(updated, encoding="utf-8")
print(f"Đã sửa an toàn: {TARGET}")
print(f"Backup local: {backup}")
