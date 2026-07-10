import argparse
import base64
import json
import sqlite3
from pathlib import Path

WORKSPACE = Path("/opt/smallverse/workspace")
IDENTITY_DB = WORKSPACE / "identity.sqlite"
ITEM_PROFILES = WORKSPACE / "beacon-item-profiles.json"

VARIANT_PRIORITY = {
    "thumb": 0,
    "head": 1,
    "snapshot": 2,
}


def load_json(path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(errors="replace"))


def full_name(first, last):
    return " ".join(part for part in [first or "", last or ""] if part).strip()


def placeholders(count):
    return ",".join("?" for _ in range(count))


def load_avatar_assets(con, avatar_ids):
    avatar_ids = [aid for aid in dict.fromkeys(avatar_ids) if aid]

    if not avatar_ids:
        return {}

    try:
        rows = con.execute(
            f"""
            SELECT
              avatar_id,
              variant,
              asset_hash,
              url,
              http_status,
              content_type,
              is_verified_image,
              source,
              first_seen,
              last_seen
            FROM avatar_assets
            WHERE avatar_id IN ({placeholders(len(avatar_ids))})
            ORDER BY
              avatar_id,
              is_verified_image DESC,
              CASE variant
                WHEN 'thumb' THEN 0
                WHEN 'head' THEN 1
                WHEN 'snapshot' THEN 2
                ELSE 9
              END ASC,
              last_seen DESC
            """,
            avatar_ids,
        ).fetchall()
    except sqlite3.OperationalError:
        rows = []

    grouped = {aid: [] for aid in avatar_ids}

    for row in rows:
        grouped.setdefault(row["avatar_id"], []).append({
            "avatar_id": row["avatar_id"] or "",
            "variant": row["variant"] or "",
            "asset_hash": row["asset_hash"] or "",
            "url": row["url"] or "",
            "http_status": row["http_status"] or 0,
            "content_type": row["content_type"] or "",
            "is_verified_image": bool(row["is_verified_image"]),
            "source": row["source"] or "",
            "first_seen": row["first_seen"] or "",
            "last_seen": row["last_seen"] or "",
        })

    return grouped


def portrait_for_assets(assets):
    verified = [a for a in assets if a.get("is_verified_image")]

    def sort_key(asset):
        return (
            VARIANT_PRIORITY.get(asset.get("variant"), 9),
            asset.get("last_seen") or "",
        )

    verified = sorted(verified, key=sort_key)

    chosen = verified[0] if verified else None

    if chosen:
        return {
            "avatar_portrait_url": chosen["url"] if chosen["variant"] == "head" else "",
            "avatar_portrait_thumb_url": chosen["url"] if chosen["variant"] == "thumb" else "",
            "avatar_portrait_snapshot_url": chosen["url"] if chosen["variant"] == "snapshot" else "",
            "avatar_portrait_source": "identity.avatar_assets",
            "avatar_portrait_status": "verified",
            "avatar_asset_hash": chosen["asset_hash"],
            "avatar_asset_variant": chosen["variant"],
            "avatar_assets": assets,
        }

    references = sorted(assets, key=sort_key)

    ref = references[0] if references else {}

    return {
        "avatar_portrait_url": "",
        "avatar_portrait_thumb_url": "",
        "avatar_portrait_snapshot_url": "",
        "avatar_portrait_source": "none",
        "avatar_portrait_status": "captured_reference_unverified" if references else "missing",
        "avatar_portrait_reference_url": ref.get("url") or "",
        "avatar_asset_hash": ref.get("asset_hash") or "",
        "avatar_asset_variant": ref.get("variant") or "",
        "avatar_assets": assets,
    }


