#!/usr/bin/env python3
"""Turn crawler RTMP captures into Beacon avatar configs and local PNG portraits.

This is the missing handoff between a crawler entering a populated Popular
space and Beacon.  Each completed capture is decoded for Avatar.<id> shared
objects, its body config is queued for the renderer, and its captured image
hashes are handed to the signed-in crawler browser cache worker.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def load(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return fallback


def write(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".partial")
    temporary.write_text(json.dumps(value, indent=2) + "\n")
    temporary.replace(path)


def capture_key(path: Path) -> str:
    stat = path.stat()
    return f"{path}:{stat.st_mtime_ns}:{stat.st_size}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--captures", type=Path, required=True)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--extractor", type=Path, required=True)
    parser.add_argument("--thumbnail-cache", type=Path, required=True)
    parser.add_argument("--cdp-port", type=int, default=19992)
    parser.add_argument("--max-captures", type=int, default=20)
    args = parser.parse_args()

    state_path = args.workspace / "avatar-harvest-state.json"
    state = load(state_path, {"processed": {}})
    processed = state.setdefault("processed", {})
    manifest_path = args.workspace / "avatar-rtmp-manifest.json"
    prior_manifest = load(manifest_path, {"avatars": []})
    avatars: dict[str, dict[str, Any]] = {
        str(entry.get("avatar_id")): entry
        for entry in prior_manifest.get("avatars", [])
        if isinstance(entry, dict) and entry.get("avatar_id")
    }
    queue_path = args.workspace / "beacon-avatar-render-queue.json"
    prior_queue = load(queue_path, {"contract": "beacon-avatar-render-queue/v1", "avatars": []})
    queue: dict[str, dict[str, Any]] = {
        str(entry.get("avatar_id")): entry
        for entry in prior_queue.get("avatars", [])
        if isinstance(entry, dict) and entry.get("avatar_id")
    }

    candidates = sorted(
        (path for path in args.captures.rglob("*.pcapng") if path.is_file() and path.stat().st_size > 1024),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    new = [path for path in candidates if capture_key(path) not in processed][: args.max_captures]
    extracted = 0
    with tempfile.TemporaryDirectory(prefix="smallverse-avatar-harvest-") as temporary:
        temporary_root = Path(temporary)
        for index, capture in enumerate(new):
            destination = temporary_root / str(index)
            completed = subprocess.run(
                ["python3", str(args.extractor), str(capture), "-o", str(destination)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            processed[capture_key(capture)] = datetime.now(timezone.utc).isoformat()
            if completed.returncode != 0:
                continue
            for entry in load(destination / "manifest.json", []):
                if not isinstance(entry, dict):
                    continue
                avatar_id = str(entry.get("avatar_id") or "").lower()
                xml_file = destination / str(entry.get("xml_file") or "")
                if len(avatar_id) != 24 or not xml_file.is_file():
                    continue
                config = xml_file.read_text(errors="replace").strip()
                if not config.startswith("<avatar"):
                    continue
                entry["captured_at"] = datetime.now(timezone.utc).isoformat()
                avatars[avatar_id] = entry
                queue[avatar_id] = {
                    "avatar_id": avatar_id,
                    "gender": entry.get("gender") or "unknown",
                    "config_xml": config,
                    "captured_at": entry["captured_at"],
                    "source": "crawler-rmtp-avatar-shared-object",
                }
                extracted += 1

    combined = {"contract": "beacon-rtmp-avatar-manifest/v1", "avatars": list(avatars.values())}
    write(manifest_path, combined)
    write(queue_path, {"contract": "beacon-avatar-render-queue/v1", "avatars": list(queue.values())})
    write(state_path, {"processed": processed})

    cached = None
    if extracted:
        completed = subprocess.run(
            ["python3", str(args.thumbnail_cache), "--manifest", str(manifest_path),
             "--output-dir", str(args.workspace / "avatar-images"),
             "--avatar-index", str(args.workspace / "avatar-url-index.json"),
             "--cdp-port", str(args.cdp_port)],
            text=True,
            capture_output=True,
        )
        cached = load_text_json(completed.stdout)
    print(json.dumps({"ok": True, "captures_seen": len(candidates), "captures_processed": len(new), "avatar_configs_extracted": extracted, "portrait_cache": cached}, indent=2))
    return 0


def load_text_json(value: str) -> Any:
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return {"ok": False, "output": value[-1000:]}


if __name__ == "__main__":
    raise SystemExit(main())
