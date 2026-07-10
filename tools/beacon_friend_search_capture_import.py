#!/usr/bin/env python3
import argparse
import json
import re
import sqlite3
import tarfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path

IDENTITY_DB = Path("/opt/smallverse/workspace/identity.sqlite")

PERSON_CLASS = b"com.smallworlds.service.person.data.Person"

AVATAR_URL_RE = re.compile(
    r"https://content\.smallverse\.app/uploads/avatars/([0-9a-f]{24})([0-9a-f]+?)(?:_(thumb|snap))?\.png",
    re.I,
)

HEX24 = re.compile(r"^[0-9a-f]{24}$", re.I)


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def prop_marker(name: str) -> bytes:
    raw = name.encode("utf-8")
    return len(raw).to_bytes(2, "big") + raw


def amf_string_prop(block: bytes, name: str) -> str:
    marker = prop_marker(name)
    idx = block.find(marker)

    if idx < 0:
        return ""

    pos = idx + len(marker)

    if pos >= len(block):
        return ""

    # AMF0 null
    if block[pos] == 0x05:
        return ""

    # AMF0 string
    if block[pos] != 0x02 or pos + 3 > len(block):
        return ""

    length = int.from_bytes(block[pos + 1:pos + 3], "big")

    if length < 0 or length > 5000 or pos + 3 + length > len(block):
        return ""

    return block[pos + 3:pos + 3 + length].decode("utf-8", errors="replace")


def amf_bool_prop(block: bytes, name: str):
    marker = prop_marker(name)
    idx = block.find(marker)

    if idx < 0:
        return None

    pos = idx + len(marker)

    if pos + 1 >= len(block):
        return None

    if block[pos] != 0x01:
        return None

    return 1 if block[pos + 1] else 0


def extract_query(data: bytes) -> str:
    idx = data.find(b"friend.searchForFriends")
    if idx < 0:
        return ""

    window = data[idx:idx + 500]

    # Captured call has AMF string values; the query appears as a short string like bb/cc.
    candidates = []
    pos = 0

    while True:
        j = window.find(b"\x02", pos)

        if j < 0 or j + 3 >= len(window):
            break

        length = int.from_bytes(window[j + 1:j + 3], "big")

        if 1 <= length <= 32 and j + 3 + length <= len(window):
            value = window[j + 3:j + 3 + length].decode("utf-8", errors="ignore")
            if re.fullmatch(r"[A-Za-z0-9 _.\-]{1,32}", value or ""):
                candidates.append(value)

        pos = j + 1

    # Prefer the last small alphabetic-ish candidate, usually the query.
    for value in reversed(candidates):
        if re.fullmatch(r"[A-Za-z]{1,8}", value):
            return value.lower()

    return candidates[-1].lower() if candidates else ""


def iter_archive(path: Path):
    path = Path(path)

    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as z:
            for name in z.namelist():
                if name.endswith("/"):
                    continue
                yield name, z.read(name)
        return

    if tarfile.is_tarfile(path):
        with tarfile.open(path, "r:*") as t:
            for m in t.getmembers():
                if not m.isfile():
                    continue
                f = t.extractfile(m)
                if f:
                    yield m.name, f.read()
        return

    yield path.name, path.read_bytes()


def person_blocks(data: bytes):
    starts = [m.start() for m in re.finditer(re.escape(PERSON_CLASS), data)]

    for i, start in enumerate(starts):
        end = starts[i + 1] if i + 1 < len(starts) else min(len(data), start + 5000)
        yield data[start:end]


def variant_from_url(url: str) -> str:
    if url.endswith("_thumb.png"):
        return "thumb"
    if url.endswith("_snap.png"):
        return "snapshot"
    return "head"


def asset_hash_from_url(url: str):
    m = AVATAR_URL_RE.search(url or "")

    if not m:
        return "", ""

    return m.group(1).lower(), m.group(2).lower()


