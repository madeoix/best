import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

WORLD = Path("/opt/smallverse/workspace/beacon-world-index.json")
POPULAR = Path("/opt/smallverse/popular-source/popular-spaces.json")

IMAGE_KEYS = [
    "snapshotSource",
    "thumbnailSource",
    "snapshot_url",
    "thumb_url",
    "snapShot",
    "thumb",
    "image",
]

ID_KEYS = [
    "id",
    "spaceId",
    "spaceID",
    "space_id",
    "_id",
]

NAME_KEYS = [
    "desc",
    "description",
    "name",
    "displayName",
    "spaceName",
    "space_name",
]


def now_tag():
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def load(path):
    return json.loads(path.read_text(errors="replace"))


def dump(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def norm(value):
    return " ".join(str(value or "").lower().split())


def get_first(row, keys):
    for key in keys:
        value = row.get(key)
        if value:
            return value
    return ""


def add_unique(values, value):
    if value and value not in values:
        values.append(value)


def build_popular_indexes(popular):
    by_id = {}
    by_name = {}

    for row in popular.get("spaces", []):
        if not isinstance(row, dict):
            continue

        space_id = get_first(row, ID_KEYS)
        name = get_first(row, NAME_KEYS)

        snapshot = row.get("snapshotSource") or row.get("snapshot_url") or row.get("snapShot") or ""
        thumb = row.get("thumbnailSource") or row.get("thumb_url") or row.get("thumb") or ""

        if not snapshot and not thumb:
            continue

        candidate = {
            "space_id": space_id,
            "name": name,
            "snapshot_url": snapshot,
            "thumb_url": thumb,
            "raw": row,
        }

        if space_id:
            by_id[str(space_id)] = candidate

        if name:
            by_name[norm(name)] = candidate

    return by_id, by_name


def repair_space(space, by_id, by_name):
    out = dict(space)

    candidate = None
    match = "none"

    sid = str(out.get("space_id") or "")
    if sid and sid in by_id:
        candidate = by_id[sid]
        match = "space_id"
    else:
        for key in ["display_name", "space_name", "description"]:
            n = norm(out.get(key))
            if n and n in by_name:
                candidate = by_name[n]
                match = key
                break

    if not candidate:
        return out

    changed = False

    if not out.get("snapshot_url") and candidate.get("snapshot_url"):
        out["snapshot_url"] = candidate["snapshot_url"]
        changed = True

    if not out.get("thumb_url") and candidate.get("thumb_url"):
        out["thumb_url"] = candidate["thumb_url"]
        changed = True

    image_urls = list(out.get("image_urls") or [])
    add_unique(image_urls, candidate.get("snapshot_url"))
    add_unique(image_urls, candidate.get("thumb_url"))
    out["image_urls"] = image_urls

    if changed:
        out["image_source"] = "popular-source"
        out["image_match"] = match
        out.pop("image_missing_reason", None)
    elif out.get("snapshot_url") or out.get("thumb_url"):
        out["image_source"] = out.get("image_source") or "popular-source"
        out["image_match"] = out.get("image_match") or match

    layers = list(out.get("source_layers") or [])
    add_unique(layers, "popular-source-image")
    out["source_layers"] = layers

    return out


def has_image(space):
    return bool(space.get("snapshot_url") or space.get("thumb_url"))


def main():
    world = load(WORLD)
    popular = load(POPULAR)

    backup = WORLD.with_suffix(WORLD.suffix + f".before-popular-image-resolve-{now_tag()}")
    shutil.copy2(WORLD, backup)

    by_id, by_name = build_popular_indexes(popular)

    before_missing_market = [
        s.get("display_name") or s.get("space_name")
        for s in world.get("sections", {}).get("market", [])
        if not has_image(s)
    ]

    world["spaces"] = [
        repair_space(space, by_id, by_name)
        for space in world.get("spaces", [])
    ]

    if isinstance(world.get("sections"), dict):
        for section, spaces in list(world["sections"].items()):
            world["sections"][section] = [
                repair_space(space, by_id, by_name)
                for space in spaces
            ]

    after_missing_market = [
        s.get("display_name") or s.get("space_name")
        for s in world.get("sections", {}).get("market", [])
        if not has_image(s)
    ]

    world["popular_image_resolver"] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": str(POPULAR),
        "backup": str(backup),
        "popular_spaces_indexed_by_id": len(by_id),
        "popular_spaces_indexed_by_name": len(by_name),
        "market_missing_before": before_missing_market,
        "market_missing_after": after_missing_market,
    }

    dump(WORLD, world)

    print(json.dumps(world["popular_image_resolver"], indent=2))


if __name__ == "__main__":
    main()
