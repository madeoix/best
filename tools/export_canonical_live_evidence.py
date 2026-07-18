#!/usr/bin/env python3
"""Export exact, generation-local avatar evidence from crawler session databases.

The exporter does not infer account ownership.  A capture directory identifies
the one Popular room entered by that generation; explicit wearing protocol
events identify the avatar and item instance observed in that room.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
from pathlib import Path

HEX24 = re.compile(r"^[0-9a-f]{24}$", re.I)
SPACE32 = re.compile(r"^[0-9a-f]{32}$", re.I)
SESSION_SPACE = re.compile(r"^crawler-\d{2}-([0-9a-f]{32})-\d{8}T\d{6}Z-", re.I)
EVENTS = ("avatar_wearing_uid", "avatar_equipped_item")


def digest(*parts: object) -> str:
    return hashlib.sha256("\0".join(str(part or "") for part in parts).encode()).hexdigest()


def exact(value: object, pattern: re.Pattern[str]) -> str:
    text = str(value or "").strip().lower()
    return text if pattern.fullmatch(text) else ""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--captures", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    equipped: dict[str, dict] = {}
    locations: dict[str, dict] = {}
    databases = 0
    rejected = 0
    for database in sorted(args.captures.glob("*/session.sqlite")):
        match = SESSION_SPACE.match(database.parent.name)
        room_id = exact(match.group(1) if match else "", SPACE32)
        connection = sqlite3.connect(database)
        connection.row_factory = sqlite3.Row
        try:
            rows = connection.execute("""
              SELECT id, session_name, event_type, uid, avatar_id, source,
                     raw_context, confidence, observed_at
              FROM protocol_events
              WHERE event_type IN ('avatar_wearing_uid', 'avatar_equipped_item')
              ORDER BY id
            """)
        except sqlite3.Error:
            connection.close()
            continue
        databases += 1
        for row in rows:
            avatar_id = exact(row["avatar_id"], HEX24)
            uid = exact(row["uid"], HEX24)
            source_xml = str(row["source"] or "").strip()
            if not avatar_id or not uid or not source_xml.lower().endswith(".xml"):
                rejected += 1
                continue
            evidence_sha = digest(database.parent.name, row["id"], row["event_type"], avatar_id, uid, source_xml)
            equipped[evidence_sha] = {
                "avatarId": avatar_id,
                "spaceId": room_id or None,
                "itemInstanceUid": uid,
                "itemDefinitionSourceXml": source_xml,
                "relationship": "equipped",
                "observedAt": str(row["observed_at"] or ""),
                "confidence": float(row["confidence"] or 0),
                "sourceKey": "rtmp-explicit-wearing-event",
                "captureId": database.parent.name,
                "crawlerId": database.parent.name.split("-", 2)[0] + "-" + database.parent.name.split("-", 2)[1],
                "evidenceSha256": evidence_sha,
            }
            if room_id:
                location_key = f"{avatar_id}:{room_id}"
                prior = locations.get(location_key)
                observed_at = str(row["observed_at"] or "")
                if prior is None or observed_at > prior["observedAt"]:
                    locations[location_key] = {
                        "avatarId": avatar_id,
                        "spaceId": room_id,
                        "observedAt": observed_at,
                        "captureId": database.parent.name,
                        "evidenceSha256": digest(database.parent.name, avatar_id, room_id),
                    }
        connection.close()

    payload = {
        "contract": "beacon-canonical-live-evidence/v1",
        "captureDatabases": databases,
        "equipped": list(equipped.values()),
        "avatarLocations": list(locations.values()),
        "rejectedMalformedEvents": rejected,
        "semantics": {
            "ownerAccountInferred": False,
            "roomSource": "single-room Popular capture generation",
            "equipmentSource": list(EVENTS),
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    print(json.dumps({
        "ok": True,
        "captureDatabases": databases,
        "equipped": len(equipped),
        "avatarLocations": len(locations),
        "rejectedMalformedEvents": rejected,
        "output": str(args.output),
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
