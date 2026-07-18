#!/usr/bin/env python3
"""Build a safe portrait-cache manifest from crawler identity evidence.

The crawler identity database already records avatar portrait URLs observed by
the game.  Beacon must not publish those CDN URLs directly: they can later
return 403 outside the crawler session.  This exporter writes a private
manifest for ``cache_avatar_thumbnails_via_cdp.py`` instead.  That worker uses
the signed-in crawler browser to turn successful references into local PNGs.

No cookies, gateway paths, or image URLs are printed by this command.
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


AVATAR_ID = re.compile(r"^[0-9a-f]{24}$", re.I)
AVATAR_URL = re.compile(
    r"^https://content\.smallverse\.app/uploads/avatars/"
    r"([0-9a-f]{24})([0-9a-f]{32})(?:_(thumb|snap))?\.png(?:[?#].*)?$",
    re.I,
)

VARIANTS = {
    "head": None,
    "thumb": "thumb",
    "snapshot": "snap",
}


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def profile_avatar_ids(path: Path) -> list[str]:
    payload = load_json(path)
    profiles = payload.get("profiles")
    if not isinstance(profiles, dict):
        return []

    found: set[str] = set()
    for profile in profiles.values():
        if not isinstance(profile, dict):
            continue
        owners = profile.get("owners")
        if not isinstance(owners, list):
            continue
        for owner in owners:
            if not isinstance(owner, dict):
                continue
            avatar_id = str(owner.get("avatar_id") or "").lower()
            if AVATAR_ID.fullmatch(avatar_id):
                found.add(avatar_id)
    return sorted(found)


def canonical(url: object, avatar_id: str, expected_suffix: str | None) -> str:
    value = str(url or "")
    match = AVATAR_URL.fullmatch(value)
    if not match:
        return ""
    url_avatar_id, _, suffix = match.groups()
    if url_avatar_id.lower() != avatar_id or suffix != expected_suffix:
        return ""
    return value


def table_exists(connection: sqlite3.Connection, name: str) -> bool:
    return bool(connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (name,),
    ).fetchone())


def placeholders(values: list[str]) -> str:
    return ",".join("?" for _ in values)


def build_manifest(
    database: Path,
    avatar_ids: list[str],
    limit: int,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    if limit:
        avatar_ids = avatar_ids[:limit]
    if not avatar_ids:
        return [], {variant: 0 for variant in VARIANTS}

    connection = sqlite3.connect(database)
    connection.row_factory = sqlite3.Row
    ids_sql = placeholders(avatar_ids)
    by_avatar: dict[str, dict[str, str]] = {
        avatar_id: {} for avatar_id in avatar_ids
    }

    # Avatar rows are the baseline capture.  Newer live asset evidence below
    # deliberately overrides it by variant.
    if table_exists(connection, "avatars"):
        for row in connection.execute(
            f"""
            SELECT avatar_id, head_url, thumb_url, snapshot_url
            FROM avatars
            WHERE avatar_id IN ({ids_sql})
            """,
            avatar_ids,
        ):
            avatar_id = str(row["avatar_id"] or "").lower()
            for variant, suffix in VARIANTS.items():
                column = {
                    "head": "head_url",
                    "thumb": "thumb_url",
                    "snapshot": "snapshot_url",
                }[variant]
                value = canonical(row[column], avatar_id, suffix)
                if value:
                    by_avatar.setdefault(avatar_id, {})[variant] = value

    # These rows come from actual crawler-side friend-search observations and
    # are preferred when present.  The database's verified flag refers to the
    # capture process; the CDP worker still re-verifies the PNG before Beacon
    # can use it.
    if table_exists(connection, "avatar_assets_live"):
        for row in connection.execute(
            f"""
            SELECT avatar_id, asset_kind, url
            FROM avatar_assets_live
            WHERE avatar_id IN ({ids_sql})
              AND is_verified_image = 1
            ORDER BY COALESCE(verified_at, observed_at, 0) DESC
            """,
            avatar_ids,
        ):
            avatar_id = str(row["avatar_id"] or "").lower()
            variant = str(row["asset_kind"] or "").lower()
            suffix = VARIANTS.get(variant)
            if variant not in VARIANTS:
                continue
            if variant in by_avatar.get(avatar_id, {}):
                continue
            value = canonical(row["url"], avatar_id, suffix)
            if value:
                by_avatar.setdefault(avatar_id, {})[variant] = value

    # A verified historic asset can still fill a variant that has no newer
    # crawler observation.  Do not let it override live evidence.
    if table_exists(connection, "avatar_assets"):
        for row in connection.execute(
            f"""
            SELECT avatar_id, variant, url
            FROM avatar_assets
            WHERE avatar_id IN ({ids_sql})
              AND is_verified_image = 1
            ORDER BY COALESCE(verified_at, observed_at, 0) DESC
            """,
            avatar_ids,
        ):
            avatar_id = str(row["avatar_id"] or "").lower()
            variant = str(row["variant"] or "").lower()
            suffix = VARIANTS.get(variant)
            if variant not in VARIANTS or variant in by_avatar.get(avatar_id, {}):
                continue
            value = canonical(row["url"], avatar_id, suffix)
            if value:
                by_avatar.setdefault(avatar_id, {})[variant] = value

    connection.close()

    rows: list[dict[str, Any]] = []
    counts = {variant: 0 for variant in VARIANTS}
    for avatar_id in avatar_ids:
        values = by_avatar.get(avatar_id) or {}
        if not values:
            continue
        row: dict[str, Any] = {"avatar_id": avatar_id, "source": "identity.sqlite"}
        for variant, url in values.items():
            row[f"{variant}_verified_url"] = url
            counts[variant] += 1
        rows.append(row)
    return rows, counts


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument(
        "--item-profiles",
        type=Path,
        required=True,
        help="Cached item profiles whose owner avatar ids should be refreshed.",
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    avatar_ids = profile_avatar_ids(args.item_profiles)
    rows, variant_counts = build_manifest(args.database, avatar_ids, args.limit)
    payload = {
        "contract": "beacon-avatar-thumbnail-manifest/v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "identity.sqlite avatar evidence",
        "avatars": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps({
        "ok": True,
        "owner_avatar_ids": len(avatar_ids),
        "manifest_avatars": len(rows),
        "variant_references": variant_counts,
        "output": str(args.output),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
