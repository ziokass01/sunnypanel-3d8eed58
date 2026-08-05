#!/usr/bin/env python3
"""Static/integration checks for Cloudflare-native Sunny SRC V10.1 verify-key."""
from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NATIVE = ROOT / "customer-worker/verify-native.js"
WORKER = ROOT / "customer-worker/index.js"
TESTS = ROOT / "customer-worker/index.test.js"
KEY_CHECKER = ROOT / "customer-worker/check-signing-key.mjs"
LIVE_SMOKE = ROOT / "customer-worker/live-smoke.mjs"
MIGRATION = ROOT / "supabase/migrations/20260805210000_cloudflare_native_verify_v10_1.sql"
EDGE = ROOT / "supabase/functions/verify-key/index.ts"

raw_client = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SUNNY_CLIENT_ROOT", "")
if not raw_client:
    raise SystemExit(
        "Usage: python3 tools/validate_cloudflare_native_verify.py /path/to/extracted/SRC-V10.1"
    )
client_root = Path(raw_client).resolve()
if (client_root / "jni/SunnyHonHop").is_dir():
    client = client_root / "jni/SunnyHonHop"
elif client_root.name == "SunnyHonHop":
    client = client_root
else:
    raise SystemExit("Client root must contain jni/SunnyHonHop")

LOGIN = client / "SunnyLoginModule.hpp"
ANTI = client / "SunnyAntiCrack.h"
SIG = client / "SunnyServerSignature.h"

required = [NATIVE, WORKER, TESTS, KEY_CHECKER, LIVE_SMOKE, MIGRATION, EDGE, LOGIN, ANTI, SIG]
missing = [str(path) for path in required if not path.is_file()]
if missing:
    raise SystemExit("Missing required files: " + ", ".join(missing))

native = NATIVE.read_text(encoding="utf-8")
worker = WORKER.read_text(encoding="utf-8")
tests = TESTS.read_text(encoding="utf-8")
checker = KEY_CHECKER.read_text(encoding="utf-8")
sql = MIGRATION.read_text(encoding="utf-8")
edge = EDGE.read_text(encoding="utf-8")
login = LOGIN.read_text(encoding="utf-8", errors="replace")
anti = ANTI.read_text(encoding="utf-8", errors="replace")
sig = SIG.read_text(encoding="utf-8", errors="replace")

checks: list[tuple[str, bool]] = []

def check(name: str, value: bool) -> None:
    checks.append((name, bool(value)))


def adjacent_js_strings(text: str, marker: str, window: int = 500) -> str:
    start = text.find(marker)
    if start < 0:
        return ""
    block = text[start : start + window]
    values = re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', block)
    return "".join(values[1:3]) if len(values) >= 3 else ""


def cpp_public_key(text: str) -> str:
    start = text.find("PublicKeySpkiBase64")
    if start < 0:
        return ""
    block = text[start : start + 700]
    values = re.findall(r'"([A-Za-z0-9+/=]+)"', block)
    return "".join(values[:2])


def js_public_key(text: str) -> str:
    start = text.find("RELEASED_MENU_V10_1_PUBLIC_KEY_SPKI_BASE64")
    if start < 0:
        return ""
    block = text[start : start + 500]
    values = re.findall(r'"([A-Za-z0-9+/=]{20,})"', block)
    return "".join(values[:2])


def released_hmac_from_menu(text: str) -> str:
    start = text.find("SLX9_FORCE_INLINE std::string x45()")
    if start < 0:
        return ""
    match = re.search(r'skCrypt\("([0-9a-fA-F]{64})"\)', text[start : start + 1200])
    return match.group(1).lower() if match else ""


def released_hmac_from_native(text: str) -> str:
    start = text.find("RELEASED_MENU_V10_1_REQUEST_HMAC_KEY")
    if start < 0:
        return ""
    parts = re.findall(r'"([0-9a-fA-F]{20,40})"', text[start : start + 350])
    return "".join(parts[:2]).lower()

menu_public = cpp_public_key(sig)
native_public = js_public_key(native)
menu_hmac = released_hmac_from_menu(login)
native_hmac = released_hmac_from_native(native)

check("released endpoint unchanged", "https://mityangho.id.vn/api/verify-key" in login)
check("native build id matches menu", all("sunny-v34-ac-20260721" in text for text in (native, anti)))
check("native product id matches menu", all("sunny-free-fire" in text for text in (native, sig)))
check("native signature algorithm matches menu", all("ECDSA-P256-SHA256-V3" in text for text in (native, sig)))
check("native key id matches menu", all("sunny-p256-2026-07-b" in text for text in (native, sig)))
check("released request HMAC matches byte-for-byte", bool(menu_hmac and menu_hmac == native_hmac))
check("released public key matches byte-for-byte", bool(menu_public and menu_public == native_public))
check("legacy response HMAC remains disabled", "#define SUNNY_ALLOW_LEGACY_HMAC_V1 0" in anti)

