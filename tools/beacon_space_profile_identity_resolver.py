import argparse
import json
import sqlite3
from pathlib import Path

WORKSPACE = Path("/opt/smallverse/workspace")
IDENTITY_DB = WORKSPACE / "identity.sqlite"
AVATAR_INDEX = WORKSPACE / "avatar-url-index.json"


def full_name(first, last):
    return " ".join(part for part in [first or "", last or ""] if part).strip()


def placeholders(count):
    return ",".join("?" for _ in range(count))


def is_space_url(url):
    return "/uploads/spaces/" in str(url or "") or "/images/space/" in str(url or "")


def load_avatar_index():
    if not AVATAR_INDEX.exists():
        return {}
    payload = json.loads(AVATAR_INDEX.read_text(errors="replace"))
    return payload.get("by_avatar_id") or {}


def load_best_candidates(owner_ids):
    owner_ids = [oid for oid in dict.fromkeys(owner_ids) if oid]
    if not owner_ids:
        return {}

    avatar_index = load_avatar_index()

    con = sqlite3.connect(IDENTITY_DB)
    con.row_factory = sqlite3.Row

    rows = con.execute(
        f"""
        SELECT
          c.owner_id,
          c.avatar_id,
          c.first_name,
          c.last_name,
          c.confidence,
          c.reason,
          c.origin,
          c.evidence_count AS identity_evidence_count,
          c.first_seen AS identity_first_seen,
          c.last_seen AS identity_last_seen,
          a.thumb_url AS db_thumb_url,
          a.snapshot_url AS db_snapshot_url,
          a.head_url AS db_head_url,
          a.current_space_id,
          a.home_space_id,
          a.evidence_count AS avatar_evidence_count,
          a.first_seen AS avatar_first_seen,
          a.last_seen AS avatar_last_seen
        FROM owner_avatar_candidates c
        LEFT JOIN avatars a ON a.avatar_id = c.avatar_id
        WHERE c.owner_id IN ({placeholders(len(owner_ids))})
        ORDER BY
          c.owner_id,
          c.confidence DESC,
          c.evidence_count DESC,
          c.last_seen DESC
        """,
        owner_ids,
    ).fetchall()

    best = {}

    for row in rows:
        owner_id = row["owner_id"]
        if owner_id in best:
            continue

        avatar_id = row["avatar_id"] or ""
        indexed = avatar_index.get(avatar_id) or {}

        portrait_url = indexed.get("head_url") or ""
        portrait_thumb_url = indexed.get("thumb_url") or ""
        portrait_snapshot_url = indexed.get("snapshot_url") or ""

        db_thumb = row["db_thumb_url"] or ""
        db_snapshot = row["db_snapshot_url"] or ""

        best[owner_id] = {
            "owner_id": owner_id,
            "avatar_id": avatar_id,
            "avatar_name": full_name(row["first_name"], row["last_name"]),
            "avatar_first_name": row["first_name"] or "",
            "avatar_last_name": row["last_name"] or "",

            "avatar_portrait_url": portrait_url,
            "avatar_portrait_thumb_url": portrait_thumb_url,
            "avatar_portrait_snapshot_url": portrait_snapshot_url,
            "avatar_portrait_source": "avatar-url-index.saz" if (portrait_url or portrait_thumb_url or portrait_snapshot_url) else "none",

            "avatar_space_thumb_url": db_thumb if is_space_url(db_thumb) else "",
            "avatar_space_snapshot_url": db_snapshot if is_space_url(db_snapshot) else "",

            "confidence": row["confidence"],
            "identity_reason": row["reason"] or "",
            "identity_origin": row["origin"] or "",
            "identity_evidence_count": row["identity_evidence_count"] or 0,
            "identity_first_seen": row["identity_first_seen"] or "",
            "identity_last_seen": row["identity_last_seen"] or "",
            "avatar_evidence_count": row["avatar_evidence_count"] or 0,
            "avatar_first_seen": row["avatar_first_seen"] or "",
            "avatar_last_seen": row["avatar_last_seen"] or "",
            "current_space_id": row["current_space_id"] or "",
            "home_space_id": row["home_space_id"] or "",
            "identity_source": "identity.sqlite.owner_avatar_candidates",
        }

    con.close()
    return best


