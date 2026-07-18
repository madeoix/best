#!/usr/bin/env python3
"""Select disjoint crawler candidates from one validated fresh manifest.

Successful rooms are revisited after a bounded TTL.  Older collector state only
recorded a permanent ``seen_space_ids`` set; those ids inherit the legacy
state's last update time so an upgrade neither recrawls everything immediately
nor excludes those rooms forever.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from smallverse_popular_protocol import PopularProtocolError, validate_manifest


def _timestamp(value: Any) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _recent_ids(
    values: Any,
    *,
    current: datetime,
    cooldown_seconds: int,
) -> set[str]:
    if not isinstance(values, dict):
        return set()
    threshold = current - timedelta(seconds=cooldown_seconds)
    recent: set[str] = set()
    for space_id, value in values.items():
        attempted = _timestamp(value)
        if attempted is not None and attempted >= threshold:
            recent.add(str(space_id))
    return recent


def _successful_visit_times(
    state: dict[str, Any],
    *,
    current: datetime,
) -> dict[str, datetime]:
    visits: dict[str, datetime] = {}
    raw_visits = state.get("successful_space_visits", {})
    if isinstance(raw_visits, dict):
        for space_id, value in raw_visits.items():
            completed = _timestamp(value)
            if completed is not None:
                visits[str(space_id)] = completed

    # v1 states only had a permanent seen list.  Prefer the persisted migration
    # epoch, then the v1 update time.  ``current`` is the fail-safe for a
    # malformed/empty timestamp: it prevents an immediate all-room replay.
    legacy_epoch = (
        _timestamp(state.get("legacy_seen_migrated_at"))
        or _timestamp(state.get("updated_at"))
        or current
    )
    seen = state.get("seen_space_ids", [])
    if isinstance(seen, list):
        for space_id in seen:
            visits.setdefault(str(space_id), legacy_epoch)
    return visits


def select_candidates(
    manifest: dict[str, Any],
    state: dict[str, Any],
    *,
    profile: str,
    limit: int,
    now: datetime | None = None,
    max_age_seconds: int = 300,
    recrawl_after_seconds: int = 21600,
    missing_cooldown_seconds: int = 21600,
    error_cooldown_seconds: int = 1800,
) -> list[str]:
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    validate_manifest(manifest, now=current, max_age_seconds=max_age_seconds)
    if profile not in ("crawler-01", "crawler-02"):
        raise ValueError("profile must be crawler-01 or crawler-02")
    if not 1 <= int(limit) <= 100:
        raise ValueError("limit must be between 1 and 100")
    for label, value in (
        ("recrawl_after_seconds", recrawl_after_seconds),
        ("missing_cooldown_seconds", missing_cooldown_seconds),
        ("error_cooldown_seconds", error_cooldown_seconds),
    ):
        if isinstance(value, bool) or not 60 <= int(value) <= 2592000:
            raise ValueError(f"{label} must be between 60 and 2592000")

    partition = 0 if profile == "crawler-01" else 1
    visits = _successful_visit_times(state, current=current)
    success_threshold = current - timedelta(seconds=int(recrawl_after_seconds))
    recently_successful = {
        space_id
        for space_id, completed in visits.items()
        if completed >= success_threshold
    }
    recently_missing = _recent_ids(
        state.get("missing_avatar_spaces", {}),
        current=current,
        cooldown_seconds=int(missing_cooldown_seconds),
    )
    recently_failed = _recent_ids(
        state.get("failed_space_attempts", {}),
        current=current,
        cooldown_seconds=int(error_cooldown_seconds),
    )

    rows: list[tuple[int, int, str]] = []
    for row in manifest["spaces"]:
        space_id = row["space_id"]
        if row["currentVisitors"] <= 0:
            continue
        assigned = int(hashlib.sha256(space_id.encode("ascii")).hexdigest(), 16) % 2
        if assigned != partition or space_id in recently_successful \
                or space_id in recently_missing or space_id in recently_failed:
            continue
        rows.append((-row["currentVisitors"], row["rank"], space_id))
    return [space_id for _, _, space_id in sorted(rows)[:int(limit)]]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--profile", choices=("crawler-01", "crawler-02"), required=True)
    parser.add_argument("--limit", type=int, default=3)
    parser.add_argument("--max-age-seconds", type=int, default=300)
    parser.add_argument("--recrawl-after-seconds", type=int, default=21600)
    parser.add_argument("--missing-cooldown-seconds", type=int, default=21600)
    parser.add_argument("--error-cooldown-seconds", type=int, default=1800)
    args = parser.parse_args()
    try:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
        try:
            state = json.loads(args.state.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            state = {}
        for space_id in select_candidates(
            manifest,
            state,
            profile=args.profile,
            limit=args.limit,
            max_age_seconds=args.max_age_seconds,
            recrawl_after_seconds=args.recrawl_after_seconds,
            missing_cooldown_seconds=args.missing_cooldown_seconds,
            error_cooldown_seconds=args.error_cooldown_seconds,
        ):
            print(space_id)
    except (OSError, json.JSONDecodeError, PopularProtocolError, ValueError) as exc:
        print(f"fresh Popular manifest rejected: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
