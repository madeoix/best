#!/usr/bin/env python3
import json
import re
import sqlite3
import hashlib
from pathlib import Path

DB = Path("/opt/smallverse/workspace/identity.sqlite")

HEX24 = re.compile(r"\b[0-9a-f]{24}\b", re.I)
AVATAR_TERMS = re.compile(
    r"avatar|appearance|hair|skin|face|body|outfit|wear|wearing|shirt|pants|shoes|"
    r"gender|thumbUrl|snapUrl|uploads/avatars",
    re.I,
)
AVATAR_URL = re.compile(
    r"https://content\.smallverse\.app/uploads/avatars/([0-9a-f]{24})([0-9a-f]+?)(?:_(thumb|snap))?\.png",
    re.I,
)

def variant(suffix):
    return "thumb" if suffix == "thumb" else "snapshot" if suffix == "snap" else "head"

def digest(text):
    return hashlib.sha1(text.encode("utf-8", "ignore")).hexdigest()[:24]

def setup(con):
    con.executescript("""
    CREATE TABLE IF NOT EXISTS avatar_protocol_events (
      id INTEGER PRIMARY KEY,
      source_event_id INTEGER,
      session_name TEXT,
      owner_id TEXT,
      avatar_id TEXT,
      event_type TEXT,
      raw_context TEXT,
      parsed_json TEXT,
      confidence REAL,
      origin TEXT,
      observed_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ux_avatar_protocol_sidecar
    ON avatar_protocol_events(source_event_id, event_type, avatar_id, owner_id);

    CREATE TABLE IF NOT EXISTS avatar_appearance_snapshots (
      avatar_id TEXT NOT NULL,
      owner_id TEXT,
      snapshot_key TEXT NOT NULL,
      appearance_json TEXT NOT NULL,
      source_event_ids_json TEXT,
      confidence REAL,
      first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
      last_seen TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (avatar_id, snapshot_key)
    );

    CREATE TABLE IF NOT EXISTS avatar_asset_hints (
      avatar_id TEXT NOT NULL,
      variant TEXT NOT NULL,
      asset_hash TEXT,
      url TEXT,
      source_event_id INTEGER,
      source TEXT,
      is_protocol_derived INTEGER DEFAULT 1,
      first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
      last_seen TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (avatar_id, variant, asset_hash, url)
    );
    """)

def confidence(raw, avatar_id, owner_id):
    low = raw.lower()
    score = 0.2
    if "avatar" in low: score += 0.25
    if "uploads/avatars" in low or "thumburl" in low or "snapurl" in low: score += 0.3
    if any(x in low for x in ["appearance", "hair", "skin", "face", "body", "outfit", "wearing"]): score += 0.2
    if avatar_id and avatar_id in low: score += 0.15
    if owner_id and owner_id in low: score += 0.1
    return min(score, 0.98)

def event_type(raw):
    low = raw.lower()
    if "uploads/avatars" in low or "thumburl" in low or "snapurl" in low:
        return "avatar_asset_hint"
    if any(x in low for x in ["appearance", "hair", "skin", "face", "body", "outfit", "wearing"]):
        return "avatar_appearance_candidate"
    return "avatar_state_candidate"