check("native feature flag defaults off", 'envBool(env, "VERIFY_NATIVE_ENABLED", false)' in native)
check("worker keeps proxy path when native flag is off", 'if (isNativeVerifyEnabled(env))' in worker and "forwardRequest(req, upstreamUrl" in worker)
check("native handler returns directly without auto fallback", "return handleNativeVerify(req, env" in worker)
check("native uses one PostgREST RPC endpoint", "/rest/v1/rpc/${VERIFY_RPC_NAME}" in native)
check("native never calls verify Edge Function", "/functions/v1/verify-key" not in native)
check("native RPC uses service-role key", "SUPABASE_SERVICE_ROLE_KEY" in native and "Authorization: `Bearer ${serviceRoleKey}`" in native)
check("native does not use anon key for RPC", "UPSTREAM_ANON_KEY" not in native)
check("request HMAC canonical unchanged", "`${timestamp}.${nonce}.${requestBodyHash}`" in native)
check("signing key is verified before RPC", native.find("getVerifiedSigningKey(env)", native.find("handleNativeVerify")) < native.find("callVerifyRpc(env", native.find("handleNativeVerify")))
check("wrong signing key fails before RPC test exists", "does not match the released menu public key" in tests)
check("native success response includes strict V10.1 fields", all(
    field in native for field in (
        "expires_at", "max_devices", "started", "remaining_seconds", "server_time",
        "build_id", "product_id", "server_sig_alg", "server_key_id", "key_hash",
        "device_hash", "session_id", "session_expires_at", "session_generation",
        "exp_generation", "build_not_before", "build_expires_at", "capability_nonce",
        "capability_expires_at", "feature_seed", "device_key_bound", "server_sig",
    )
))
check("V3 canonical has all 23 ordered lines", native.count("args.", native.find("signedResponseCanonicalV3"), native.find("function asSafeInteger")) == 21)

signature_types = (
    "text,text,text,text,text,text,bigint,text,text,text,integer,text,"
    "boolean,boolean,text,text,boolean,integer,integer,integer,integer,"
    "integer,integer,integer,integer,integer,text,boolean"
)
compact_sql = re.sub(r"\s+", "", sql.lower())
compact_signature = signature_types.replace(" ", "")
check("migration is transactional", sql.lstrip().startswith("--") and "\nbegin;" in sql.lower() and sql.rstrip().lower().endswith("commit;"))
check("migration dollar quotes balanced", sql.count("$$") % 2 == 0 and sql.count("$$") >= 6)
check("atomic RPC exists", "create or replace function public.verify_key_v10_1_atomic(" in sql.lower())
check("atomic RPC exact signature is granted to service_role", f"grantexecuteonfunctionpublic.verify_key_v10_1_atomic({compact_signature})toservice_role;" in compact_sql)
check("atomic RPC revoked from public/anon/authenticated", f"revokeallonfunctionpublic.verify_key_v10_1_atomic({compact_signature})frompublic,anon,authenticated;" in compact_sql)
check("license row is locked for device-limit race", "from public.licenses\n  where key = v_key\n  for update;" in sql)
check("device max preserves stored value", "v_max_devices := coalesce(v_license.max_devices, 1);" in sql and "v_max_devices := greatest(1" not in sql)
check("session generation remains atomic per device", "session_generation = session_generation + 1" in sql and "returning session_generation" in sql)
check("build lease strict time check retained", "or v_now < v_build.not_before" in sql and "or v_now >= v_build.expires_at" in sql)
check("RPC schema reload included", "notify pgrst, 'reload schema';" in sql.lower())
check("key checker uses released public key", bool(menu_public and js_public_key(checker) == menu_public))

node_files = [WORKER, NATIVE, KEY_CHECKER, LIVE_SMOKE]
for path in node_files:
    result = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True)
    check(f"node syntax {path.name}", result.returncode == 0)

npm_test = subprocess.run(
    ["npm", "test"],
    cwd=ROOT / "customer-worker",
    capture_output=True,
    text=True,
)
check("customer-worker test suite", npm_test.returncode == 0 and "fail 0" in npm_test.stdout)

# The key-checker must reject an unrelated key. This validates the dangerous
# deployment gate without needing the production private key in the source tree.
openssl = subprocess.run(["openssl", "version"], capture_output=True, text=True)
if openssl.returncode == 0:
    with tempfile.TemporaryDirectory() as tmp:
        pem_path = Path(tmp) / "wrong.pem"
        gen = subprocess.run(
            ["openssl", "genpkey", "-algorithm", "EC", "-pkeyopt", "ec_paramgen_curve:P-256", "-out", str(pem_path)],
            capture_output=True,
            text=True,
        )
        key_check = subprocess.run(
            ["node", str(KEY_CHECKER), str(pem_path)],
            capture_output=True,
            text=True,
        ) if gen.returncode == 0 else None
        check("signing-key checker rejects unrelated P-256 key", bool(key_check and key_check.returncode == 1))
else:
    check("signing-key checker rejects unrelated P-256 key", False)

for name, ok in checks:
    print(f"{'PASS' if ok else 'FAIL'}: {name}")

failed = [name for name, ok in checks if not ok]
if failed:
    if npm_test.returncode != 0:
        print("\n--- npm test stdout ---\n" + npm_test.stdout)
        print("\n--- npm test stderr ---\n" + npm_test.stderr)
    raise SystemExit("Cloudflare-native validation failed: " + ", ".join(failed))

print(f"PASS: {len(checks)}/{len(checks)} Cloudflare-native checks")
