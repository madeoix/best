#!/usr/bin/env python3
"""Install one dedicated crawler login from JSON provided on standard input.

This deliberately accepts no credential command-line arguments: process listings and
shell history must never contain a crawler email or password.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

STORE = Path("/etc/smallverse/crawler-credentials.json")
ALLOWED = {"crawler-01", "crawler-02"}


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(2)


try:
    incoming = json.load(sys.stdin)
except Exception:
    fail("invalid credential payload")

profile = str(incoming.get("profile") or "").strip()
email = str(incoming.get("email") or "").strip()
password = str(incoming.get("password") or "")
if profile not in ALLOWED or not email or "@" not in email or not password:
    fail("invalid crawler credential")

existing = {}
try:
    existing = json.loads(STORE.read_text())
except FileNotFoundError:
    pass
except Exception:
    fail("existing credential store is invalid")
if not isinstance(existing, dict):
    fail("existing credential store is invalid")

existing[profile] = {"email": email, "password": password}
STORE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
fd, temporary = tempfile.mkstemp(prefix=".crawler-credentials-", dir=STORE.parent)
try:
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(existing, handle, separators=(",", ":"))
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.chmod(temporary, 0o600)
    os.replace(temporary, STORE)
finally:
    try:
        os.unlink(temporary)
    except FileNotFoundError:
        pass

print(json.dumps({"ok": True, "profile": profile}))
