#!/usr/bin/env python3
"""Select one bounded two-letter Find Friends query at a time.

The game requires at least two characters.  Cycling one pair per timer run
keeps the crawler polite while eventually covering the same public Find
Friends surface the SWF exposes.  The state file contains only an index; it
never stores session material or results.
"""
from __future__ import annotations

import argparse
import json
import os
import tempfile
from pathlib import Path


ALPHABET = "abcdefghijklmnopqrstuvwxyz"
FIRST_QUERY = "ab"


def query_cycle() -> list[str]:
    pairs = [f"{first}{second}" for first in ALPHABET for second in ALPHABET]
    return [FIRST_QUERY, *(query for query in pairs if query != FIRST_QUERY)]


def read_index(path: Path, size: int) -> int:
    try:
        value = json.loads(path.read_text())
        index = int(value.get("next_index") or 0)
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        index = 0
    return index % size


def write_index(path: Path, index: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        path.parent.chmod(0o700)
    except OSError:
        pass
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    temporary = Path(temporary_name)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump({"next_index": index}, handle, separators=(",", ":"))
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        path.chmod(0o600)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Select a bounded Smallverse Find Friends query")
    parser.add_argument("--state", type=Path, required=True)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--peek", action="store_true", help="Print the next query without changing state")
    action.add_argument("--advance", action="store_true", help="Advance after a successful collection run")
    args = parser.parse_args()

    cycle = query_cycle()
    index = read_index(args.state, len(cycle))
    if args.peek:
        print(cycle[index])
    else:
        write_index(args.state, (index + 1) % len(cycle))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
