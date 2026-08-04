#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys

VERSION_RE = re.compile(r"^\d{8,14}$")


def parse(text: str) -> tuple[list[str], list[str], list[tuple[str, str]]]:
    local_only: list[str] = []
    remote_only: list[str] = []
    pairs: list[tuple[str, str]] = []

    for raw_line in text.splitlines():
        # Supabase CLI uses U+2502. Accept ASCII pipes too for tests/log copies.
        if "│" in raw_line:
            parts = raw_line.split("│")
        elif "|" in raw_line:
            parts = raw_line.split("|")
        else:
            continue
        if len(parts) < 2:
            continue

        local_version = re.sub(r"\s+", "", parts[0])
        remote_version = re.sub(r"\s+", "", parts[1])
        local_ok = bool(VERSION_RE.fullmatch(local_version))
        remote_ok = bool(VERSION_RE.fullmatch(remote_version))

        if local_ok and remote_ok:
            pairs.append((local_version, remote_version))
        elif local_ok:
            local_only.append(local_version)
        elif remote_ok:
            remote_only.append(remote_version)

    return local_only, remote_only, pairs


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["local-only", "remote-only", "json"])
    args = parser.parse_args()
    local_only, remote_only, pairs = parse(sys.stdin.read())

    if args.mode == "local-only":
        sys.stdout.write("\n".join(local_only))
        if local_only:
            sys.stdout.write("\n")
    elif args.mode == "remote-only":
        sys.stdout.write("\n".join(remote_only))
        if remote_only:
            sys.stdout.write("\n")
    else:
        print(json.dumps({
            "local_only": local_only,
            "remote_only": remote_only,
            "pairs": pairs,
        }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
