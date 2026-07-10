import argparse
import io
import json
import os
import re
import tarfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote

URL_RE = re.compile(
    r"https?:\\?/\\?/content\.smallverse\.app/uploads/avatars/[A-Za-z0-9_\-./%]+?\.(?:png|jpg|jpeg|webp)",
    re.IGNORECASE,
)

BASENAME_RE = re.compile(
    r"^(?P<avatar_id>[0-9a-f]{24})(?P<tail>[0-9a-f]{0,80})(?:_(?P<kind>thumb|snap))?\.(?P<ext>png|jpg|jpeg|webp)$",
    re.IGNORECASE,
)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def clean_url(url):
    url = url.replace("\\/", "/")
    url = unquote(url)
    return url.split("?")[0].split("#")[0]


def classify_url(url):
    base = clean_url(url).rstrip("/").split("/")[-1]
    m = BASENAME_RE.match(base)
    if not m:
        return None

    kind = m.group("kind") or "head"
    return {
        "avatar_id": m.group("avatar_id").lower(),
        "kind": kind,
        "url": clean_url(url),
        "basename": base,
    }


def scan_text(text, source, out):
    for raw in URL_RE.findall(text):
        hit = classify_url(raw)
        if not hit:
            continue

        avatar_id = hit["avatar_id"]
        rec = out.setdefault(avatar_id, {
            "avatar_id": avatar_id,
            "head_urls": [],
            "thumb_urls": [],
            "snap_urls": [],
            "sources": [],
        })

        key = {
            "head": "head_urls",
            "thumb": "thumb_urls",
            "snap": "snap_urls",
        }[hit["kind"]]

        if hit["url"] not in rec[key]:
            rec[key].append(hit["url"])

        if len(rec["sources"]) < 12 and source not in rec["sources"]:
            rec["sources"].append(source)


def scan_bytes(blob, source, out):
    text = blob.decode("utf-8", errors="ignore")
    if "uploads/avatars" not in text and "uploads\\/avatars" not in text:
        return
    scan_text(text, source, out)


def scan_saz_bytes(blob, source_name, out):
    try:
        with zipfile.ZipFile(io.BytesIO(blob)) as zf:
            for name in zf.namelist():
                try:
                    scan_bytes(zf.read(name), f"{source_name}!{name}", out)
                except Exception:
                    pass
    except zipfile.BadZipFile:
        scan_bytes(blob, source_name, out)


def scan_path(path, out):
    path = Path(path)

    if path.is_dir():
        for child in path.rglob("*"):
            if child.is_file():
                scan_path(child, out)
        return

    lower = path.name.lower()

    if lower.endswith((".tar.gz", ".tgz", ".tar")):
        mode = "r:gz" if lower.endswith((".tar.gz", ".tgz")) else "r:"
        with tarfile.open(path, mode) as tf:
            for member in tf.getmembers():
                if not member.isfile():
                    continue
                f = tf.extractfile(member)
                if not f:
                    continue
                blob = f.read()
                if member.name.lower().endswith(".saz"):
                    scan_saz_bytes(blob, member.name, out)
                else:
                    scan_bytes(blob, member.name, out)
        return

    blob = path.read_bytes()

    if lower.endswith((".saz", ".zip")):
        scan_saz_bytes(blob, str(path), out)
    else:
        scan_bytes(blob, str(path), out)


def choose(values):
    return values[0] if values else ""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("inputs", nargs="+", help="SAZ file, directory, or tar/tar.gz containing SAZ files")
    parser.add_argument("--out", default="avatar-url-index.json")
    args = parser.parse_args()

    raw = {}
    for input_path in args.inputs:
        scan_path(input_path, raw)

    records = {}
    for avatar_id, rec in sorted(raw.items()):
        records[avatar_id] = {
            "avatar_id": avatar_id,
            "head_url": choose(rec["head_urls"]),
            "thumb_url": choose(rec["thumb_urls"]),
            "snapshot_url": choose(rec["snap_urls"]),
            "head_urls": rec["head_urls"],
            "thumb_urls": rec["thumb_urls"],
            "snapshot_urls": rec["snap_urls"],
            "sources": rec["sources"],
        }

    payload = {
        "contract": "smallverse-avatar-url-index/v1",
        "generated_at": now_iso(),
        "inputs": [str(Path(p)) for p in args.inputs],
        "avatar_count": len(records),
        "by_avatar_id": records,
    }

    Path(args.out).write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "out": args.out,
        "avatar_count": len(records),
        "with_head": sum(1 for r in records.values() if r["head_url"]),
        "with_thumb": sum(1 for r in records.values() if r["thumb_url"]),
        "with_snapshot": sum(1 for r in records.values() if r["snapshot_url"]),
    }, indent=2))


if __name__ == "__main__":
    main()