def setup(con):
    con.executescript("""
    CREATE TABLE IF NOT EXISTS identity_search_results (
      avatar_id TEXT PRIMARY KEY,
      first_name TEXT DEFAULT '',
      last_name TEXT DEFAULT '',
      full_name TEXT DEFAULT '',
      gender TEXT DEFAULT '',
      current_space_id TEXT DEFAULT '',
      home_space_id TEXT DEFAULT '',
      head_url TEXT DEFAULT '',
      thumb_url TEXT DEFAULT '',
      snapshot_url TEXT DEFAULT '',
      online INTEGER DEFAULT 0,
      is_friend INTEGER DEFAULT 0,
      is_reciprocal INTEGER DEFAULT 0,
      source_query TEXT DEFAULT '',
      source_file TEXT DEFAULT '',
      raw_ref TEXT DEFAULT '',
      first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
      last_seen TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_identity_search_name
    ON identity_search_results(first_name, last_name);

    CREATE INDEX IF NOT EXISTS idx_identity_search_space
    ON identity_search_results(current_space_id, home_space_id);

    CREATE TABLE IF NOT EXISTS avatar_assets (
      avatar_id TEXT NOT NULL,
      variant TEXT NOT NULL,
      asset_hash TEXT NOT NULL,
      url TEXT NOT NULL,
      http_status INTEGER DEFAULT 0,
      content_type TEXT DEFAULT '',
      is_verified_image INTEGER DEFAULT 0,
      source TEXT DEFAULT '',
      first_seen TEXT DEFAULT CURRENT_TIMESTAMP,
      last_seen TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (avatar_id, variant, asset_hash, url)
    );

    CREATE INDEX IF NOT EXISTS idx_avatar_assets_avatar_verified
    ON avatar_assets(avatar_id, is_verified_image, variant, last_seen);
    """)


def upsert_identity(con, row):
    con.execute("""
      INSERT INTO identity_search_results (
        avatar_id,
        first_name,
        last_name,
        full_name,
        gender,
        current_space_id,
        home_space_id,
        head_url,
        thumb_url,
        snapshot_url,
        online,
        is_friend,
        is_reciprocal,
        source_query,
        source_file,
        raw_ref,
        first_seen,
        last_seen
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(avatar_id)
      DO UPDATE SET
        first_name = COALESCE(NULLIF(excluded.first_name, ''), first_name),
        last_name = COALESCE(NULLIF(excluded.last_name, ''), last_name),
        full_name = COALESCE(NULLIF(excluded.full_name, ''), full_name),
        gender = COALESCE(NULLIF(excluded.gender, ''), gender),
        current_space_id = COALESCE(NULLIF(excluded.current_space_id, ''), current_space_id),
        home_space_id = COALESCE(NULLIF(excluded.home_space_id, ''), home_space_id),
        head_url = COALESCE(NULLIF(excluded.head_url, ''), head_url),
        thumb_url = COALESCE(NULLIF(excluded.thumb_url, ''), thumb_url),
        snapshot_url = COALESCE(NULLIF(excluded.snapshot_url, ''), snapshot_url),
        online = MAX(online, excluded.online),
        is_friend = MAX(is_friend, excluded.is_friend),
        is_reciprocal = MAX(is_reciprocal, excluded.is_reciprocal),
        source_query = COALESCE(NULLIF(excluded.source_query, ''), source_query),
        source_file = excluded.source_file,
        raw_ref = excluded.raw_ref,
        last_seen = excluded.last_seen
    """, (
        row["avatar_id"],
        row["first_name"],
        row["last_name"],
        row["full_name"],
        row["gender"],
        row["current_space_id"],
        row["home_space_id"],
        row["head_url"],
        row["thumb_url"],
        row["snapshot_url"],
        row["online"] or 0,
        row["is_friend"] or 0,
        row["is_reciprocal"] or 0,
        row["source_query"],
        row["source_file"],
        json.dumps(row, ensure_ascii=False, sort_keys=True),
        row["seen_at"],
        row["seen_at"],
    ))


