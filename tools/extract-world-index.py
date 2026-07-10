#!/usr/bin/env python3
import argparse
import io
import json
import re
import sys
import tarfile
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

SPACE_RE = re.compile(r"/space/([a-f0-9]{24,40}|[A-Za-z0-9_-]+)", re.I)
AVATAR_API_RE = re.compile(r"/api/avatar/([a-f0-9]{24,40})", re.I)
ITEM_ASSET_RE = re.compile(r"/assets/(items/[^?\s]+?\.xml)", re.I)

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def decode_headers(raw):
    if not raw:
        return {}, b""

    splitters = [b"\r\n\r\n", b"\n\n"]

    for splitter in splitters:
        if splitter in raw:
            head, body = raw.split(splitter, 1)
            break
    else:
        return {}, raw

    lines = head.decode("latin1", errors="ignore").splitlines()
    headers = {}

    for line in lines[1:]:
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        headers[k.strip().lower()] = v.strip()

    return headers, body

def decode_chunked(body):
    out = bytearray()
    i = 0

    while i < len(body):
        j = body.find(b"\r\n", i)
        if j < 0:
            break

        size_line = body[i:j].split(b";", 1)[0].strip()

        try:
            size = int(size_line, 16)
        except ValueError:
            return body

        i = j + 2

        if size == 0:
            break

        out.extend(body[i:i + size])
        i += size + 2

    return bytes(out) if out else body

def response_body(raw):
    headers, body = decode_headers(raw)

    if "chunked" in headers.get("transfer-encoding", "").lower():
        body = decode_chunked(body)

    return headers, body

def read_text(raw):
    return raw.decode("utf-8", errors="ignore")

def request_url_and_headers(raw):
    text = raw.decode("latin1", errors="ignore")
    lines = text.splitlines()

    if not lines:
        return "", {}

    parts = lines[0].split()
    url = parts[1] if len(parts) >= 2 else ""

    headers = {}
    for line in lines[1:]:
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        headers[k.strip().lower()] = v.strip()

    return url, headers

def iter_saz_files(input_path):
    path = Path(input_path)

    if path.is_dir():
      for item in path.rglob("*.saz"):
          yield item.name, item.read_bytes()
      return

    if path.suffix.lower() == ".saz":
        yield path.name, path.read_bytes()
        return

    if path.suffixes[-2:] == [".tar", ".gz"] or path.suffix.lower() in {".tgz", ".gz"}:
        with tarfile.open(path, "r:*") as tar:
            for member in tar.getmembers():
                if member.isfile() and member.name.lower().endswith(".saz"):
                    f = tar.extractfile(member)
                    if not f:
                        continue
                    yield member.name, f.read()
        return

    raise SystemExit(f"Unsupported input: {path}")

def put_space(spaces, space_id, **fields):
    if not space_id:
        return None

    space = spaces.setdefault(space_id, {
        "space_id": space_id,
        "space_name": "",
        "description": "",
        "snapshot_url": "",
        "thumb_url": "",
        "model_id": "",
        "visitors": None,
        "source_files": [],
        "page_urls": [],
        "image_urls": [],
        "item_source_xmls": [],
        "avatar_ids": [],
        "sale_like": False
    })

    for key, value in fields.items():
        if value in (None, ""):
            continue

        if key in {"source_files", "page_urls", "image_urls", "item_source_xmls", "avatar_ids"}:
            values = value if isinstance(value, list) else [value]
            for next_value in values:
                if next_value and next_value not in space[key]:
                    space[key].append(next_value)
        elif not space.get(key):
            space[key] = value

    text = f"{space.get('space_name','')} {space.get('description','')}".lower()
    if any(word in text for word in ["market", "flea", "sale", "shop", "wares", "wears", "trade", "trading", "auction"]):
        space["sale_like"] = True

    return space

def parse_space_html(body_text):
    # Smallverse space pages put useful details inside flashvars config XML.
    out = {}

    block = re.search(r"<space>\s*(.*?)\s*</space>", body_text, re.I | re.S)
    if not block:
        return out

    xml = block.group(1)

    def tag(name):
        m = re.search(rf"<{name}>(.*?)</{name}>", xml, re.I | re.S)
        return re.sub(r"\s+", " ", m.group(1)).strip() if m else ""

    out["space_id"] = tag("id")
    out["space_name"] = tag("name")
    out["model_id"] = tag("modelId")
    out["snapshot_url"] = tag("snapshotFile")

    return out

