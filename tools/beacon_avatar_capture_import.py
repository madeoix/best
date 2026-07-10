import argparse
import gzip
import io
import json
import re
import sqlite3
import tarfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

WORKSPACE = Path("/opt/smallverse/workspace")
IDENTITY_DB = WORKSPACE / "identity.sqlite"

AVATAR_URL_RE = re.compile(
    r"https://content\.smallverse\.app/uploads/avatars/([0-9a-f]{24})([0-9a-f]+?)(?:_(thumb|snap))?\.png",
    re.I,
)


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def create_schema(con):
    con.execute("""
    CREATE TABLE IF NOT EXISTS avatar_assets (
      avatar_id TEXT NOT NULL,
      variant TEXT NOT NULL,
      asset_hash TEXT NOT NULL,
      url TEXT NOT NULL,
      http_status INTEGER DEFAULT 0,
      content_type TEXT DEFAULT '',
      is_verified_image INTEGER DEFAULT 0,
      source TEXT DEFAULT '',
      first_seen TEXT DEFAULT '',
      last_seen TEXT DEFAULT '',
      PRIMARY KEY (avatar_id, variant, asset_hash, url)
    )
    """)

    con.execute("""
    CREATE TABLE IF NOT EXISTS avatar_api_profiles (
      avatar_id TEXT PRIMARY KEY,
      full_name TEXT DEFAULT '',
      thumb_url TEXT DEFAULT '',
      snap_url TEXT DEFAULT '',
      raw_json TEXT DEFAULT '',
      http_status INTEGER DEFAULT 0,
      source TEXT DEFAULT '',
      first_seen TEXT DEFAULT '',
      last_seen TEXT DEFAULT ''
    )
    """)

    con.execute("""
    CREATE INDEX IF NOT EXISTS idx_avatar_assets_avatar_verified
    ON avatar_assets (avatar_id, is_verified_image, variant, last_seen)
    """)


def variant_from_suffix(suffix):
    if suffix == "thumb":
        return "thumb"
    if suffix == "snap":
        return "snapshot"
    return "head"


def iter_container(path):
    path = Path(path)

    if tarfile.is_tarfile(path):
        with tarfile.open(path, "r:*") as tar:
            for member in tar.getmembers():
                if not member.isfile():
                    continue
                f = tar.extractfile(member)
                if not f:
                    continue
                data = f.read()
                yield member.name, data

                if member.name.lower().endswith(".saz") or zipfile.is_zipfile(io.BytesIO(data)):
                    yield from iter_zip_bytes(member.name, data)
        return

    data = path.read_bytes()
    yield path.name, data

    if zipfile.is_zipfile(path):
        yield from iter_zip_bytes(path.name, data)


def iter_zip_bytes(prefix, data):
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for name in z.namelist():
                if name.endswith("/"):
                    continue
                yield f"{prefix}!{name}", z.read(name)
    except Exception:
        return


def decode_text(data):
    if data[:2] == b"\x1f\x8b":
        try:
            data = gzip.decompress(data)
        except Exception:
            pass
    return data.decode("utf-8", errors="replace")


def json_objects_with_avatar_fields(text):
    # Lightweight scan: enough for Fiddler response bodies that contain JSON with thumbUrl/snapUrl.
    if "thumbUrl" not in text and "snapUrl" not in text:
        return

    decoder = json.JSONDecoder()

    for i, ch in enumerate(text):
        if ch != "{":
            continue
        try:
            obj, _ = decoder.raw_decode(text[i:])
        except Exception:
            continue
        if isinstance(obj, dict) and ("thumbUrl" in obj or "snapUrl" in obj or "id" in obj):
            yield obj


def upsert_asset(con, avatar_id, variant, asset_hash, url, source, verified=1):
    ts = utc_now()
    con.execute(
        """
        INSERT INTO avatar_assets (
          avatar_id, variant, asset_hash, url,
          http_status, content_type, is_verified_image,
          source, first_seen, last_seen
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(avatar_id, variant, asset_hash, url)
        DO UPDATE SET
          is_verified_image = MAX(is_verified_image, excluded.is_verified_image),
          source = excluded.source,
          last_seen = excluded.last_seen
        """,
        (
            avatar_id,
            variant,
            asset_hash,
            url,
            200 if verified else 0,
            "image/png" if verified else "",
            1 if verified else 0,
            source[:1000],
            ts,
            ts,
        ),
    )


def upsert_profile(con, avatar_id, obj, source):
    if not avatar_id:
        return

    ts = utc_now()
    con.execute(
        """
        INSERT INTO avatar_api_profiles (
          avatar_id, full_name, thumb_url, snap_url,
          raw_json, http_status, source, first_seen, last_seen
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(avatar_id)
        DO UPDATE SET
          full_name = COALESCE(NULLIF(excluded.full_name, ''), full_name),
          thumb_url = COALESCE(NULLIF(excluded.thumb_url, ''), thumb_url),
          snap_url = COALESCE(NULLIF(excluded.snap_url, ''), snap_url),
          raw_json = excluded.raw_json,
          http_status = excluded.http_status,
          source = excluded.source,
          last_seen = excluded.last_seen
        """,
        (
            avatar_id,
            obj.get("fullName") or obj.get("name") or "",
            obj.get("thumbUrl") or "",
            obj.get("snapUrl") or "",
            json.dumps(obj, ensure_ascii=False),
            200,
            source[:1000],
            ts,
            ts,
        ),
    )


def import_capture(path):
    con = sqlite3.connect(IDENTITY_DB)
    create_schema(con)

    asset_rows = 0
    profile_rows = 0
    seen_assets = set()

    for name, data in iter_container(path):
        text = decode_text(data)
        if "uploads/avatars" not in text and "thumbUrl" not in text and "snapUrl" not in text:
            continue

        for match in AVATAR_URL_RE.finditer(text):
            avatar_id, asset_hash, suffix = match.groups()
            url = match.group(0)
            variant = variant_from_suffix(suffix)
            key = (avatar_id, variant, asset_hash, url)

            if key in seen_assets:
                continue

            seen_assets.add(key)
            upsert_asset(con, avatar_id, variant, asset_hash, url, name, verified=1)
            asset_rows += 1

        for obj in json_objects_with_avatar_fields(text) or []:
            avatar_id = obj.get("id") or ""
            if not re.fullmatch(r"[0-9a-f]{24}", avatar_id or ""):
                continue

            upsert_profile(con, avatar_id, obj, name)
            profile_rows += 1

    con.commit()

    counts = con.execute("""
      SELECT
        COUNT(*) AS assets,
        SUM(is_verified_image) AS verified_assets,
        COUNT(DISTINCT avatar_id) AS avatars,
        COUNT(DISTINCT CASE WHEN is_verified_image = 1 THEN avatar_id END) AS avatars_with_verified
      FROM avatar_assets
    """).fetchone()

    con.close()

    return {
        "ok": True,
        "capture": str(path),
        "asset_rows_seen": asset_rows,
        "api_profile_rows_seen": profile_rows,
        "avatar_assets_total": counts[0],
        "verified_assets_total": counts[1] or 0,
        "avatars_total": counts[2],
        "avatars_with_verified_asset": counts[3],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("capture")
    args = parser.parse_args()

    print(json.dumps(import_capture(args.capture), indent=2))


if __name__ == "__main__":
    main()
