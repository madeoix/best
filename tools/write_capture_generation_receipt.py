#!/usr/bin/env python3
"""Write one append-only receipt for a bounded Popular crawler generation.

The receipt contains hashes and counts that can be proven from files produced
by the run. Evidence that the current runner does not count is represented as
``null`` rather than being reported as zero.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from smallverse_popular_protocol import API_SOURCE, AMF_SOURCE, MANIFEST_CONTRACT


SHA256 = re.compile(r"^[a-f0-9]{64}$")
SPACE_ID = re.compile(r"^[a-f0-9]{32}$")
CONTRACT = "smallverse-capture-generation/v1"


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def read_manifest(path: Path | None) -> tuple[dict[str, Any] | None, bytes | None]:
    if path is None or not path.is_file():
        return None, None
    raw = path.read_bytes()
    payload = json.loads(raw)
    if not isinstance(payload, dict) or payload.get("contract") != MANIFEST_CONTRACT:
        raise ValueError("Popular manifest has the wrong contract")
    if not isinstance(payload.get("spaces"), list):
        raise ValueError("Popular manifest has no spaces list")
    return payload, raw


def request_descriptor(source: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    if source == API_SOURCE:
        return "GET /api/space/popular", {
            "method": "GET",
            "path": "/api/space/popular",
            "transport": "crawler-browser-cdp-json",
        }
    if source == AMF_SOURCE:
        return "catalog_entry.getSpacesForCategory", {
            "method": "catalog_entry.getSpacesForCategory",
            "transport": "crawler-browser-cdp-amf",
        }
    raise ValueError("Popular manifest source is not authoritative")


def normalized_ids(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for raw in values:
        value = str(raw).strip().lower()
        if not SPACE_ID.fullmatch(value):
            raise ValueError(f"invalid space id: {raw}")
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result


def iso(value: str) -> str:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timestamps must include a timezone")
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def build_receipt(args: argparse.Namespace) -> dict[str, Any]:
    completed = normalized_ids(args.completed_space)
    missing = normalized_ids(args.missing_space)
    failed = normalized_ids(args.failed_space)
    selected = normalized_ids(args.selected_space)
    if set(completed) & set(missing) or set(completed) & set(failed) or set(missing) & set(failed):
        raise ValueError("a space cannot have more than one generation outcome")
    if not set(completed + missing + failed).issubset(set(selected)):
        raise ValueError("all outcomes must belong to the selected space set")

    manifest, manifest_raw = read_manifest(args.popular_manifest)
    method: str | None = None
    request_hash: str | None = None
    response_hash: str | None = None
    popular_rows = 0
    joined_spaces = 0
    if manifest is not None and manifest_raw is not None:
        method, descriptor = request_descriptor(manifest.get("source"))
        request_hash = sha256(canonical_bytes(descriptor))
        response_hash = sha256(manifest_raw)
        rows = manifest["spaces"]
        popular_rows = len(rows)
        by_id = {
            str(row.get("space_id") or "").lower(): row
            for row in rows if isinstance(row, dict)
        }
        if not set(selected).issubset(by_id):
            raise ValueError("selected spaces are absent from the retained Popular response")
        joined_spaces = sum(
            bool(str(by_id[sid].get("name") or "").strip())
            and bool(str(by_id[sid].get("snapshot_url") or "").strip())
            for sid in selected
        )

    evidence_manifest = {
        "generationId": args.generation_id,
        "crawlerId": args.crawler_id,
        "selectedSpaces": selected,
        "completedSpaces": completed,
        "missingAvatarSpaces": missing,
        "failedSpaces": failed,
    }
    receipt = {
        "contract": CONTRACT,
        "generationId": args.generation_id,
        "crawlerId": args.crawler_id,
        "outcome": args.outcome,
        "startedAt": iso(args.started_at),
        "completedAt": iso(args.completed_at),
        "popularRequestMethod": method,
        "popularRequestSha256": request_hash,
        "popularResponseSha256": response_hash,
        "evidenceManifestSha256": sha256(canonical_bytes(evidence_manifest)),
        "counts": {
            "popularRows": popular_rows,
            "selectedSpaces": len(selected),
            "joinedSpaces": joined_spaces,
            "avatarsObserved": getattr(args, "avatars_observed", None),
            "avatarConfigsCaptured": getattr(args, "avatar_configs_captured", None),
            "itemUidsObserved": getattr(args, "item_uids_observed", None),
            "itemConfigsCaptured": getattr(args, "item_configs_captured", None),
            "protocolEvents": getattr(args, "protocol_events", None),
            "assetsVerified": None,
        },
        "failureCode": args.failure_code,
        "failureMessage": args.failure_message,
        "evidence": evidence_manifest,
    }
    if args.outcome == "succeeded":
        if manifest is None or popular_rows == 0:
            raise ValueError("successful generations require a retained Popular response")
        if args.failure_code is not None or args.failure_message is not None:
            raise ValueError("successful generations cannot contain a failure")
    elif not args.failure_code:
        raise ValueError("partial and failed generations require --failure-code")
    if receipt["completedAt"] < receipt["startedAt"]:
        raise ValueError("completed-at precedes started-at")
    if not SHA256.fullmatch(receipt["evidenceManifestSha256"]):
        raise AssertionError("invalid evidence hash")
    return receipt


def append_only_write(directory: Path, receipt: dict[str, Any]) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"{receipt['generationId']}.json"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    descriptor = os.open(target, flags, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(receipt, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
    except Exception:
        target.unlink(missing_ok=True)
        raise
    return target


def atomic_latest(path: Path, receipt_path: Path, receipt: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(name)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            # This is a mutable convenience copy of the complete receipt. The
            # append-only authority remains receipt_path, addressed by its
            # generationId; consumers never have to dereference a VPS path.
            json.dump(receipt, handle, separators=(",", ":"))
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--latest", type=Path)
    parser.add_argument("--generation-id", required=True)
    parser.add_argument("--crawler-id", required=True)
    parser.add_argument("--outcome", choices=("succeeded", "partial", "failed"), required=True)
    parser.add_argument("--started-at", required=True)
    parser.add_argument("--completed-at", required=True)
    parser.add_argument("--popular-manifest", type=Path)
    parser.add_argument("--selected-space", action="append", default=[])
    parser.add_argument("--completed-space", action="append", default=[])
    parser.add_argument("--missing-space", action="append", default=[])
    parser.add_argument("--failed-space", action="append", default=[])
    parser.add_argument("--failure-code")
    parser.add_argument("--failure-message")
    parser.add_argument("--avatars-observed", type=int)
    parser.add_argument("--avatar-configs-captured", type=int)
    parser.add_argument("--item-uids-observed", type=int)
    parser.add_argument("--item-configs-captured", type=int)
    parser.add_argument("--protocol-events", type=int)
    args = parser.parse_args()
    receipt = build_receipt(args)
    target = append_only_write(args.directory, receipt)
    if args.latest is not None:
        atomic_latest(args.latest, target, receipt)
    print(json.dumps({"ok": True, "receipt": str(target)}, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
