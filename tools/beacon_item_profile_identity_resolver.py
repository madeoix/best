import argparse
import base64
import json
from pathlib import Path

WORKSPACE = Path("/opt/smallverse/workspace")
ITEM_PROFILES = WORKSPACE / "beacon-item-profiles.json"
AVATAR_INDEX = WORKSPACE / "avatar-url-index.json"


def load_json(path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(errors="replace"))


def decode_source(args):
    if args.source_xml_b64:
        return base64.b64decode(args.source_xml_b64).decode("utf-8")
    return args.source_xml or ""


def avatar_portrait_fields(avatar_id, avatar_index):
    rec = (avatar_index.get("by_avatar_id") or {}).get(avatar_id or "") or {}

    has_portrait = bool(rec.get("head_url") or rec.get("thumb_url") or rec.get("snapshot_url"))

    return {
        "avatar_portrait_url": rec.get("head_url") or "",
        "avatar_portrait_thumb_url": rec.get("thumb_url") or "",
        "avatar_portrait_snapshot_url": rec.get("snapshot_url") or "",
        "avatar_portrait_source": "avatar-url-index.saz" if has_portrait else "none",
    }


def enrich_owner(owner, avatar_index):
    out = dict(owner or {})
    out.update(avatar_portrait_fields(out.get("avatar_id"), avatar_index))
    return out


def enrich_profile(profile, avatar_index):
    out = dict(profile or {})

    owners = [enrich_owner(owner, avatar_index) for owner in out.get("owners") or []]
    latest = [enrich_owner(row, avatar_index) for row in out.get("latest") or []]

    avatars = {}
    for owner in owners:
        avatar_id = owner.get("avatar_id")
        if not avatar_id:
            continue
        avatars[avatar_id] = {
            "avatar_id": avatar_id,
            "owner_id": owner.get("owner_id") or "",
            "avatar_name": owner.get("avatar_name") or "",
            "avatar_portrait_url": owner.get("avatar_portrait_url") or "",
            "avatar_portrait_thumb_url": owner.get("avatar_portrait_thumb_url") or "",
            "avatar_portrait_snapshot_url": owner.get("avatar_portrait_snapshot_url") or "",
            "avatar_portrait_source": owner.get("avatar_portrait_source") or "none",
            "confidence": owner.get("confidence"),
            "identity_reason": owner.get("identity_reason") or "",
        }

    out["owners"] = owners
    out["latest"] = latest
    out["avatars"] = list(avatars.values())

    technical = dict(out.get("technical") or {})
    technical["avatar_url_index"] = str(AVATAR_INDEX)
    technical["identity_resolver"] = "beacon_item_profile_identity_resolver/v1"
    technical["avatar_portraits_resolved"] = sum(
        1 for owner in owners
        if owner.get("avatar_portrait_url")
        or owner.get("avatar_portrait_thumb_url")
        or owner.get("avatar_portrait_snapshot_url")
    )
    out["technical"] = technical

    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-xml", default="")
    parser.add_argument("--source-xml-b64", default="")
    args = parser.parse_args()

    source_xml = decode_source(args).strip()

    cache = load_json(ITEM_PROFILES, {})
    avatar_index = load_json(AVATAR_INDEX, {})

    profile = (cache.get("profiles") or {}).get(source_xml)

    if not profile:
        print(json.dumps({
            "ok": False,
            "error": "profile not found",
            "source_xml": source_xml,
            "cache_generated_at": cache.get("generated_at"),
            "cache_counts": cache.get("counts"),
        }))
        return

    enriched = enrich_profile(profile, avatar_index)
    enriched["cache_generated_at"] = cache.get("generated_at")
    enriched["cache_counts"] = cache.get("counts")

    print(json.dumps(enriched, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
