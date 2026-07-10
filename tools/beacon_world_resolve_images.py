import json
import re
import shutil
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_WORKSPACE = Path("/opt/smallverse/workspace")
DEFAULT_WORLD = DEFAULT_WORKSPACE / "beacon-world-index.json"
DEFAULT_CAPTURE_WORLD = DEFAULT_WORKSPACE / "beacon-world-captures.json"
DEFAULT_POPULAR = Path("/opt/smallverse/popular-source/popular-spaces.json")

ID_KEYS = ["id", "spaceId", "spaceID", "space_id", "_id"]
NAME_KEYS = ["desc", "description", "name", "displayName", "spaceName", "space_name"]


def now_tag():
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def load(path, default):
    path = Path(path)
    if not path.exists():
        return default
    return json.loads(path.read_text(errors="replace"))


def dump(path, data):
    Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def norm(value):
    value = str(value or "").lower()
    value = value.replace("©", "")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def add_unique(values, value):
    if value and value not in values:
        values.append(value)


def first(row, keys):
    for key in keys:
        value = row.get(key)
        if value:
            return value
    return ""


def has_image(space):
    return bool(space.get("snapshot_url") or space.get("thumb_url"))


def best_snapshot(candidate):
    if candidate.get("snapshot_url"):
        return candidate["snapshot_url"]

    for url in candidate.get("image_urls") or []:
        low = str(url).lower()
        if "_snap" in low or "snapshot" in low:
            return url

    urls = candidate.get("image_urls") or []
    return urls[0] if urls else ""


def best_thumb(candidate):
    if candidate.get("thumb_url"):
        return candidate["thumb_url"]

    for url in candidate.get("image_urls") or []:
        low = str(url).lower()
        if "_thumb" in low or "thumbnail" in low:
            return url

    return ""


def merge_candidate(base, extra):
    out = dict(base or {})

    for key in ["space_id", "space_name", "description", "display_name", "snapshot_url", "thumb_url"]:
        if not out.get(key) and extra.get(key):
            out[key] = extra[key]

    image_urls = list(out.get("image_urls") or [])
    for url in extra.get("image_urls") or []:
        add_unique(image_urls, url)
    for url in [extra.get("snapshot_url"), extra.get("thumb_url")]:
        add_unique(image_urls, url)
    out["image_urls"] = image_urls

    sources = list(out.get("sources") or [])
    add_unique(sources, extra.get("source"))
    out["sources"] = sources

    return out


def index_candidate(candidate, by_id, by_name):
    sid = str(candidate.get("space_id") or "").strip()
    if sid:
        by_id[sid] = merge_candidate(by_id.get(sid), candidate)

    for key in ["display_name", "space_name", "description", "name"]:
        n = norm(candidate.get(key))
        if n:
            by_name[n] = merge_candidate(by_name.get(n), candidate)


def build_capture_indexes(captures):
    by_id = {}
    by_name = {}

    for raw in captures.get("spaces") or []:
        if not isinstance(raw, dict):
            continue

        candidate = {
            "source": "beacon-world-captures",
            "space_id": raw.get("space_id") or "",
            "space_name": raw.get("space_name") or "",
            "description": raw.get("description") or "",
            "display_name": raw.get("display_name") or "",
            "snapshot_url": raw.get("snapshot_url") or "",
            "thumb_url": raw.get("thumb_url") or "",
            "image_urls": raw.get("image_urls") or [],
        }
        index_candidate(candidate, by_id, by_name)

    image_urls_by_ref = defaultdict(list)
    for row in captures.get("space_images") or []:
        sid = row.get("referer_space_id") or ""
        url = row.get("url") or ""
        if sid and url:
            add_unique(image_urls_by_ref[sid], url)

    for sid, urls in image_urls_by_ref.items():
        candidate = {
            "source": "beacon-world-captures",
            "space_id": sid,
            "image_urls": urls,
        }
        index_candidate(candidate, by_id, by_name)

    return by_id, by_name


def build_popular_indexes(popular):
    by_id = {}
    by_name = {}

    for raw in popular.get("spaces") or []:
        if not isinstance(raw, dict):
            continue

        sid = first(raw, ID_KEYS)
        name = first(raw, NAME_KEYS)
        snapshot = raw.get("snapshotSource") or raw.get("snapshot_url") or raw.get("snapShot") or ""
        thumb = raw.get("thumbnailSource") or raw.get("thumb_url") or raw.get("thumb") or ""

        if not snapshot and not thumb:
            continue

        candidate = {
            "source": "popular-source",
            "space_id": sid,
            "space_name": name,
            "description": name,
            "display_name": name,
            "snapshot_url": snapshot,
            "thumb_url": thumb,
            "image_urls": [url for url in [snapshot, thumb] if url],
        }
        index_candidate(candidate, by_id, by_name)

    return by_id, by_name