def parse_json_maybe(body):
    text = read_text(body).strip()

    # Fiddler sometimes preserves chunk size lines badly; locate JSON start.
    starts = [text.find("{"), text.find("[")]
    starts = [x for x in starts if x >= 0]
    if starts:
        text = text[min(starts):]

    try:
        return json.loads(text)
    except Exception:
        return None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input", help="SAZ file, directory of SAZ files, or tar.gz containing SAZ files")
    parser.add_argument("--out", default="static/beacon-world-index.json")
    args = parser.parse_args()

    spaces = {}
    avatars = {}
    item_appearances = []
    space_images = []
    request_counts = defaultdict(int)

    for saz_name, saz_bytes in iter_saz_files(args.input):
        try:
            z = zipfile.ZipFile(io.BytesIO(saz_bytes))
        except Exception as exc:
            print(f"skip {saz_name}: {exc}", file=sys.stderr)
            continue

        names = set(z.namelist())

        for name in z.namelist():
            if not name.endswith("_c.txt"):
                continue

            s_name = name.replace("_c.txt", "_s.txt")
            if s_name not in names:
                continue

            req_raw = z.read(name)
            res_raw = z.read(s_name)

            url, req_headers = request_url_and_headers(req_raw)
            if not url.startswith("http"):
                continue

            parsed = urlparse(url)
            request_counts[parsed.netloc] += 1

            res_headers, body = response_body(res_raw)
            body_text = read_text(body[:5_000_000])
            referer = req_headers.get("referer", "")

            ref_space = ""
            m_ref = SPACE_RE.search(referer)
            if m_ref:
                ref_space = m_ref.group(1)

            # Space page HTML.
            if "www.smallverse.app" in parsed.netloc and "/space/" in parsed.path:
                m = SPACE_RE.search(parsed.path)
                url_space_id = m.group(1) if m else ""

                parsed_space = parse_space_html(body_text)
                space_id = parsed_space.get("space_id") or url_space_id

                put_space(
                    spaces,
                    space_id,
                    space_name=parsed_space.get("space_name", ""),
                    model_id=parsed_space.get("model_id", ""),
                    snapshot_url=parsed_space.get("snapshot_url", ""),
                    source_files=saz_name,
                    page_urls=url
                )

            # API popular spaces.
            if "api.smallverse.app" in parsed.netloc and parsed.path.endswith("/api/space/popular"):
                data = parse_json_maybe(body)

                if isinstance(data, list):
                    for row in data:
                        if not isinstance(row, dict):
                            continue

                        put_space(
                            spaces,
                            row.get("spaceId"),
                            description=row.get("desc", ""),
                            thumb_url=row.get("snapShot", ""),
                            visitors=row.get("visitors"),
                            source_files=saz_name
                        )

            # Avatar API.
            m_avatar = AVATAR_API_RE.search(parsed.path)
            if "api.smallverse.app" in parsed.netloc and m_avatar:
                avatar_id = m_avatar.group(1)
                data = parse_json_maybe(body)

                if isinstance(data, dict):
                    avatars[avatar_id] = {
                        "avatar_id": avatar_id,
                        "username": data.get("name", ""),
                        "first_name": data.get("firstName", ""),
                        "last_name": data.get("lastName", ""),
                        "avatar_name": data.get("fullName", "") or " ".join(
                            x for x in [data.get("firstName", ""), data.get("lastName", "")] if x
                        ),
                        "gender": data.get("gender", ""),
                        "citizen_title": data.get("citizenTitle", ""),
                        "citizen_theme": data.get("citizenTheme", ""),
                        "pet_snapshot_url": (data.get("pet") or {}).get("snapUrl", ""),
                        "source_files": [saz_name]
                    }

            # Space snapshots/images.
            if "content.smallverse.app" in parsed.netloc and (
                "/uploads/spaces/" in parsed.path or "/images/space/" in parsed.path
            ):
                record = {
                    "url": url,
                    "referer_space_id": ref_space,
                    "content_type": res_headers.get("content-type", ""),
                    "source_file": saz_name
                }
                space_images.append(record)

                if ref_space:
                    put_space(spaces, ref_space, image_urls=url, source_files=saz_name)

            # Items loaded while a space page is active.
            m_item = ITEM_ASSET_RE.search(parsed.path)
            if "content.smallverse.app" in parsed.netloc and m_item:
                source_xml = m_item.group(1)

                if ref_space:
                    put_space(spaces, ref_space, item_source_xmls=source_xml, source_files=saz_name)

                    item_appearances.append({
                        "space_id": ref_space,
                        "source_xml": source_xml,
                        "url": url,
                        "referer": referer,
                        "source_file": saz_name,
                        "sale_like": any(word in url.lower() for word in ["sale", "shop", "market", "auction"])
                    })

    # Derived fields.
    for space in spaces.values():
        space["item_count"] = len(space.get("item_source_xmls", []))
        space["avatar_count"] = len(space.get("avatar_ids", []))
        if not space.get("snapshot_url") and space.get("image_urls"):
            space["snapshot_url"] = space["image_urls"][0]

    output = {
        "ok": True,
        "source": "saz-world-index.v1",
        "generated_at": now_iso(),
        "counts": {
            "spaces": len(spaces),
            "avatars": len(avatars),
            "item_appearances": len(item_appearances),
            "space_images": len(space_images),
            "domains": dict(sorted(request_counts.items()))
        },
        "spaces": sorted(spaces.values(), key=lambda x: (not bool(x.get("snapshot_url")), x.get("space_name") or x.get("description") or x.get("space_id"))),
        "avatars": sorted(avatars.values(), key=lambda x: x.get("avatar_name") or x.get("username") or x.get("avatar_id")),
        "item_appearances": item_appearances,
        "space_images": space_images[:2000]
    }

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(output, indent=2), encoding="utf-8")

    print(json.dumps(output["counts"], indent=2))

if __name__ == "__main__":
    main()
