#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
from pathlib import Path


def load_capture_module():
    path = Path(__file__).with_name("auto_jsessionid.py")
    spec = importlib.util.spec_from_file_location("smallverse_session_capture", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load the session importer")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cookie-file", required=True)
    args = parser.parse_args()

    module = load_capture_module()
    raw = Path(args.cookie_file).read_text(encoding="utf-8", errors="strict")
    cookie = module.canonical_cookie(module.cookie_pairs(raw))
    if not cookie:
        print("ERROR: the authenticated Smallverse cookie pair is incomplete")
        return 2

    config = module.SyncConfig.from_environment()
    return 0 if module.sync_cookie(config, cookie, source="human-login-cdp") else 1


if __name__ == "__main__":
    raise SystemExit(main())