def main():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    setup(con)

    known = {
        str(r[0]).lower()
        for r in con.execute("""
          SELECT avatar_id FROM owner_avatar_candidates
          UNION
          SELECT avatar_id FROM avatars
        """)
        if r[0]
    }

    rows = con.execute("""
      SELECT id, session_name, owner_id, avatar_id, event_type, raw_context, origin, observed_at
      FROM protocol_events
      WHERE COALESCE(raw_context, '') != ''
        AND (
          raw_context LIKE '%avatar%'
          OR raw_context LIKE '%Avatar%'
          OR raw_context LIKE '%uploads/avatars%'
          OR raw_context LIKE '%thumbUrl%'
          OR raw_context LIKE '%snapUrl%'
          OR COALESCE(avatar_id, '') != ''
        )
      ORDER BY id
    """).fetchall()

    scanned = events = hints = snaps = 0

    for row in rows:
        raw = row["raw_context"] or ""
        scanned += 1
        if not AVATAR_TERMS.search(raw) and not row["avatar_id"]:
            continue

        ids = []
        if row["avatar_id"]:
            ids.append(str(row["avatar_id"]).lower())

        raw_ids = [m.group(0).lower() for m in HEX24.finditer(raw)]
        known_hits = [x for x in raw_ids if x in known]
        ids.extend(known_hits or raw_ids[:8])
        ids = list(dict.fromkeys([x for x in ids if re.fullmatch(r"[0-9a-f]{24}", x)]))

        for m in AVATAR_URL.finditer(raw):
            aid, ahash, suffix = m.groups()
            url = m.group(0)
            con.execute("""
              INSERT INTO avatar_asset_hints
                (avatar_id, variant, asset_hash, url, source_event_id, source, is_protocol_derived)
              VALUES (?, ?, ?, ?, ?, 'protocol_events.raw_context/avatar_rtmp_probe', 1)
              ON CONFLICT(avatar_id, variant, asset_hash, url)
              DO UPDATE SET source_event_id=excluded.source_event_id, last_seen=CURRENT_TIMESTAMP
            """, (aid.lower(), variant(suffix), ahash.lower(), url, row["id"]))
            hints += 1
            if aid.lower() not in ids:
                ids.append(aid.lower())

        et = event_type(raw)
        owner = row["owner_id"] or ""

        for aid in ids:
            parsed = {
                "known_avatar_match": aid in known,
                "source_event_type": row["event_type"],
                "source_origin": row["origin"],
                "candidate_ids": ids[:20],
            }
            conf = confidence(raw, aid, owner)

            con.execute("""
              INSERT OR IGNORE INTO avatar_protocol_events
                (source_event_id, session_name, owner_id, avatar_id, event_type,
                 raw_context, parsed_json, confidence, origin, observed_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'avatar_rtmp_probe/sidecar', ?)
            """, (
                row["id"], row["session_name"] or "", owner, aid, et,
                raw[:6000], json.dumps(parsed, sort_keys=True), conf,
                row["observed_at"] or None,
            ))
            events += 1

            if et == "avatar_appearance_candidate":
                body = {
                    "avatar_id": aid,
                    "owner_id": owner,
                    "raw_context": raw[:6000],
                    "parsed": parsed,
                    "source": "avatar_rtmp_probe/sidecar",
                }
                key = digest(json.dumps(body, sort_keys=True))
                con.execute("""
                  INSERT INTO avatar_appearance_snapshots
                    (avatar_id, owner_id, snapshot_key, appearance_json,
                     source_event_ids_json, confidence)
                  VALUES (?, ?, ?, ?, ?, ?)
                  ON CONFLICT(avatar_id, snapshot_key)
                  DO UPDATE SET last_seen=CURRENT_TIMESTAMP,
                                confidence=MAX(confidence, excluded.confidence)
                """, (aid, owner, key, json.dumps(body, sort_keys=True), json.dumps([row["id"]]), conf))
                snaps += 1

        if scanned % 10000 == 0:
            con.commit()
            print(json.dumps({"scanned": scanned, "events": events, "asset_hints": hints, "snapshots": snaps}), flush=True)

    con.commit()

    print(json.dumps({
        "ok": True,
        "scanned_source_events": scanned,
        "candidate_events_seen": events,
        "asset_hints_seen": hints,
        "appearance_snapshots_seen": snaps,
        "tables": {
            "avatar_protocol_events": con.execute("SELECT COUNT(*) FROM avatar_protocol_events").fetchone()[0],
            "avatar_asset_hints": con.execute("SELECT COUNT(*) FROM avatar_asset_hints").fetchone()[0],
            "avatar_appearance_snapshots": con.execute("SELECT COUNT(*) FROM avatar_appearance_snapshots").fetchone()[0],
        }
    }, indent=2))

if __name__ == "__main__":
    main()
