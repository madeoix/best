import argparse
import json
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE = Path("/opt/smallverse/workspace")
DB = WORKSPACE / "observatory.sqlite"
WORLD = WORKSPACE / "beacon-world-index.json"

USEFUL_TERMS = {
    "rare",
    "legendary",
    "wearable",
    "clothing",
    "consumable",
    "actionbar",
    "wear",
    "pet",
    "mount",
    "furniture",
    "spell",
    "widget",
}

NOISE_TERMS = {
    "rose",
    "roses",
    "flower",
    "flowers",
    "floorlight",
    "light",
    "wall",
    "platform",
    "display",
    "plant",
}

def log(msg):
    print(msg, flush=True)

def now():
    return datetime.now(timezone.utc).isoformat()

def item_name(source_xml):
    return Path(source_xml).name.replace("_item.xml", "").replace(".xml", "").replace("_", " ")

def item_is_useful(item):
    text = " ".join(str(item.get(k) or "") for k in ["name", "description", "category", "tags", "source_xml"]).lower()

    if item.get("is_rare"):
        return True

    if "legendary" in text or "rare" in text:
        return True

    if any(term in text for term in USEFUL_TERMS):
        return True

    if any(term in text for term in NOISE_TERMS):
        return False

    return False

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--space-id", required=True)
    ap.add_argument("--limit", type=int, default=300)
    args = ap.parse_args()

    space_id = args.space_id

    log("load world")
    world = json.loads(WORLD.read_text(errors="replace"))

    log("find space")
    space = next((s for s in world.get("spaces", []) if str(s.get("space_id") or "") == space_id), None)
    if not space:
        raise SystemExit(f"space not found: {space_id}")

    log(f"space: {space.get('display_name') or space.get('space_name') or space_id}")

    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row

    item_meta = {}
    try:
        for row in con.execute("""
            SELECT source_xml, name, description, icon, category, tags, is_rare, xml_price, currency
            FROM items
        """):
            item_meta[row["source_xml"]] = dict(row)
    except Exception as exc:
        log(f"items metadata unavailable: {exc}")

    def enrich(source_xml):
        meta = dict(item_meta.get(source_xml) or {})
        if not meta:
            meta = {
                "source_xml": source_xml,
                "name": item_name(source_xml),
                "description": "",
                "icon": "",
                "category": "",
                "tags": "",
                "is_rare": False,
                "xml_price": None,
                "currency": None,
            }
        return meta

    def query(label, sql, params):
        t = time.time()
        log(f"query {label}")
        rows = [dict(r) for r in con.execute(sql, params).fetchall()]
        log(f"{label}: {len(rows)} rows in {time.time() - t:.3f}s")
        return rows

    events = query("events", """
        SELECT observed_at, event_type, protocol, uid, owner_id, avatar_id,
               source_xml, ask, session_name, origin, evidence_tier, confidence
        FROM protocol_events
        WHERE space_id = ?
        ORDER BY observed_at DESC
        LIMIT ?
    """, (space_id, args.limit))

    item_rows = query("items", """
        SELECT source_xml, COUNT(*) AS observation_count, MAX(observed_at) AS latest_seen
        FROM protocol_events
        WHERE space_id = ? AND source_xml IS NOT NULL AND source_xml != ''
        GROUP BY source_xml
        ORDER BY observation_count DESC
        LIMIT 500
    """, (space_id,))

    owner_rows = query("owners", """
        SELECT owner_id, COUNT(*) AS evidence_count, MAX(observed_at) AS latest_seen
        FROM protocol_events
        WHERE space_id = ? AND owner_id IS NOT NULL AND owner_id != ''
        GROUP BY owner_id
        ORDER BY evidence_count DESC
        LIMIT 200
    """, (space_id,))

    avatar_rows = query("avatars", """
        SELECT avatar_id, owner_id, COUNT(*) AS evidence_count, MAX(observed_at) AS latest_seen
        FROM protocol_events
        WHERE space_id = ?
          AND avatar_id IS NOT NULL AND avatar_id != ''
        GROUP BY avatar_id, owner_id
        ORDER BY evidence_count DESC
        LIMIT 200
    """, (space_id,))

    useful_items = []
    noise_count = 0

    for row in item_rows:
        source_xml = row["source_xml"]
        item = enrich(source_xml)
        item.update({
            "observation_count": row["observation_count"],
            "latest_seen": row["latest_seen"],
            "signal_kind": "useful-item-signal" if item_is_useful(item) else "filtered-noise",
        })

        if item_is_useful(item):
            useful_items.append(item)
        else:
            noise_count += 1

        if len(useful_items) >= 200:
            break

    images = []
    seen = set()
    for url in [space.get("snapshot_url"), space.get("thumb_url"), *(space.get("image_urls") or [])]:
        if url and url not in seen:
            seen.add(url)
            images.append({"url": url, "kind": "space-image"})

    payload = {
        "ok": True,
        "contract": "smallverse-beacon-space-profile/v2",
        "generated_at": now(),
        "profile": {
            "space": space,
            "current_items": useful_items,
            "owners": owner_rows,
            "avatars": avatar_rows,
            "item_history": useful_items[:100],
            "evidence": events,
            "images": images,
            "technical": {
                "space_id": space_id,
                "source_db": str(DB),
                "source_world": str(WORLD),
                "raw_item_signals": len(item_rows),
                "useful_item_signals": len(useful_items),
                "filtered_item_noise": noise_count,
                "filter_note": "Space profile keeps rare/legendary/useful item signals and filters obvious decor/common noise."
            },
        },
    }

    out = WORKSPACE / f"beacon-space-profile-{space_id}.json"
    log("write json")
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    print(json.dumps({
        "ok": True,
        "out": str(out),
        "space": space.get("display_name"),
        "counts": {
            "current_items": len(useful_items),
            "owners": len(owner_rows),
            "avatars": len(avatar_rows),
            "evidence": len(events),
            "images": len(images),
            "filtered_item_noise": noise_count,
        }
    }, indent=2))

    con.close()

if __name__ == "__main__":
    main()
