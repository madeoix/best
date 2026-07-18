#!/usr/bin/env python3
"""Export live RTMP avatar-body config records for Beacon's renderer pipeline.

This deliberately accepts only ``avatars/.../avatar.xml`` protocol evidence.
Equipped clothing/item config is not a substitute for a whole-avatar config.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import xml.etree.ElementTree as ET
from pathlib import Path


AVATAR_ID = re.compile(r"^[0-9a-f]{24}$", re.I)
SHA256 = re.compile(r"^[0-9a-f]{64}$", re.I)


def context(value: str | None) -> dict:
    try:
        result = json.loads(value or "{}")
        return result if isinstance(result, dict) else {}
    except json.JSONDecodeError:
        return {}


def table_exists(conn: sqlite3.Connection, name: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (name,),
    ).fetchone() is not None


def normalized_xml(value: object) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return ""
    if root.tag.lower().split("}")[-1] != "avatar":
        return ""
    return text


def xml_sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def exact_owner_id(value: object) -> str | None:
    text = str(value or "").strip().lower()
    return text if AVATAR_ID.fullmatch(text) else None


def config_rows(conn: sqlite3.Connection) -> list[dict]:
    """Read the authoritative shared-object table, with a legacy fallback."""
    rows: list[dict] = []
    if table_exists(conn, "avatar_config_observations"):
        for row in conn.execute(
            """SELECT avatar_id, owner_id, space_id, display_name, gender,
                      model, config_sha256, config_xml, source_shared_object,
                      session_name, run_id, observed_at, origin
                 FROM avatar_config_observations
                WHERE avatar_id IS NOT NULL AND avatar_id != ''
                ORDER BY observed_at DESC, id DESC"""
        ):
            rows.append(dict(row))

    # Some historical Observatory databases only retained the sanitized body
    # config in protocol_events.raw_context. Accept that exact avatar.xml path,
    # but never treat an item/wearing config as a whole-avatar snapshot.
    if not rows and table_exists(conn, "protocol_events"):
        for row in conn.execute(
            """SELECT avatar_id, owner_id, space_id, model_name, source,
                      session_name, run_id, raw_context, observed_at, origin
                 FROM protocol_events
                WHERE avatar_id IS NOT NULL AND avatar_id != ''
                  AND lower(COALESCE(source, '')) LIKE 'avatars/%/avatar.xml'
                ORDER BY observed_at DESC, id DESC"""
        ):
            data = context(row["raw_context"])
            rows.append({
                "avatar_id": row["avatar_id"],
                "owner_id": row["owner_id"],
                "space_id": row["space_id"],
                "display_name": data.get("displayName"),
                "gender": data.get("gender"),
                "model": row["source"],
                "config_sha256": data.get("configSha256"),
                "config_xml": (
                    data.get("decodedConfigXML")
                    or data.get("instanceConfigXML")
                    or data.get("configXML")
                ),
                "source_shared_object": data.get("sourceSharedObject"),
                "session_name": row["session_name"],
                "run_id": row["run_id"],
                "observed_at": row["observed_at"],
                "origin": row["origin"],
            })
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--observatory-db", required=True)
    parser.add_argument("--static-root", required=True)
    parser.add_argument("--avatar-id")
    args = parser.parse_args()
    wanted = str(args.avatar_id or "").strip()
    root = Path(args.static_root)
    conn = sqlite3.connect(args.observatory_db)
    conn.row_factory = sqlite3.Row
    rows = config_rows(conn)
    written = []
    seen = set()
    for row in rows:
        avatar_id = str(row.get("avatar_id") or "").strip().lower()
        if not AVATAR_ID.fullmatch(avatar_id):
            continue
        if wanted and avatar_id != wanted or avatar_id in seen:
            continue
        config = normalized_xml(row.get("config_xml"))
        if not config:
            continue
        computed_hash = xml_sha256(config)
        supplied_hash = str(row.get("config_sha256") or "").strip().lower()
        supplied_hash_verified = bool(
            SHA256.fullmatch(supplied_hash) and supplied_hash == computed_hash
        )
        destination = root / "avatar-calibration" / avatar_id
        destination.mkdir(parents=True, exist_ok=True)
        (destination / "live-config.xml").write_text(config + "\n", encoding="utf-8")
        manifest = {
            "contract": "beacon-avatar-calibration/v1",
            "avatar_id": avatar_id,
            "owner_id": exact_owner_id(row.get("owner_id")),
            "space_id": str(row.get("space_id") or "") or None,
            "display_name": str(row.get("display_name") or "") or None,
            "gender": str(row.get("gender") or "") or None,
            "model": str(row.get("model") or "avatars/body/base/unisex/avatar.xml"),
            "config_sha256": computed_hash,
            "supplied_config_sha256_verified": supplied_hash_verified,
            "sanitized": True,
            "source": "live-rtmp-avatar-body-config",
            "source_capture_id": (
                str(row.get("run_id") or "")
                or str(row.get("session_name") or "")
                or None
            ),
            "source_shared_object": str(row.get("source_shared_object") or "") or None,
            "origin": str(row.get("origin") or "") or None,
            "captured_at": row.get("observed_at"),
            "states": [{"config": f"/avatar-calibration/{avatar_id}/live-config.xml"}],
        }
        (destination / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        written.append(avatar_id)
        seen.add(avatar_id)
    print(json.dumps({"ok": True, "avatars_exported": written, "count": len(written)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