def upsert_asset_reference(con, avatar_id, url, source_file):
    if not avatar_id or not url:
        return False

    url_avatar_id, asset_hash = asset_hash_from_url(url)

    if not asset_hash:
        return False

    # URL prefix avatar id should match, but keep the explicit avatar_id as source of truth.
    if url_avatar_id and url_avatar_id != avatar_id:
        return False

    con.execute("""
      INSERT INTO avatar_assets (
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
      )
      VALUES (?, ?, ?, ?, 0, '', 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(avatar_id, variant, asset_hash, url)
      DO UPDATE SET
        source = excluded.source,
        last_seen = CURRENT_TIMESTAMP
    """, (
        avatar_id,
        variant_from_url(url),
        asset_hash,
        url,
        f"friend_search_capture_reference:{source_file}",
    ))

    return True


def parse_person(block: bytes, source_file: str, source_query: str):
    avatar_id = amf_string_prop(block, "avatarId") or amf_string_prop(block, "id")

    if not HEX24.match(avatar_id or ""):
        return None

    first = amf_string_prop(block, "firstName")
    last = amf_string_prop(block, "lastName")
    full = " ".join(x for x in [first, last] if x).strip()

    return {
        "avatar_id": avatar_id.lower(),
        "first_name": first,
        "last_name": last,
        "full_name": full,
        "gender": amf_string_prop(block, "gender"),
        "current_space_id": amf_string_prop(block, "currentSpaceId"),
        "home_space_id": amf_string_prop(block, "homeSpaceId"),
        "head_url": amf_string_prop(block, "headUrl"),
        "thumb_url": amf_string_prop(block, "thumbUrl"),
        "snapshot_url": amf_string_prop(block, "snapshotUrl"),
        "online": amf_bool_prop(block, "online"),
        "is_friend": amf_bool_prop(block, "isFriend"),
        "is_reciprocal": amf_bool_prop(block, "isReciprocal"),
        "source_query": source_query,
        "source_file": source_file,
        "seen_at": utc_now(),
    }


def import_capture(capture_path):
    con = sqlite3.connect(IDENTITY_DB)
    setup(con)

    files = 0
    parsed_rows = 0
    unique_seen = set()
    asset_refs = 0

    for source_file, data in iter_archive(Path(capture_path)):
        files += 1
        source_query = extract_query(data)

        for block in person_blocks(data):
            row = parse_person(block, source_file, source_query)

            if not row:
                continue

            parsed_rows += 1
            unique_seen.add(row["avatar_id"])

            upsert_identity(con, row)

            for url_key in ["head_url", "thumb_url", "snapshot_url"]:
                if upsert_asset_reference(con, row["avatar_id"], row[url_key], source_file):
                    asset_refs += 1

        con.commit()

    summary = con.execute("""
      SELECT
        COUNT(*) AS identities,
        SUM(CASE WHEN COALESCE(head_url, '') != '' THEN 1 ELSE 0 END) AS with_head,
        SUM(CASE WHEN COALESCE(thumb_url, '') != '' THEN 1 ELSE 0 END) AS with_thumb,
        SUM(CASE WHEN COALESCE(snapshot_url, '') != '' THEN 1 ELSE 0 END) AS with_snapshot
      FROM identity_search_results
    """).fetchone()

    assets = con.execute("""
      SELECT
        COUNT(*) AS assets,
        SUM(is_verified_image) AS verified_assets,
        COUNT(DISTINCT avatar_id) AS avatar_count
      FROM avatar_assets
    """).fetchone()

    con.close()

    return {
        "ok": True,
        "capture": str(capture_path),
        "files_read": files,
        "parsed_rows": parsed_rows,
        "unique_avatar_ids_seen": len(unique_seen),
        "asset_references_seen": asset_refs,
        "identity_search_results": {
            "identities_total": summary[0],
            "with_head_url": summary[1] or 0,
            "with_thumb_url": summary[2] or 0,
            "with_snapshot_url": summary[3] or 0,
        },
        "avatar_assets": {
            "assets_total": assets[0],
            "verified_assets_total": assets[1] or 0,
            "avatars_with_asset_reference": assets[2],
        },
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("capture", help="findfriends-capture.zip or extracted text capture")
    args = parser.parse_args()

    print(json.dumps(import_capture(args.capture), indent=2))


if __name__ == "__main__":
    main()
