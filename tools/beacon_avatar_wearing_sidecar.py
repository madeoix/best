#!/usr/bin/env python3
import hashlib
import json
import re
import sqlite3
import xml.etree.ElementTree as ET
from pathlib import Path

OBS_DB = Path("/opt/smallverse/workspace/observatory.sqlite")
ID_DB = Path("/opt/smallverse/workspace/identity.sqlite")

OWNER_RE = re.compile(r"\bownerId\s+([0-9a-f]{24})\b", re.I)
HEX24 = re.compile(r"^[0-9a-f]{24}$", re.I)


def stable_key(*parts):
    return hashlib.sha1("|".join(str(p or "") for p in parts).encode()).hexdigest()


def parse_json(raw):
    try:
        return json.loads(raw or "{}")
    except Exception:
        return {}


def parse_decoded_config(xml_text):
    out = {
        "ai_avatar_id": "",
        "description_name": "",
        "description_desc": "",
    }

    if not xml_text:
        return out

    try:
        root = ET.fromstring(xml_text)
    except Exception:
        return out

    ai = root.find(".//ai")
    if ai is not None:
        out["ai_avatar_id"] = ai.attrib.get("avatarId") or ""

    desc = root.find(".//description")
    if desc is not None:
        out["description_name"] = desc.attrib.get("name") or ""
        out["description_desc"] = desc.attrib.get("desc") or ""

    return out


def raw_owner_id(obj):
    raw = obj.get("raw") or ""
    m = OWNER_RE.search(raw)
    if m:
        return m.group(1).lower()
    return ""


def setup(con):
    con.executescript("""
    CREATE TABLE IF NOT EXISTS avatar_wearing_rtmp_events (
      event_key TEXT PRIMARY KEY,
      observatory_event_id INTEGER,
      session_name TEXT,
      uid TEXT,
      owner_id TEXT,
      wearing_avatar_id TEXT,
      npc_avatar_id TEXT,
      source_xml TEXT,
      display_name TEXT,
      description TEXT,
      config_field TEXT,
      variant_signature TEXT,
      decoded_config_xml TEXT,
      raw_context TEXT,
      evidence TEXT,
      confidence REAL,
      observed_at TEXT,
      first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
      last_seen TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_avatar_wearing_owner
    ON avatar_wearing_rtmp_events(owner_id, observed_at);

    CREATE INDEX IF NOT EXISTS idx_avatar_wearing_avatar
    ON avatar_wearing_rtmp_events(wearing_avatar_id, observed_at);

    CREATE INDEX IF NOT EXISTS idx_avatar_wearing_npc
    ON avatar_wearing_rtmp_events(npc_avatar_id, observed_at);
    """)


def main():
    obs = sqlite3.connect(OBS_DB)
    obs.row_factory = sqlite3.Row

    ident = sqlite3.connect(ID_DB)
    ident.row_factory = sqlite3.Row
    setup(ident)

    rows = obs.execute("""
      SELECT id, session_name, uid, owner_id, avatar_id, source_xml, raw_context, observed_at
      FROM protocol_events
      WHERE event_type = 'avatar_wearing_uid'
         OR COALESCE(avatar_id, '') != ''
      ORDER BY id
    """).fetchall()

    imported = 0
    skipped = 0

    for row in rows:
        obj = parse_json(row["raw_context"])
        cfg = parse_decoded_config(obj.get("decodedConfigXML") or "")

        uid = obj.get("uid") or row["uid"] or ""
        owner_id = row["owner_id"] or raw_owner_id(obj)
        wearing_avatar_id = (
            obj.get("initAvatarId")
            or obj.get("avatarId")
            or row["avatar_id"]
            or ""
        )
        npc_avatar_id = cfg["ai_avatar_id"]
        source_xml = obj.get("initModelSource") or obj.get("model") or row["source_xml"] or ""

        if not HEX24.match(wearing_avatar_id or ""):
            skipped += 1
            continue

        event_key = stable_key(row["id"], uid, owner_id, wearing_avatar_id, npc_avatar_id, source_xml)

        parsed = {
            "observed_as": obj.get("observedAs") or "Avatar Wearing",
            "model_name": obj.get("initModelName") or obj.get("modelName"),
            "model_tags": obj.get("modelTags"),
            "script": obj.get("script"),
            "verb": obj.get("verb"),
            "config_field": obj.get("configField"),
            "variant_signature": obj.get("variantSignature"),
            "ai_avatar_id": npc_avatar_id,
            "wearing_avatar_id": wearing_avatar_id,
            "owner_id_from_raw": owner_id,
        }

        ident.execute("""
          INSERT INTO avatar_wearing_rtmp_events (
            event_key,
            observatory_event_id,
            session_name,
            uid,
            owner_id,
            wearing_avatar_id,
            npc_avatar_id,
            source_xml,
            display_name,
            description,
            config_field,
            variant_signature,
            decoded_config_xml,
            raw_context,
            evidence,
            confidence,
            observed_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(event_key)
          DO UPDATE SET
            owner_id = excluded.owner_id,
            wearing_avatar_id = excluded.wearing_avatar_id,
            npc_avatar_id = excluded.npc_avatar_id,
            source_xml = excluded.source_xml,
            display_name = excluded.display_name,
            description = excluded.description,
            config_field = excluded.config_field,
            variant_signature = excluded.variant_signature,
            decoded_config_xml = excluded.decoded_config_xml,
            raw_context = excluded.raw_context,
            evidence = excluded.evidence,
            confidence = excluded.confidence,
            observed_at = excluded.observed_at,
            last_seen = CURRENT_TIMESTAMP
        """, (
            event_key,
            row["id"],
            row["session_name"] or "",
            uid,
            owner_id,
            wearing_avatar_id,
            npc_avatar_id,
            source_xml,
            cfg["description_name"],
            cfg["description_desc"],
            obj.get("configField") or "",
            obj.get("variantSignature") or "",
            obj.get("decodedConfigXML") or "",
            json.dumps(parsed, ensure_ascii=False, sort_keys=True),
            obj.get("evidence") or "",
            0.95,
            row["observed_at"] or "",
        ))

        imported += 1

    ident.commit()

    summary = ident.execute("""
      SELECT
        COUNT(*) AS rows,
        COUNT(DISTINCT owner_id) AS owners,
        COUNT(DISTINCT wearing_avatar_id) AS wearing_avatars,
        COUNT(DISTINCT npc_avatar_id) AS npc_avatars,
        COUNT(DISTINCT source_xml) AS source_items
      FROM avatar_wearing_rtmp_events
    """).fetchone()

    print(json.dumps({
        "ok": True,
        "source": str(OBS_DB),
        "target": str(ID_DB),
        "read_rows": len(rows),
        "imported_or_updated": imported,
        "skipped": skipped,
        "table": {
            "rows": summary["rows"],
            "owners": summary["owners"],
            "wearing_avatars": summary["wearing_avatars"],
            "npc_avatars": summary["npc_avatars"],
            "source_items": summary["source_items"],
        }
    }, indent=2))


if __name__ == "__main__":
    main()