def enrich_profile(path):
    path = Path(path)
    payload = json.loads(path.read_text(errors="replace"))

    profile = payload.get("profile") or {}
    owners = profile.get("owners") or []

    owner_ids = [owner.get("owner_id") for owner in owners if owner.get("owner_id")]
    candidates = load_best_candidates(owner_ids)

    enriched_owners = []
    avatars = {}

    for owner in owners:
        owner_id = owner.get("owner_id") or ""
        candidate = candidates.get(owner_id)

        enriched = dict(owner)

        if candidate:
            enriched.update(candidate)

            avatar_id = candidate.get("avatar_id")
            if avatar_id:
                avatars[avatar_id] = {
                    "avatar_id": avatar_id,
                    "owner_id": owner_id,
                    "avatar_name": candidate.get("avatar_name") or "",
                    "avatar_portrait_url": candidate.get("avatar_portrait_url") or "",
                    "avatar_portrait_thumb_url": candidate.get("avatar_portrait_thumb_url") or "",
                    "avatar_portrait_snapshot_url": candidate.get("avatar_portrait_snapshot_url") or "",
                    "avatar_portrait_source": candidate.get("avatar_portrait_source") or "none",
                    "avatar_space_thumb_url": candidate.get("avatar_space_thumb_url") or "",
                    "avatar_space_snapshot_url": candidate.get("avatar_space_snapshot_url") or "",
                    "confidence": candidate.get("confidence"),
                    "identity_reason": candidate.get("identity_reason") or "",
                    "identity_source": candidate.get("identity_source") or "",
                }
        else:
            enriched.update({
                "avatar_id": "",
                "avatar_name": "",
                "avatar_portrait_url": "",
                "avatar_portrait_thumb_url": "",
                "avatar_portrait_snapshot_url": "",
                "avatar_portrait_source": "none",
                "avatar_space_thumb_url": "",
                "avatar_space_snapshot_url": "",
                "confidence": None,
                "identity_reason": "",
                "identity_source": "none",
            })

        enriched_owners.append(enriched)

    profile["owners"] = enriched_owners
    profile["avatars"] = list(avatars.values())

    technical = profile.setdefault("technical", {})
    technical["identity_db"] = str(IDENTITY_DB)
    technical["avatar_url_index"] = str(AVATAR_INDEX)
    technical["identity_resolver"] = "beacon_space_profile_identity_resolver/v2"
    technical["owners_enriched"] = sum(1 for owner in enriched_owners if owner.get("avatar_id"))
    technical["owners_unresolved"] = sum(1 for owner in enriched_owners if not owner.get("avatar_id"))
    technical["avatar_portraits_resolved"] = sum(
        1 for owner in enriched_owners
        if owner.get("avatar_portrait_url") or owner.get("avatar_portrait_thumb_url") or owner.get("avatar_portrait_snapshot_url")
    )
    technical["avatar_space_snapshots_known"] = sum(
        1 for owner in enriched_owners
        if owner.get("avatar_space_thumb_url") or owner.get("avatar_space_snapshot_url")
    )

    payload["profile"] = profile
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    return {
        "ok": True,
        "path": str(path),
        "owners": len(enriched_owners),
        "owners_enriched": technical["owners_enriched"],
        "owners_unresolved": technical["owners_unresolved"],
        "avatar_portraits_resolved": technical["avatar_portraits_resolved"],
        "avatar_space_snapshots_known": technical["avatar_space_snapshots_known"],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--space-id", required=True)
    parser.add_argument("--profile", default="")
    args = parser.parse_args()

    profile_path = Path(args.profile) if args.profile else WORKSPACE / f"beacon-space-profile-{args.space_id}.json"
    print(json.dumps(enrich_profile(profile_path), indent=2))


if __name__ == "__main__":
    main()
