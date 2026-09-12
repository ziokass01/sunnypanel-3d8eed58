#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys

VERSION_RE = re.compile(r"(?<!\d)(\d{8,14})(?!\d)")


def extract_version(cell: str) -> str:
    """Extract a Supabase migration timestamp from a table cell.

    Accepts the normal CLI table, ASCII-pipe copies and GitHub log variants
    that wrap values in backticks or ANSI/control characters.
    """
    match = VERSION_RE.search(cell)
    return match.group(1) if match else ""


def unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            output.append(value)
    return output


def parse(text: str) -> tuple[list[str], list[str], list[tuple[str, str]]]:
    local_only: list[str] = []
    remote_only: list[str] = []
    pairs: list[tuple[str, str]] = []

    for raw_line in text.splitlines():
        if "│" in raw_line:
            parts = raw_line.split("│")
        elif "|" in raw_line:
            parts = raw_line.split("|")
        else:
            continue
        if len(parts) < 2:
            continue

        local_version = extract_version(parts[0])
        remote_version = extract_version(parts[1])

        if local_version and remote_version:
            pairs.append((local_version, remote_version))
        elif local_version:
            local_only.append(local_version)
        elif remote_version:
            remote_only.append(remote_version)

    return unique(local_only), unique(remote_only), pairs


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["local-only", "remote-only", "json"])
    args = parser.parse_args()
    local_only, remote_only, pairs = parse(sys.stdin.read())

    if args.mode == "local-only":
        if local_only:
            sys.stdout.write("\n".join(local_only) + "\n")
    elif args.mode == "remote-only":
        if remote_only:
            sys.stdout.write("\n".join(remote_only) + "\n")
    else:
        print(
            json.dumps(
                {
                    "local_only": local_only,
                    "remote_only": remote_only,
                    "pairs": pairs,
                },
                ensure_ascii=False,
            )
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