def load_owner_identity(owner_ids):
    owner_ids = [oid for oid in dict.fromkeys(owner_ids) if oid]

    if not owner_ids:
        return {}

    con = sqlite3.connect(IDENTITY_DB)
    con.row_factory = sqlite3.Row

    candidate_rows = con.execute(
        f"""
        SELECT
          c.owner_id,
          c.avatar_id,
          c.first_name,
          c.last_name,
          c.confidence,
          c.reason,
          c.origin,
          c.evidence_count,
          c.first_seen,
          c.last_seen,
          a.thumb_url AS avatar_space_thumb_url,
          a.snapshot_url AS avatar_space_snapshot_url,
          a.current_space_id,
          a.home_space_id
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

    avatar_ids = [row["avatar_id"] for row in candidate_rows if row["avatar_id"]]
    assets_by_avatar = load_avatar_assets(con, avatar_ids)
    con.close()

    grouped = {oid: [] for oid in owner_ids}

    for row in candidate_rows:
        avatar_id = row["avatar_id"] or ""
        assets = assets_by_avatar.get(avatar_id) or []
        portrait = portrait_for_assets(assets)

        grouped.setdefault(row["owner_id"], []).append({
            "avatar_id": avatar_id,
            "avatar_name": full_name(row["first_name"], row["last_name"]),
            "avatar_first_name": row["first_name"] or "",
            "avatar_last_name": row["last_name"] or "",
            "confidence": row["confidence"],
            "identity_reason": row["reason"] or "",
            "identity_origin": row["origin"] or "",
            "identity_evidence_count": row["evidence_count"] or 0,
            "identity_first_seen": row["first_seen"] or "",
            "identity_last_seen": row["last_seen"] or "",
            "avatar_space_thumb_url": row["avatar_space_thumb_url"] or "",
            "avatar_space_snapshot_url": row["avatar_space_snapshot_url"] or "",
            "current_space_id": row["current_space_id"] or "",
            "home_space_id": row["home_space_id"] or "",
            **portrait,
        })

    out = {}

    for owner_id, candidates in grouped.items():
        primary = candidates[0] if candidates else None

        display = next(
            (
                c for c in candidates
                if c.get("avatar_portrait_thumb_url")
                or c.get("avatar_portrait_url")
                or c.get("avatar_portrait_snapshot_url")
            ),
            primary,
        )

        out[owner_id] = {
            "owner_id": owner_id,
            "avatar_candidates": candidates,
            "avatar_candidate_count": len(candidates),
            "primary_avatar_id": primary.get("avatar_id") if primary else "",
            "primary_avatar_name": primary.get("avatar_name") if primary else "",
            "display_avatar_id": display.get("avatar_id") if display else "",
            "display_avatar_name": display.get("avatar_name") if display else "",
            "identity_source": "identity.sqlite.owner_avatar_candidates+avatar_assets" if candidates else "none",
            "display": display or {},
        }

    return out


def enrich_owner(owner, identities):
    out = dict(owner or {})
    owner_id = out.get("owner_id") or ""
    ident = identities.get(owner_id) or {}
    display = ident.get("display") or {}

    out["avatar_candidates"] = ident.get("avatar_candidates") or []
    out["avatar_candidate_count"] = ident.get("avatar_candidate_count") or 0

    out["primary_avatar_id"] = ident.get("primary_avatar_id") or out.get("avatar_id") or ""
    out["primary_avatar_name"] = ident.get("primary_avatar_name") or out.get("avatar_name") or ""

    out["display_avatar_id"] = ident.get("display_avatar_id") or out.get("avatar_id") or ""
    out["display_avatar_name"] = ident.get("display_avatar_name") or out.get("avatar_name") or ""

    out["avatar_portrait_url"] = display.get("avatar_portrait_url") or ""
    out["avatar_portrait_thumb_url"] = display.get("avatar_portrait_thumb_url") or ""
    out["avatar_portrait_snapshot_url"] = display.get("avatar_portrait_snapshot_url") or ""
    out["avatar_portrait_source"] = display.get("avatar_portrait_source") or "none"
    out["avatar_portrait_status"] = display.get("avatar_portrait_status") or "missing"
    out["avatar_portrait_reference_url"] = display.get("avatar_portrait_reference_url") or ""

    out["avatar_asset_hash"] = display.get("avatar_asset_hash") or ""
    out["avatar_asset_variant"] = display.get("avatar_asset_variant") or ""

    out["identity_source"] = ident.get("identity_source") or "none"

    return out


def enrich_payload(payload):
    profile = payload.get("profile") if isinstance(payload.get("profile"), dict) else payload
    owners = profile.get("owners") or []

    owner_ids = [owner.get("owner_id") for owner in owners if owner.get("owner_id")]
    identities = load_owner_identity(owner_ids)

    enriched_owners = [enrich_owner(owner, identities) for owner in owners]
    profile["owners"] = enriched_owners

    avatars = {}

    for owner in enriched_owners:
        for cand in owner.get("avatar_candidates") or []:
            aid = cand.get("avatar_id")
            if not aid:
                continue

            avatars[aid] = {
                "avatar_id": aid,
                "owner_id": owner.get("owner_id") or "",
                "avatar_name": cand.get("avatar_name") or "",
                "confidence": cand.get("confidence"),
                "avatar_portrait_url": cand.get("avatar_portrait_url") or "",
                "avatar_portrait_thumb_url": cand.get("avatar_portrait_thumb_url") or "",
                "avatar_portrait_snapshot_url": cand.get("avatar_portrait_snapshot_url") or "",
                "avatar_portrait_source": cand.get("avatar_portrait_source") or "none",
                "avatar_portrait_status": cand.get("avatar_portrait_status") or "missing",
                "avatar_asset_hash": cand.get("avatar_asset_hash") or "",
                "avatar_asset_variant": cand.get("avatar_asset_variant") or "",
                "asset_count": len(cand.get("avatar_assets") or []),
            }

    profile["avatars"] = list(avatars.values())

    technical = dict(profile.get("technical") or {})
    technical["identity_resolver"] = "beacon_owner_identity_profile/v2"
    technical["identity_db"] = str(IDENTITY_DB)
    technical["avatar_asset_table"] = "identity.sqlite.avatar_assets"
    technical["owners_enriched"] = sum(1 for owner in enriched_owners if owner.get("avatar_candidate_count", 0) > 0)
    technical["owners_unresolved"] = sum(1 for owner in enriched_owners if owner.get("avatar_candidate_count", 0) == 0)
    technical["avatar_candidates_total"] = sum(owner.get("avatar_candidate_count", 0) for owner in enriched_owners)
    technical["avatar_portraits_resolved"] = sum(
        1 for owner in enriched_owners
        if owner.get("avatar_portrait_url")
        or owner.get("avatar_portrait_thumb_url")
        or owner.get("avatar_portrait_snapshot_url")
    )

    profile["technical"] = technical

    if isinstance(payload.get("profile"), dict):
        payload["profile"] = profile
    else:
        payload = profile

    return payload


def decode_b64(value):
    return base64.b64decode(value).decode("utf-8")


def resolve_item_profile(source_xml):
    cache = load_json(ITEM_PROFILES, {})
    profiles = cache.get("profiles") or {}

    payload = profiles.get(source_xml)
    tried = [source_xml]

    if not payload:
        candidates = []

        if source_xml.endswith(".xml") and not source_xml.endswith("_item.xml"):
            candidates.append(source_xml[:-4] + "_item.xml")

        if "_icon_" in source_xml:
            base = source_xml.split("_icon_", 1)[0]
            candidates.append(base + "_item.xml")
            candidates.append(base + ".xml")

        for candidate in candidates:
            tried.append(candidate)
            payload = profiles.get(candidate)

            if payload:
                source_xml = candidate
                break

    if not payload:
        return {
            "ok": False,
            "error": "profile not found",
            "source_xml": source_xml,
            "tried": tried,
            "cache_generated_at": cache.get("generated_at"),
            "cache_counts": cache.get("counts"),
        }

    payload = enrich_payload(dict(payload))
    payload["cache_generated_at"] = cache.get("generated_at")
    payload["cache_counts"] = cache.get("counts")
    return payload


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", default="")
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--source-xml-b64", default="")
    parser.add_argument("--owner-id", default="")
    args = parser.parse_args()

    if args.owner_id:
        identity = load_owner_identity([args.owner_id]).get(args.owner_id)
        print(json.dumps(identity or {"owner_id": args.owner_id, "avatar_candidates": []}, indent=2, ensure_ascii=False))
        return

    if args.source_xml_b64:
        source_xml = decode_b64(args.source_xml_b64)
        print(json.dumps(resolve_item_profile(source_xml), ensure_ascii=False, default=str))
        return

    if args.profile:
        path = Path(args.profile)
        payload = load_json(path, {})
        payload = enrich_payload(payload)

        if args.write:
            path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

        print(json.dumps(payload, ensure_ascii=False, default=str))
        return

    raise SystemExit("Need --owner-id, --profile, or --source-xml-b64")


if __name__ == "__main__":
    main()
