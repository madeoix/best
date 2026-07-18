#!/usr/bin/env python3
"""Capture and sanitize new SmallVerse avatar.saveAvatar gateway requests.

This tool watches only files created after it starts. It decodes AMF locally,
keeps only the avatar configuration and PNG render outputs, and never copies
cookies, gateway URLs, request headers, or raw AMF bodies into the output pack.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import shutil
import sys
import tarfile
import tempfile
import time
import zlib
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
import xml.etree.ElementTree as ET

from smallverse_amf import decode_remoting_envelope

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
FULL_TARGET = "avatar.saveAvatar"
SNAPSHOT_TARGET = "avatar.saveAvatarSnapshot"


def bytearray_to_bytes(value: Any) -> bytes:
    for candidate in (value, getattr(value, "stream", None)):
        if candidate is None:
            continue
        if hasattr(candidate, "seek") and hasattr(candidate, "read"):
            try:
                position = candidate.tell()
                candidate.seek(0)
                data = candidate.read()
                candidate.seek(position)
                if isinstance(data, str):
                    data = data.encode("latin1")
                return bytes(data)
            except Exception:
                pass
        if hasattr(candidate, "getvalue"):
            try:
                data = candidate.getvalue()
                if isinstance(data, str):
                    data = data.encode("latin1")
                return bytes(data)
            except Exception:
                pass
    try:
        return bytes(value)
    except Exception:
        return b""


def decode_config_string(value: Any) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        raw = base64.b64decode(value + "=" * (-len(value) % 4))
    except Exception:
        return None

    for wbits in (zlib.MAX_WBITS, -zlib.MAX_WBITS):
        try:
            return zlib.decompress(raw, wbits).decode("utf-8", "replace")
        except Exception:
            pass

    try:
        return raw.decode("utf-8", "replace")
    except Exception:
        return None


def config_gender(config_xml: str) -> str:
    try:
        root = ET.fromstring(config_xml)
    except ET.ParseError:
        return "unknown"

    for option in root.findall(".//options/option"):
        if option.attrib.get("id") != "GenderOptions":
            continue
        selected = (option.attrib.get("sel") or "").strip().lower()
        if "male" in selected and "female" not in selected:
            return "male"
        if "female" in selected:
            return "female"
        return selected or "unknown"

    return "unknown"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


@dataclass(frozen=True)
class FullState:
    avatar_id: str
    gender: str
    config_xml: str
    preview: bytes
    body: bytes
    thumb: bytes
    captured_at: str

    @property
    def config_sha256(self) -> str:
        return sha256_bytes(self.config_xml.encode("utf-8"))

    @property
    def state_sha256(self) -> str:
        digest = hashlib.sha256()
        digest.update(self.config_xml.encode("utf-8"))
        digest.update(self.preview)
        digest.update(self.body)
        digest.update(self.thumb)
        return digest.hexdigest()


@dataclass(frozen=True)
class Snapshot:
    avatar_id: str
    png: bytes
    captured_at: str


def decode_capture(path: Path) -> tuple[list[FullState], list[Snapshot]]:
    try:
        capture = json.loads(path.read_text())
        body_hex = capture.get("bodyHex")
        if not body_hex:
            return [], []
        messages = decode_remoting_envelope(bytes.fromhex(body_hex))
    except Exception:
        return [], []

    captured_at = str(capture.get("capturedAt") or "")
    full_states: list[FullState] = []
    snapshots: list[Snapshot] = []

    for message in messages:
        target = str(message.target)
        body = message.body
        if not isinstance(body, (list, tuple)):
            continue

        if target == FULL_TARGET and len(body) >= 9:
            config_xml = decode_config_string(body[5])
            preview = bytearray_to_bytes(body[6])
            full_body = bytearray_to_bytes(body[7])
            thumb = bytearray_to_bytes(body[8])

            if (
                not config_xml
                or not preview.startswith(PNG_MAGIC)
                or not full_body.startswith(PNG_MAGIC)
                or not thumb.startswith(PNG_MAGIC)
            ):
                continue

            full_states.append(
                FullState(
                    avatar_id=str(body[1]),
                    gender=config_gender(config_xml),
                    config_xml=config_xml,
                    preview=preview,
                    body=full_body,
                    thumb=thumb,
                    captured_at=captured_at,
                )
            )

        elif target == SNAPSHOT_TARGET and len(body) >= 3:
            png = bytearray_to_bytes(body[2])
            if png.startswith(PNG_MAGIC):
                snapshots.append(
                    Snapshot(
                        avatar_id=str(body[1]),
                        png=png,
                        captured_at=captured_at,
                    )
                )

    return full_states, snapshots


def new_capture_paths(captures_dir: Path, baseline: set[str]) -> Iterable[Path]:
    for path in sorted(captures_dir.glob("gateway-request-*.json")):
        if path.name not in baseline and path.is_file():
            yield path


def safe_archive_name(value: str) -> str:
    return "".join(ch for ch in value if ch.isalnum() or ch in ("-", "_")) or "unknown"


def write_pack(
    output_dir: Path,
    gender: str,
    states: list[FullState],
    snapshots: list[Snapshot],
) -> tuple[Path, Path]:
    avatar_ids = sorted({state.avatar_id for state in states})
    if len(avatar_ids) != 1:
        raise RuntimeError(f"Expected one avatar ID, found: {avatar_ids}")

    avatar_id = avatar_ids[0]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    pack_name = f"avatar-calibration-{safe_archive_name(gender)}-{safe_archive_name(avatar_id)}-{stamp}"

    with tempfile.TemporaryDirectory(prefix="beacon-avatar-calibration-") as tmp:
        root = Path(tmp) / pack_name
        root.mkdir(parents=True)

        manifest_states = []
        seen_states: set[str] = set()

        for state in states:
            if state.state_sha256 in seen_states:
                continue
            seen_states.add(state.state_sha256)
            index = len(manifest_states)
            state_dir = root / f"full-{index:02d}"
            state_dir.mkdir()
            (state_dir / "config.xml").write_text(state.config_xml)
            (state_dir / "preview.png").write_bytes(state.preview)
            (state_dir / "body.png").write_bytes(state.body)
            (state_dir / "thumb.png").write_bytes(state.thumb)
            manifest_states.append(
                {
                    "label": f"State {index + 1}",
                    "captured_at": state.captured_at,
                    "config": f"full-{index:02d}/config.xml",
                    "preview": f"full-{index:02d}/preview.png",
                    "body": f"full-{index:02d}/body.png",
                    "thumb": f"full-{index:02d}/thumb.png",
                    "state_sha256": state.state_sha256,
                    "config_sha256": state.config_sha256,
                    "preview_sha256": sha256_bytes(state.preview),
                    "body_sha256": sha256_bytes(state.body),
                    "thumb_sha256": sha256_bytes(state.thumb),
                }
            )

        manifest_snapshots = []
        seen_snapshot_hashes: set[str] = set()
        for snapshot in snapshots:
            if snapshot.avatar_id != avatar_id:
                continue
            digest = sha256_bytes(snapshot.png)
            if digest in seen_snapshot_hashes:
                continue
            seen_snapshot_hashes.add(digest)
            index = len(manifest_snapshots)
            filename = f"snapshot-{index:02d}.png"
            (root / filename).write_bytes(snapshot.png)
            manifest_snapshots.append(
                {
                    "captured_at": snapshot.captured_at,
                    "png": filename,
                    "sha256": digest,
                }
            )

        manifest = {
            "contract": "beacon-avatar-calibration/v1",
            "avatar_id": avatar_id,
            "gender": gender,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "sanitized": True,
            "excluded": [
                "gateway URL",
                "cookies",
                "request headers",
                "raw AMF body",
                "session identifiers",
            ],
            "states": manifest_states,
            "snapshots": manifest_snapshots,
        }
        (root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        (root / "README.txt").write_text(
            "Sanitized SmallVerse avatar calibration pack.\n"
            "Contains only decoded avatar configuration XML and PNG render outputs.\n"
            "No gateway URLs, cookies, headers, or raw request bodies are included.\n"
        )

        output_dir.mkdir(parents=True, exist_ok=True)
        archive = output_dir / f"{pack_name}.tar.gz"
        with tarfile.open(archive, "w:gz") as tar:
            tar.add(root, arcname=pack_name)

    checksum = sha256_bytes(archive.read_bytes())
    checksum_path = archive.with_suffix(archive.suffix + ".sha256")
    checksum_path.write_text(f"{checksum}  {archive.name}\n")
    return archive, checksum_path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--captures-dir",
        default=str(Path.home() / ".config/SmallVerse/gateway-captures"),
    )
    parser.add_argument("--gender", choices=("male", "female", "any"), default="male")
    parser.add_argument("--states", type=int, default=1)
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument("--settle-seconds", type=int, default=20)
    parser.add_argument("--output-dir", default=str(Path.home() / "Downloads"))
    args = parser.parse_args()

    captures_dir = Path(args.captures_dir).expanduser()
    output_dir = Path(args.output_dir).expanduser()

    if not captures_dir.is_dir():
        print(f"Capture directory does not exist: {captures_dir}", file=sys.stderr)
        return 2

    baseline = {path.name for path in captures_dir.glob("gateway-request-*.json")}
    print("[capture] watcher armed")
    print(f"[capture] existing files ignored: {len(baseline)}")
    print(f"[capture] waiting for {args.states} unique {args.gender} saveAvatar state(s)")
    print("[capture] now save the avatar in the SmallVerse avatar editor")

    states: list[FullState] = []
    snapshots: list[Snapshot] = []
    processed: set[str] = set()
    unique_states: set[str] = set()
    started = time.monotonic()
    target_reached_at: float | None = None

    while time.monotonic() - started < args.timeout:
        for path in new_capture_paths(captures_dir, baseline):
            if path.name in processed:
                continue
            processed.add(path.name)

            full_states, new_snapshots = decode_capture(path)
            snapshots.extend(new_snapshots)

            for state in full_states:
                if args.gender != "any" and state.gender != args.gender:
                    print(
                        f"[capture] ignored {state.gender} state for avatar {state.avatar_id}"
                    )
                    continue
                if state.state_sha256 in unique_states:
                    continue
                unique_states.add(state.state_sha256)
                states.append(state)
                print(
                    f"[capture] accepted state {len(states)}/{args.states}: "
                    f"avatar={state.avatar_id} gender={state.gender}"
                )

            if len(states) >= args.states and target_reached_at is None:
                target_reached_at = time.monotonic()
                print(
                    f"[capture] target reached; collecting snapshots for {args.settle_seconds}s"
                )

        if target_reached_at is not None and time.monotonic() - target_reached_at >= args.settle_seconds:
            break

        time.sleep(1)

    if not states:
        print("[capture] no matching saveAvatar request was captured", file=sys.stderr)
        return 1

    avatar_ids = {state.avatar_id for state in states}
    if len(avatar_ids) != 1:
        print(
            f"[capture] matching saves belonged to multiple avatars: {sorted(avatar_ids)}",
            file=sys.stderr,
        )
        return 1

    effective_gender = states[0].gender if args.gender == "any" else args.gender
    archive, checksum = write_pack(output_dir, effective_gender, states, snapshots)
    print("[capture] sanitized pack created")
    print(f"ARCHIVE={archive}")
    print(f"CHECKSUM={checksum}")
    print(f"AVATAR_ID={states[0].avatar_id}")
    print(f"GENDER={effective_gender}")
    print(f"UNIQUE_STATES={len({state.state_sha256 for state in states})}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
