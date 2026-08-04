#!/usr/bin/env python3
"""Compare a Sunny V10.1 client source tree with this fixed server source."""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
raw_client = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SUNNY_CLIENT_ROOT", "")
if not raw_client:
    raise SystemExit(
        "Usage: python3 tools/validate_menu_server_contract.py /path/to/extracted/SRC-V10.1"
    )
client_root = Path(raw_client).resolve()
if (client_root / "jni/SunnyHonHop").is_dir():
    client = client_root / "jni/SunnyHonHop"
elif client_root.name == "SunnyHonHop":
    client = client_root
else:
    raise SystemExit("Client root must contain jni/SunnyHonHop")

login = (client / "SunnyLoginModule.hpp").read_text(encoding="utf-8", errors="replace")
anti = (client / "SunnyAntiCrack.h").read_text(encoding="utf-8", errors="replace")
sig = (client / "SunnyServerSignature.h").read_text(encoding="utf-8", errors="replace")
server = (SERVER_ROOT / "supabase/functions/verify-key/index.ts").read_text(encoding="utf-8")
worker = (SERVER_ROOT / "customer-worker/index.js").read_text(encoding="utf-8")

checks = {
    "client endpoint": "https://mityangho.id.vn/api/verify-key" in login,
    "client sends x-ts": 'headers["x-ts"] = timestamp;' in login,
    "client sends x-nonce": 'headers["x-nonce"] = nonce;' in login,
    "client sends x-sig": 'headers["x-sig"] = requestSignature;' in login,
    "client canonical": 'timestamp + "." + nonce + "." + bodyHash' in login,
    "server canonical": '`${ts}.${nonce}.${requestBodyHash}`' in server,
    "worker forwards x-ts/x-nonce/x-sig": all(
        item in worker for item in ['"x-ts"', '"x-nonce"', '"x-sig"']
    ),
    "build matches": "sunny-v34-ac-20260721" in anti and "sunny-v34-ac-20260721" in server,
    "product matches": "sunny-free-fire" in sig and "sunny-free-fire" in server,
    "ECDSA algorithm matches": "ECDSA-P256-SHA256-V3" in sig and "ECDSA-P256-SHA256-V3" in server,
    "ECDSA key id matches": "sunny-p256-2026-07-b" in sig and "sunny-p256-2026-07-b" in server,
    "legacy response HMAC disabled": "#define SUNNY_ALLOW_LEGACY_HMAC_V1 0" in anti,
    "old server env name not read": 'Deno.env.get("VERIFY_HMAC_SECRET")' not in server,
    "released menu request key retained": "RELEASED_MENU_V10_1_REQUEST_HMAC_KEY" in server,
}

client_x45 = login[login.find("SLX9_FORCE_INLINE std::string x45()") :]
client_key_match = re.search(
    r'skCrypt\("([0-9a-f]{64})"\)', client_x45[:1000], flags=re.IGNORECASE
)
server_parts = re.findall(
    r'"([0-9a-f]{20,40})"',
    server[server.find("RELEASED_MENU_V10_1_REQUEST_HMAC_KEY") :][:300],
    flags=re.IGNORECASE,
)
checks["request key matches byte-for-byte"] = bool(
    client_key_match
    and len(server_parts) >= 2
    and client_key_match.group(1).lower() == "".join(server_parts[:2]).lower()
)

failed = [name for name, ok in checks.items() if not ok]
for name, ok in checks.items():
    print(f"{'PASS' if ok else 'FAIL'}: {name}")

if failed:
    raise SystemExit("Contract validation failed: " + ", ".join(failed))
print(f"PASS: {len(checks)}/{len(checks)} contract checks")
