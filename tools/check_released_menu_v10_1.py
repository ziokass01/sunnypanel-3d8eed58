#!/usr/bin/env python3
"""Live smoke test that reproduces the released Sunny V10.1 request exactly."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.request

ENDPOINT = os.environ.get("SUNNY_VERIFY_ENDPOINT", "https://mityangho.id.vn/api/verify-key")
BUILD_ID = "sunny-v34-ac-20260721"
PRODUCT_ID = "sunny-free-fire"
REQUEST_KEY = (
    "f40b1576b8136cac6166c9879d2597aad"
    "5e675ddedf1ec8c04a5174e6c715054"
)


def make_body(license_key: str) -> str:
    # Same field order and compact JSON layout as SunnyLoginModule.hpp.
    payload = {
        "key": license_key,
        "device": "sunny-termux-v10-1-smoke-device",
        "device_name": "Termux V10.1 Smoke Test",
        "build_id": BUILD_ID,
        "product_id": PRODUCT_ID,
    }
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def main() -> int:
    license_key = (sys.argv[1] if len(sys.argv) > 1 else "SUNNY-TEST-TEST-TEST").strip().upper()
    body = make_body(license_key)
    timestamp = str(int(time.time()))
    nonce = secrets.token_hex(16)
    body_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()
    canonical = f"{timestamp}.{nonce}.{body_hash}"
    signature = hmac.new(
        REQUEST_KEY.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256
    ).hexdigest()

    request = urllib.request.Request(
        ENDPOINT,
        data=body.encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Cache-Control": "no-store, no-cache, max-age=0",
            "Pragma": "no-cache",
            "User-Agent": "SunnyMod/1.0",
            "x-ts": timestamp,
            "x-nonce": nonce,
            "x-sig": signature,
            "x-build-id": BUILD_ID,
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            status = response.status
            raw = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as error:
        status = error.code
        raw = error.read().decode("utf-8", errors="replace")
    except Exception as error:  # pragma: no cover - Termux diagnostic path
        print(f"NETWORK_ERROR={error}")
        return 2

    print(f"HTTP_STATUS={status}")
    print(raw)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        print("RESULT=NON_JSON_RESPONSE")
        return 3

    msg = str(data.get("msg", ""))
    if msg == "UNAUTHORIZED":
        print("RESULT=FAIL_REQUEST_HMAC_NOT_ACCEPTED")
        return 1
    if msg == "GATEWAY_REQUIRED":
        print("RESULT=FAIL_GATEWAY_NOT_CONFIGURED")
        return 1

    print("RESULT=PASS_V10_1_REQUEST_AUTH_REACHED_LICENSE_CHECK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
