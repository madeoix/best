#!/usr/bin/env python3
import subprocess
import time
from pathlib import Path

CAPTURES = Path.home() / ".config/SmallVerse/gateway-captures"
IMPORTER = Path.home() / "smallverse-lab/tools/import_avatar_snapshot_captures.py"
PYTHON = "/tmp/sv-amf-venv/bin/python"

seen = {}

def scan():
    return {
        p: p.stat().st_mtime_ns
        for p in CAPTURES.glob("gateway-request-*.json")
        if p.is_file()
    }

print("[watch] avatar render capture watcher started")
print("[watch] captures:", CAPTURES)

# Baseline existing captures so startup does not re-import everything.
seen = scan()
print(f"[watch] baseline loaded: {len(seen)} capture(s)")

while True:
    current = scan()
    changed = [p for p, mt in current.items() if seen.get(p) != mt]

    if changed:
        try:
            result = subprocess.run(
                [PYTHON, str(IMPORTER)],
                check=False,
                capture_output=True,
                text=True
            )
            out = result.stdout.strip()
            if '"imported_count": 0' not in out:
                print(f"[watch] {len(changed)} changed/new capture(s)")
                print(out)
        except Exception as e:
            print("[watch] importer failed:", e)

    seen = current
    time.sleep(2)
