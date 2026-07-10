import argparse
import json
import re
import shutil
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


def now_tag():
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def norm(value):
    value = str(value or "").lower()
    value = value.replace("©", "")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def compact(value):
    return norm(value).replace(" ", "")


def load(path):
    return json.loads(Path(path).read_text(errors="replace"))


def dump(path, payload):
    Path(path).write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def add_unique(list_value, value):
    if value and value not in list_value:
        list_value.append(value)


def merge_candidate(base, extra):
    out = dict(base or {})

    for key in ["space_id", "space_name", "description", "snapshot_url", "thumb_url"]:
        if not out.get(key) and extra.get(key):
            out[key] = extra[key]

    for key in ["image_urls", "source_files", "page_urls"]:
        values = list(out.get(key) or [])
        for value in extra.get(key) or []:
            add_unique(values, value)
        out[key] = values

    return out


def best_snapshot(candidate):
    if candidate.get("snapshot_url"):
        return candidate["snapshot_url"]

    urls = candidate.get("image_urls") or []
    for url in urls:
        low = url.lower()
        if "_snap" in low or "snapshot" in low:
            return url

    return urls[0] if urls else ""


def best_thumb(candidate):
    if candidate.get("thumb_url"):
        return candidate["thumb_url"]

    urls = candidate.get("image_urls") or []
    for url in urls:
        low = url.lower()
        if "_thumb" in low or "thumbnail" in low:
            return url

    return ""


def build_indexes(captures):
    by_id = {}
    by_name = defaultdict(list)
    by_compact = defaultdict(list)

    def add_candidate(candidate):
        sid = str(candidate.get("space_id") or "").strip()
        names = [
            candidate.get("space_name"),
            candidate.get("description"),
            candidate.get("display_name"),
        ]

        if sid:
            by_id[sid] = merge_candidate(by_id.get(sid), candidate)

        for name in names:
            n = norm(name)
            c = compact(name)
            if n:
                by_name[n].append(candidate)
            if c:
                by_compact[c].append(candidate)

    for raw in captures.get("spaces") or []:
        candidate = {
            "space_id": raw.get("space_id") or "",
            "space_name": raw.get("space_name") or "",
            "description": raw.get("description") or "",
            "snapshot_url": raw.get("snapshot_url") or "",
            "thumb_url": raw.get("thumb_url") or "",
            "image_urls": raw.get("image_urls") or [],
            "source_files": raw.get("source_files") or [],
            "page_urls": raw.get("page_urls") or [],
        }
        add_candidate(candidate)

    image_urls_by_ref = defaultdict(list)
    for row in captures.get("space_images") or []:
        sid = row.get("referer_space_id") or ""
        url = row.get("url") or ""
        if sid and url:
            add_unique(image_urls_by_ref[sid], url)

    for sid, urls in image_urls_by_ref.items():
        candidate = {
            "space_id": sid,
            "image_urls": urls,
            "source_files": ["space_images.referer_space_id"],
            "page_urls": [],
            "snapshot_url": "",
            "thumb_url": "",
            "space_name": "",
            "description": "",
        }
        add_candidate(candidate)

    return by_id, by_name, by_compact


def choose_candidate(space, by_id, by_name, by_compact):
    sid = str(space.get("space_id") or "").strip()
    if sid and sid in by_id:
        return by_id[sid], "space_id"

    names = [
        space.get("display_name"),
        space.get("space_name"),
        space.get("description"),
    ]

    for name in names:
        n = norm(name)
        if n and by_name.get(n):
            return by_name[n][0], "normalized_name"

    for name in names:
        c = compact(name)
        if c and by_compact.get(c):
            return by_compact[c][0], "compact_name"

    return None, "none"


def repair_space(space, by_id, by_name, by_compact):
    out = dict(space)
    candidate, match = choose_candidate(out, by_id, by_name, by_compact)

    current_urls = list(out.get("image_urls") or [])
    for url in [out.get("snapshot_url"), out.get("thumb_url")]:
        add_unique(current_urls, url)

    if candidate:
        candidate_urls = list(candidate.get("image_urls") or [])
        for url in [candidate.get("snapshot_url"), candidate.get("thumb_url")]:
            add_unique(candidate_urls, url)

        if not out.get("snapshot_url"):
            out["snapshot_url"] = best_snapshot(candidate)

        if not out.get("thumb_url"):
            out["thumb_url"] = best_thumb(candidate)

        for url in candidate_urls:
            add_unique(current_urls, url)

        out["image_urls"] = current_urls
        out["image_source"] = "beacon-world-captures"
        out["image_match"] = match

        layers = list(out.get("source_layers") or [])
        add_unique(layers, "space-image-capture")
        out["source_layers"] = layers
    else:
        out["image_urls"] = current_urls
        out["image_source"] = out.get("image_source") or "none"
        out["image_match"] = out.get("image_match") or "none"
        if not out.get("snapshot_url") and not out.get("thumb_url"):
            out["image_missing_reason"] = "no capture image mapping found by space_id or normalized name"

    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--world", default="/opt/smallverse/workspace/beacon-world-index.json")
    parser.add_argument("--captures", default="/opt/smallverse/workspace/beacon-world-captures.json")
    args = parser.parse_args()

    world_path = Path(args.world)
    captures_path = Path(args.captures)

    world = load(world_path)
    captures = load(captures_path)

    backup = world_path.with_suffix(world_path.suffix + f".before-image-resolve-{now_tag()}")
    shutil.copy2(world_path, backup)

    by_id, by_name, by_compact = build_indexes(captures)

    def has_png(space):
        return bool(space.get("snapshot_url") or space.get("thumb_url"))

    before_visible = [
        s for section in (world.get("sections") or {}).values()
        for s in section
    ]
    before_with_png = sum(1 for s in before_visible if has_png(s))

    world["spaces"] = [
        repair_space(space, by_id, by_name, by_compact)
        for space in world.get("spaces") or []
    ]

    if isinstance(world.get("sections"), dict):
        for key, spaces in list(world["sections"].items()):
            world["sections"][key] = [
                repair_space(space, by_id, by_name, by_compact)
                for space in spaces
            ]

    after_visible = [
        s for section in (world.get("sections") or {}).values()
        for s in section
    ]
    after_with_png = sum(1 for s in after_visible if has_png(s))

    world["image_resolver"] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": str(captures_path),
        "backup": str(backup),
        "capture_spaces": len(captures.get("spaces") or []),
        "capture_space_images": len(captures.get("space_images") or []),
        "visible_with_png_before": before_with_png,
        "visible_with_png_after": after_with_png,
    }

    dump(world_path, world)

    print(json.dumps(world["image_resolver"], indent=2))


if __name__ == "__main__":
    main()
