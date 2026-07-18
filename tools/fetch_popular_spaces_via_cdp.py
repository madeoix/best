#!/usr/bin/env python3
"""Fetch the game's current Popular-space list through a signed-in crawler.

The production web client reads ``GET /api/space/popular``. This worker makes
that same read inside the crawler's existing Chromium page so authentication
never leaves the VPS browser profile. Only public room fields are exported;
cookies and response headers are never returned or written to disk.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

from cache_avatar_thumbnails_via_cdp import CDP
from smallverse_popular_protocol import (
    PopularProtocolError,
    build_api_manifest,
    popular_api_rows,
)


POPULAR_API_URL = "https://api.smallverse.app/api/space/popular"


def api_request(cdp: Any) -> Any:
    """Return the JSON payload without exposing crawler authentication."""
    expression = f"""
      fetch({json.dumps(POPULAR_API_URL)}, {{
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {{'Accept': 'application/json'}}
      }}).then(async (response) => {{
        let payload = null;
        try {{ payload = await response.json(); }} catch (_) {{}}
        return JSON.stringify({{status: response.status, payload}});
      }})
    """
    raw = cdp.evaluate(expression)
    try:
        result = json.loads(str(raw))
    except (TypeError, ValueError) as exc:
        raise RuntimeError("The live Popular API returned an unreadable response.") from exc
    if not isinstance(result, dict):
        raise RuntimeError("The live Popular API returned an invalid response envelope.")
    status = result.get("status")
    if isinstance(status, bool) or not isinstance(status, (int, float)):
        raise RuntimeError("The live Popular API did not return an HTTP status.")
    if int(status) != 200:
        raise RuntimeError(f"The signed-in Popular API returned HTTP {int(status)}.")
    return result.get("payload")


def collect_live_popular(
    cdp: Any,
    *,
    fresh_for_seconds: int = 300,
) -> dict[str, Any]:
    rows = popular_api_rows(api_request(cdp))
    return build_api_manifest(rows, fresh_for_seconds=fresh_for_seconds)


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        temporary.replace(path)
    except Exception:
        try:
            os.close(descriptor)
        except OSError:
            pass
        temporary.unlink(missing_ok=True)
        raise


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--cdp-port", type=int, required=True)
    parser.add_argument("--page-hint", default="smallverse.app")
    parser.add_argument("--fresh-for-seconds", type=int, default=300)
    args = parser.parse_args()

    try:
        cdp = CDP(args.cdp_port, args.page_hint)
        manifest = collect_live_popular(
            cdp,
            fresh_for_seconds=args.fresh_for_seconds,
        )
        atomic_write_json(args.manifest, manifest)
    except (OSError, RuntimeError, PopularProtocolError, ValueError) as exc:
        print(f"fresh Popular fetch rejected: {exc}", file=sys.stderr)
        return 1

    print(json.dumps({
        "ok": True,
        "contract": manifest["contract"],
        "generated_at": manifest["generated_at"],
        "spaces": len(manifest["spaces"]),
        "occupied_spaces": sum(row["currentVisitors"] > 0 for row in manifest["spaces"]),
    }, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
