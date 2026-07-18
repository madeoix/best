#!/usr/bin/env python3
"""Publish a bounded Beacon read model from explicit crawler evidence.

Catalog eligibility remains whatever the Observatory rare/legendary gate put
in ``items``.  Avatar equipment is an independent projection: only recovered
``avatar_wearing_uid``/``avatar_equipped_item`` protocol events enter that
bucket, including common renderer inputs that must never be promoted into the
public item catalog.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path


HEX24 = re.compile(r"^[0-9a-f]{24}$", re.I)
SHA256 = re.compile(r"^[0-9a-f]{64}$", re.I)
SOURCE_XML = re.compile(r"^[^\s?#]+\.xml$", re.I)
EQUIPPED_EVENT_TYPES = {"avatar_wearing_uid", "avatar_equipped_item"}


def parse_context(value: object) -> dict:
    try:
        parsed = json.loads(str(value or "{}"))
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}


def exact_hex24(*values: object) -> str | None:
    for value in values:
        text = str(value or "").strip().lower()
        if HEX24.fullmatch(text):
            return text
    return None


def rfc3339(value: object) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    if re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})",
        text,
    ):
        return text
    if re.fullmatch(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?", text):
        return text.replace(" ", "T", 1) + "Z"
    return None


def valid_xml_sha(value: object) -> str | None:
    text = str(value or "").strip()
    if not text or not text.startswith("<"):
        return None
    try:
        ET.fromstring(text)
    except ET.ParseError:
        return None
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def table_exists(db: sqlite3.Connection, name: str) -> bool:
    return db.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (name,),
    ).fetchone() is not None


def load_world_spaces(path: Path | None) -> dict[str, dict]:
    if path is None or not path.is_file():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, json.JSONDecodeError):
        return {}
    rows = payload.get("spaces") if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        return {}
    output: dict[str, dict] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        space_id = str(row.get("space_id") or row.get("id") or "").strip()
        name = str(row.get("space_name") or row.get("name") or "").strip()
        image = str(
            row.get("snapshot_url")
            or row.get("thumb_url")
            or row.get("image_url")
            or ""
        ).strip()
        if space_id and name and image:
            output[space_id] = {
                "space_id": space_id,
                "space_name": name,
                "space_snapshot_url": image,
                "space_thumb_url": str(row.get("thumb_url") or image).strip(),
            }
    return output


def latest_uid_spaces(db: sqlite3.Connection) -> dict[str, str]:
    if not table_exists(db, "uid_instance_configs"):
        return {}
    rows = db.execute(
        """SELECT uid, space_id
             FROM uid_instance_configs
            WHERE uid <> '' AND space_id <> ''
            ORDER BY observed_at DESC"""
    ).fetchall()
    output: dict[str, str] = {}
    for row in rows:
        uid = str(row["uid"] or "").strip()
        space_id = str(row["space_id"] or "").strip()
        if uid and space_id and uid not in output:
            output[uid] = space_id
    return output


def explicit_snapshot_id(ctx: dict) -> str | None:
    for key in ("avatarConfigSnapshotId", "avatar_config_snapshot_id"):
        value = str(ctx.get(key) or "").strip()
        if value:
            return value[:256]
    return None


def export_wearing_events(db: sqlite3.Connection) -> list[dict]:
    if not table_exists(db, "protocol_events"):
        return []
    rows = db.execute(
        """SELECT id, session_name, event_type, uid, owner_id, avatar_id,
                  source_xml, observed_at, origin, confidence, raw_context
             FROM protocol_events
            WHERE event_type IN ('avatar_wearing_uid', 'avatar_equipped_item')
            ORDER BY observed_at DESC, id DESC"""
    ).fetchall()
    output: list[dict] = []
    seen: set[str] = set()
    for row in rows:
        ctx = parse_context(row["raw_context"])
        avatar_id = exact_hex24(
            row["avatar_id"], ctx.get("initAvatarId"), ctx.get("avatarId")
        )
        uid = exact_hex24(row["uid"], ctx.get("initId"), ctx.get("uid"))
        owner_id = exact_hex24(row["owner_id"], ctx.get("ownerId"))
        source_xml = str(
            row["source_xml"]
            or ctx.get("initModelSource")
            or ctx.get("model")
            or ""
        ).strip()
        if (
            not avatar_id
            or not uid
            or not SOURCE_XML.fullmatch(source_xml)
            or source_xml.lower().endswith("/avatar.xml")
        ):
            continue
        observed_at = rfc3339(row["observed_at"])
        event_type = str(row["event_type"])
        evidence_hash = hashlib.sha256(
            str(row["raw_context"] or "").encode("utf-8", "ignore")
        ).hexdigest()
        observation_id = hashlib.sha256(
            "|".join([
                str(row["session_name"] or ""), event_type, avatar_id, uid,
                source_xml, str(observed_at or ""), evidence_hash,
            ]).encode("utf-8")
        ).hexdigest()
        if observation_id in seen:
            continue
        seen.add(observation_id)
        raw_confidence = row["confidence"]
        confidence = 95 if raw_confidence is None else round(float(raw_confidence) * 100)
        decoded_config = ctx.get("decodedConfigXML")
        output.append({
            "observation_id": observation_id,
            "relationship": "equipped",
            "event_type": event_type,
            "avatar_id": avatar_id,
            # Empty is intentional when the wearing packet did not state an owner.
            "owner_id": owner_id,
            "uid": uid,
            "item_instance_uid": uid,
            "source_xml": source_xml,
            "item_definition_source_xml": source_xml,
            "slot": str(ctx.get("slot") or ctx.get("equipmentSlot") or "") or None,
            "variant_key": str(ctx.get("variantSignature") or "") or None,
            "item_config_sha256": valid_xml_sha(decoded_config),
            # Never join this to a body snapshot merely because avatar_id/time match.
            "avatar_config_snapshot_id": explicit_snapshot_id(ctx),
            "space_id": str(ctx.get("spaceId") or "") or None,
            "observed_at": observed_at,
            "valid_from": observed_at,
            "valid_to": None,
            "confidence": max(0, min(100, confidence)),
            "source_capture_id": str(row["session_name"] or "") or None,
            "origin": str(row["origin"] or "") or None,
            "evidence_sha256": evidence_hash,
        })
    return output


def export_wearing_sidecar(path: Path | None) -> list[dict]:
    """Read the bounded identity sidecar without merging the capture DB.

    Live crawler imports deliberately avoid rewriting the multi-gigabyte
    Observatory database. The wearing sidecar is the small, append-only
    projection intended for this read path.
    """
    if path is None or not path.is_file():
        return []
    sidecar = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    sidecar.row_factory = sqlite3.Row
    if not table_exists(sidecar, "avatar_wearing_rtmp_events"):
        sidecar.close()
        return []
    rows = sidecar.execute(
        """SELECT event_key, session_name, event_type, relationship, uid,
                  owner_id, wearing_avatar_id, source_xml, config_field,
                  variant_signature, item_config_sha256,
                  avatar_config_snapshot_id, raw_context, evidence,
                  confidence, observed_at
             FROM avatar_wearing_rtmp_events
            ORDER BY observed_at DESC, event_key DESC"""
    ).fetchall()
    output: list[dict] = []
    for row in rows:
        avatar_id = exact_hex24(row["wearing_avatar_id"])
        uid = exact_hex24(row["uid"])
        owner_id = exact_hex24(row["owner_id"])
        source_xml = str(row["source_xml"] or "").strip()
        if (
            not avatar_id
            or not uid
            or not SOURCE_XML.fullmatch(source_xml)
            or source_xml.lower().endswith("/avatar.xml")
        ):
            continue
        observed_at = rfc3339(row["observed_at"])
        confidence = 95 if row["confidence"] is None else round(float(row["confidence"]) * 100)
        evidence_hash = hashlib.sha256(
            str(row["evidence"] or row["raw_context"] or "").encode("utf-8", "ignore")
        ).hexdigest()
        output.append({
            "observation_id": str(row["event_key"]),
            "relationship": "equipped",
            "event_type": str(row["event_type"] or "avatar_wearing_uid"),
            "avatar_id": avatar_id,
            "owner_id": owner_id,
            "uid": uid,
            "item_instance_uid": uid,
            "source_xml": source_xml,
            "item_definition_source_xml": source_xml,
            "slot": str(row["config_field"] or "") or None,
            "variant_key": str(row["variant_signature"] or "") or None,
            "item_config_sha256": str(row["item_config_sha256"] or "") or None,
            "avatar_config_snapshot_id": str(row["avatar_config_snapshot_id"] or "") or None,
            "space_id": None,
            "observed_at": observed_at,
            "valid_from": observed_at,
            "valid_to": None,
            "confidence": max(0, min(100, confidence)),
            "source_capture_id": str(row["session_name"] or "") or None,
            "origin": "crawler-rtmp-wearing-sidecar",
            "evidence_sha256": evidence_hash,
        })
    sidecar.close()
    return output


def export_config_snapshots(queue_path: Path | None) -> list[dict]:
    if queue_path is None or not queue_path.is_file():
        return []
    try:
        queue = json.loads(queue_path.read_text(encoding="utf-8"))
    except (OSError, ValueError, json.JSONDecodeError):
        return []
    if queue.get("contract") != "beacon-avatar-render-queue/v1":
        return []
    output: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for row in queue.get("avatars") or []:
        if not isinstance(row, dict):
            continue
        avatar_id = exact_hex24(row.get("avatar_id"))
        config_xml = str(row.get("config_xml") or "").strip()
        if not avatar_id or not config_xml.startswith("<avatar"):
            continue
        try:
            root = ET.fromstring(config_xml)
        except ET.ParseError:
            continue
        if root.tag.lower().split("}")[-1] != "avatar":
            continue
        config_sha = hashlib.sha256(config_xml.encode("utf-8")).hexdigest()
        supplied_sha = str(row.get("config_sha256") or "").strip().lower()
        if SHA256.fullmatch(supplied_sha) and supplied_sha != config_sha:
            # A sole trailing newline is an artifact of sanitized file export.
            without_terminal_newline = str(row.get("config_xml") or "").rstrip("\n")
            alternate = hashlib.sha256(without_terminal_newline.encode("utf-8")).hexdigest()
            if supplied_sha == alternate:
                config_sha = supplied_sha
        key = (avatar_id, config_sha)
        if key in seen:
            continue
        seen.add(key)
        output.append({
            "snapshot_id": f"{avatar_id}:{config_sha}",
            "avatar_id": avatar_id,
            "owner_id": exact_hex24(row.get("owner_id")),
            "config_sha256": config_sha,
            "captured_at": rfc3339(row.get("captured_at")),
            "space_id": str(row.get("space_id") or "") or None,
            "gender": str(row.get("gender") or "") or None,
            "display_name": str(row.get("display_name") or "") or None,
            "source_capture_id": str(
                row.get("source_capture_id")
                or row.get("session_name")
                or row.get("source")
                or ""
            ) or None,
            "source": "crawler-rtmp-avatar-shared-object",
            "equipped_items": [],
        })
    return output


def main(
    db_path: str,
    out_path: str,
    avatar_queue: str | None = None,
    identity_db: str | None = None,
    world_path: str | None = None,
) -> None:
    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row
    assets = [dict(row) for row in db.execute("SELECT * FROM items ORDER BY observed_count DESC, last_seen DESC")]
    visuals = [dict(row) for row in db.execute("""
        SELECT uid, source_xml, instance_name, instance_desc, variant_label,
               variant_options_json, variant_icon, variant_render_key,
               variant_render_status, space_id, space_name, observed_at
        FROM uid_instance_configs
        WHERE variant_icon <> '' AND variant_render_status = 'rendered'
        ORDER BY observed_at DESC
    """)]
    icon_root = Path(db_path).parent / "observatory-variant-icons"
    published_visuals = []
    first_icon: dict[str, str] = {}
    for visual in visuals:
        source = str(visual.get("source_xml") or "")
        icon = str(visual.get("variant_icon") or "")
        # Some historic DB rows are marked rendered although their PNG batch
        # was later pruned. Do not publish a broken path to Beacon.
        if not icon or not (icon_root / Path(icon).name).is_file():
            continue
        if source and icon and source not in first_icon:
            first_icon[source] = "/variant-icons/" + Path(icon).name
        visual["variant_icon"] = "/variant-icons/" + Path(icon).name
        published_visuals.append(visual)
    for asset in assets:
        if asset["source_xml"] in first_icon:
            asset["variant_icon"] = first_icon[asset["source_xml"]]
    observations = [dict(row) for row in db.execute("""
        SELECT uid, source_xml, owner_id, ask_price, currency, session_name,
               observed_at, origin FROM observations
        ORDER BY observed_at DESC LIMIT 12000
    """)]
    world_file = Path(world_path) if world_path else Path(db_path).parent / "beacon-world-index.json"
    world_spaces = load_world_spaces(world_file)
    uid_spaces = latest_uid_spaces(db)
    canonical_observations = []
    unresolved_space_observations = 0
    for observation in observations:
        space = world_spaces.get(uid_spaces.get(str(observation.get("uid") or ""), ""))
        if space:
            observation.update(space)
            canonical_observations.append(observation)
        else:
            # Keep incomplete capture evidence private. It remains in the source
            # database and becomes publishable after its room identity is joined.
            unresolved_space_observations += 1
    observations = canonical_observations
    wearing_events = export_wearing_events(db)
    sidecar_events = export_wearing_sidecar(Path(identity_db) if identity_db else None)
    if sidecar_events:
        wearing_events = list({
            (
                row.get("avatar_id"), row.get("uid"), row.get("source_xml"),
                row.get("observed_at"), row.get("source_capture_id"),
            ): row
            for row in [*wearing_events, *sidecar_events]
        }.values())
    queue_path = Path(avatar_queue) if avatar_queue else Path(db_path).parent / "beacon-avatar-render-queue.json"
    config_snapshots = export_config_snapshots(queue_path)
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "assets": assets,
        "observations": observations,
        "uid_change_events": [],
        "variant_visuals": published_visuals[:5000],
        "avatar_wearing_events": wearing_events,
        "avatar_config_snapshots": config_snapshots,
        "sync_metadata": {
            "contract": "beacon-observatory-lite/v3",
            "relationship_contract": "beacon-avatar-relationships/v1",
            "avatar_wearing_events": len(wearing_events),
            "avatar_config_snapshots": len(config_snapshots),
            "canonical_space_observations": len(observations),
            "pending_space_enrichment": unresolved_space_observations,
        },
    }
    target = Path(out_path)
    temporary = target.with_suffix(target.suffix + ".partial")
    target.parent.mkdir(parents=True, exist_ok=True)
    with temporary.open("w", encoding="utf-8") as stream:
        # Stream the bounded projection to disk instead of creating a second
        # complete JSON string in memory.  The old full export could exhaust
        # the VPS while serializing multi-gigabyte evidence.
        json.dump(payload, stream, separators=(",", ":"))
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(target)
    print(json.dumps({"ok": True, "assets": len(assets), "variants": len(payload["variant_visuals"])}))


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4, 5, 6):
        raise SystemExit(
            "usage: export-beacon-observatory-lite.py DB OUT [AVATAR_QUEUE] [IDENTITY_DB] [WORLD_INDEX]"
        )
    main(
        sys.argv[1],
        sys.argv[2],
        sys.argv[3] if len(sys.argv) >= 4 else None,
        sys.argv[4] if len(sys.argv) >= 5 else None,
        sys.argv[5] if len(sys.argv) == 6 else None,
    )