def choose_candidate(space, source_indexes):
    sid = str(space.get("space_id") or "").strip()

    for source_name, by_id, _by_name in source_indexes:
        if sid and sid in by_id:
            return by_id[sid], source_name, "space_id"

    for source_name, _by_id, by_name in source_indexes:
        for key in ["display_name", "space_name", "description"]:
            n = norm(space.get(key))
            if n and n in by_name:
                return by_name[n], source_name, key

    return None, "none", "none"


def repair_space(space, source_indexes):
    out = dict(space)

    candidate, source_name, match = choose_candidate(out, source_indexes)

    if candidate:
        image_urls = list(out.get("image_urls") or [])
        for url in candidate.get("image_urls") or []:
            add_unique(image_urls, url)

        if not out.get("snapshot_url"):
            out["snapshot_url"] = best_snapshot(candidate)

        if not out.get("thumb_url"):
            out["thumb_url"] = best_thumb(candidate)

        out["image_urls"] = image_urls

        if has_image(out):
            out["image_source"] = source_name
            out["image_match"] = match
            out.pop("image_missing_reason", None)
        else:
            out["image_source"] = "none"
            out["image_match"] = "none"
            out["image_missing_reason"] = "image candidate found but no snapshot/thumb URL was present"
    else:
        out["image_urls"] = list(out.get("image_urls") or [])

        if has_image(out):
            out["image_source"] = out.get("image_source") or "preexisting"
            out["image_match"] = out.get("image_match") or "preexisting"
            out.pop("image_missing_reason", None)
        else:
            out["image_source"] = "none"
            out["image_match"] = "none"
            out["image_missing_reason"] = "no image mapping found in captures or popular-source"

    layers = list(out.get("source_layers") or [])
    if out.get("image_source") and out["image_source"] not in ("none", "preexisting"):
        add_unique(layers, f"{out['image_source']}-image")
    out["source_layers"] = layers

    return out


def all_section_spaces(world):
    for spaces in (world.get("sections") or {}).values():
        for space in spaces or []:
            yield space


def resolve_images(
    world_path=DEFAULT_WORLD,
    capture_world_path=DEFAULT_CAPTURE_WORLD,
    popular_path=DEFAULT_POPULAR,
    backup=True,
):
    world_path = Path(world_path)
    capture_world_path = Path(capture_world_path)
    popular_path = Path(popular_path)

    world = load(world_path, {})
    captures = load(capture_world_path, {})
    popular = load(popular_path, {})

    if backup and world_path.exists():
        backup_path = world_path.with_suffix(world_path.suffix + f".before-image-resolve-{now_tag()}")
        shutil.copy2(world_path, backup_path)
    else:
        backup_path = None

    capture_by_id, capture_by_name = build_capture_indexes(captures)
    popular_by_id, popular_by_name = build_popular_indexes(popular)

    source_indexes = [
        ("beacon-world-captures", capture_by_id, capture_by_name),
        ("popular-source", popular_by_id, popular_by_name),
    ]

    before_visible = list(all_section_spaces(world))
    before_with_image = sum(1 for s in before_visible if has_image(s))

    world["spaces"] = [
        repair_space(space, source_indexes)
        for space in world.get("spaces", [])
    ]

    if isinstance(world.get("sections"), dict):
        for section, spaces in list(world["sections"].items()):
            world["sections"][section] = [
                repair_space(space, source_indexes)
                for space in spaces or []
            ]

    after_visible = list(all_section_spaces(world))
    after_with_image = sum(1 for s in after_visible if has_image(s))

    world["image_resolver"] = {
        "generated_at": now_iso(),
        "sources": {
            "capture_world": str(capture_world_path),
            "popular_source": str(popular_path),
        },
        "backup": str(backup_path) if backup_path else "",
        "capture_spaces_indexed": len(capture_by_id),
        "popular_spaces_indexed": len(popular_by_id),
        "visible_with_image_before": before_with_image,
        "visible_with_image_after": after_with_image,
        "missing_visible_after": [
            {
                "name": s.get("display_name") or s.get("space_name") or s.get("description"),
                "space_id": s.get("space_id"),
                "reason": s.get("image_missing_reason"),
            }
            for s in after_visible
            if not has_image(s)
        ][:80],
    }

    dump(world_path, world)
    return world["image_resolver"]


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Resolve Beacon world space snapshot/thumb URLs from backend image metadata.")
    parser.add_argument("--world", default=str(DEFAULT_WORLD))
    parser.add_argument("--capture-world", default=str(DEFAULT_CAPTURE_WORLD))
    parser.add_argument("--popular-source", default=str(DEFAULT_POPULAR))
    parser.add_argument("--no-backup", action="store_true")
    args = parser.parse_args()

    result = resolve_images(
        world_path=args.world,
        capture_world_path=args.capture_world,
        popular_path=args.popular_source,
        backup=not args.no_backup,
    )

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
