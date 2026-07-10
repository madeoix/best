import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from smallverse_core.space_rollups import is_promoted_row, is_legendary_row

WORKSPACE = Path("/opt/smallverse/workspace")
DB = WORKSPACE / "observatory.sqlite"
WORLD = WORKSPACE / "beacon-world-index.json"
CONTRACT = "smallverse-beacon-space-profile/v2"


def now():
    return datetime.now(timezone.utc).isoformat()


def item_name(source_xml):
    return Path(source_xml or "").name.replace("_item.xml", "").replace(".xml", "").replace("_", " ")


def as_bool(value):
    return bool(int(value or 0))


def signal_reasons(item):
    reasons = []
    parts = " ".join(str(item.get(k) or "") for k in ["tags", "category"]).lower()
    tokens = set(parts.replace(";", ",").replace("|", ",").replace("/", ",").replace(" ", ",").split(","))

    if item.get("is_rare"):
        reasons.append("is_rare")
    if "rare" in tokens:
        reasons.append("rare")
    if "legendary" in tokens:
        reasons.append("legendary")
    if item.get("ask_min") is not None or item.get("ask_max") is not None:
        reasons.append("price evidence")

    return reasons or ["promoted"]


def load_world():
    return json.loads(WORLD.read_text(errors="replace"))


def find_space(world, space_id):
    for space in world.get("spaces", []):
        if str(space.get("space_id") or "") == space_id:
            return space
    for section in (world.get("sections") or {}).values():
        for space in section:
            if str(space.get("space_id") or "") == space_id:
                return space
    return None


def fetch_rows(con, sql, params=()):
    con.row_factory = sqlite3.Row
    return [dict(row) for row in con.execute(sql, params).fetchall()]


def in_clause(values):
    values = list(dict.fromkeys([v for v in values if v]))
    if not values:
        return "('')", []
    return "(" + ",".join("?" for _ in values) + ")", values


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--space-id", required=True)
    parser.add_argument("--evidence-limit", type=int, default=300)
    parser.add_argument("--out", default="")
    args = parser.parse_args()

    world = load_world()
    space = find_space(world, args.space_id)
    if not space:
        raise SystemExit(f"space not found: {args.space_id}")

    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row

    raw_items = fetch_rows(con, """
        SELECT
          pe.source_xml,
          COUNT(*) AS observation_count,
          COUNT(DISTINCT pe.uid) AS uid_count,
          COUNT(DISTINCT pe.owner_id) AS owner_count,
          MIN(pe.ask) AS ask_min,
          MAX(pe.ask) AS ask_max,
          MAX(pe.observed_at) AS latest_seen,
          i.name,
          i.icon,
          i.description,
          i.tags,
          i.category,
          i.is_rare,
          i.xml_price,
          i.currency
        FROM protocol_events pe
        LEFT JOIN items i ON i.source_xml = pe.source_xml
        WHERE pe.space_id = ?
          AND pe.source_xml IS NOT NULL
          AND pe.source_xml != ''
        GROUP BY pe.source_xml
        ORDER BY observation_count DESC
        LIMIT 1500
    """, (args.space_id,))

    useful_items = []
    filtered_examples = []
    filtered_count = 0

    for row in raw_items:
        item = {
            "source_xml": row.get("source_xml") or "",
            "name": row.get("name") or item_name(row.get("source_xml")),
            "icon": row.get("icon") or "",
            "description": row.get("description") or "",
            "tags": row.get("tags") or "",
            "category": row.get("category") or "",
            "is_rare": as_bool(row.get("is_rare")),
            "is_legendary": False,
            "xml_price": row.get("xml_price"),
            "currency": row.get("currency"),
            "ask_min": row.get("ask_min"),
            "ask_max": row.get("ask_max"),
            "observation_count": int(row.get("observation_count") or 0),
            "uid_count": int(row.get("uid_count") or 0),
            "owner_count": int(row.get("owner_count") or 0),
            "latest_seen": row.get("latest_seen") or "",
        }

        item["is_legendary"] = is_legendary_row(item)

        if is_promoted_row(item):
            item["signal_reasons"] = signal_reasons(item)
            useful_items.append(item)
        else:
            filtered_count += 1
            if len(filtered_examples) < 40:
                filtered_examples.append({
                    "source_xml": item["source_xml"],
                    "name": item["name"],
                    "observation_count": item["observation_count"],
                    "reason": "not rare/legendary/promoted"
                })

    useful_sources = [item["source_xml"] for item in useful_items]
    useful_sql, useful_params = in_clause(useful_sources)

    if useful_sources:
        evidence = fetch_rows(con, f"""
            SELECT
              observed_at,
              event_type,
              protocol,
              uid,
              owner_id,
              avatar_id,
              source_xml,
              ask,
              session_name,
              origin,
              evidence_tier,
              confidence
            FROM protocol_events
            WHERE space_id = ?
              AND source_xml IN {useful_sql}
            ORDER BY observed_at DESC
            LIMIT ?
        """, [args.space_id, *useful_params, args.evidence_limit])

        owners = fetch_rows(con, f"""
            SELECT
              owner_id,
              COUNT(*) AS evidence_count,
              MAX(observed_at) AS latest_seen
            FROM protocol_events
            WHERE space_id = ?
              AND source_xml IN {useful_sql}
              AND owner_id IS NOT NULL
              AND owner_id != ''
            GROUP BY owner_id
            ORDER BY evidence_count DESC
            LIMIT 200
        """, [args.space_id, *useful_params])

        avatars = fetch_rows(con, f"""
            SELECT
              avatar_id,
              owner_id,
              COUNT(*) AS evidence_count,
              MAX(observed_at) AS latest_seen
            FROM protocol_events
            WHERE space_id = ?
              AND source_xml IN {useful_sql}
              AND avatar_id IS NOT NULL
              AND avatar_id != ''
            GROUP BY avatar_id, owner_id
            ORDER BY evidence_count DESC
            LIMIT 200
        """, [args.space_id, *useful_params])
    else:
        evidence = []
        owners = []
        avatars = []

    images = []
    seen_images = set()
    for url in [space.get("snapshot_url"), space.get("thumb_url"), *(space.get("image_urls") or [])]:
        if url and url not in seen_images:
            seen_images.add(url)
            images.append({"url": url, "kind": "space-image"})

    payload = {
        "ok": True,
        "contract": CONTRACT,
        "generated_at": now(),
        "profile": {
            "space": space,
            "useful_items": useful_items,
            "owners": owners,
            "avatars": avatars,
            "evidence": evidence,
            "images": images,
            "filtered_noise": {
                "count": filtered_count,
                "examples": filtered_examples
            },
            "technical": {
                "space_id": args.space_id,
                "source_db": str(DB),
                "source_world": str(WORLD),
                "raw_item_signals": len(raw_items),
                "useful_item_signals": len(useful_items),
                "promotion_rule": "smallverse_core.space_rollups.is_promoted_row",
                "note": "Only rare/legendary/promoted rows are returned as useful_items. Common scene objects are filtered_noise."
            }
        }
    }

    out = Path(args.out) if args.out else WORKSPACE / f"beacon-space-profile-{args.space_id}.json"
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    print(json.dumps({
        "ok": True,
        "contract": CONTRACT,
        "out": str(out),
        "space": space.get("display_name") or space.get("space_name"),
        "counts": {
            "useful_items": len(useful_items),
            "filtered_noise": filtered_count,
            "owners": len(owners),
            "avatars": len(avatars),
            "evidence": len(evidence),
            "images": len(images)
        }
    }, indent=2))

    con.close()


if __name__ == "__main__":
    main()
