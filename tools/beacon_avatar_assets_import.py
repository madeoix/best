import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

WORKSPACE = Path("/opt/smallverse/workspace")
IDENTITY_DB = WORKSPACE / "identity.sqlite"
AVATAR_INDEX = WORKSPACE / "avatar-url-index.json"

HEX24 = re.compile(r"^[0-9a-f]{24}$")


def now():
    return datetime.now(timezone.utc).isoformat()


def load_json(path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(errors="replace"))


def variant_from_url(url, declared_variant):
    name = Path(urlparse(url).path).name

    if name.endswith("_thumb.png"):
        return "thumb"
    if name.endswith("_snap.png"):
        return "snapshot"
    if name.endswith(".png"):
        return "head"

    return declared_variant or "unknown"


def asset_hash_from_url(avatar_id, url):
    name = Path(urlparse(url).path).name

    stem = name
    for suffix in ["_thumb.png", "_snap.png", ".png"]:
        if stem.endswith(suffix):
            stem = stem[: -len(suffix)]
            break

    if not stem.startswith(avatar_id):
        return ""

    return stem[len(avatar_id):]


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
    CREATE INDEX IF NOT EXISTS idx_avatar_assets_avatar_verified
    ON avatar_assets (avatar_id, is_verified_image, variant, last_seen)
    """)

    con.execute("""
    CREATE INDEX IF NOT EXISTS idx_avatar_assets_hash
    ON avatar_assets (asset_hash)
    """)


def iter_asset_rows(index):
    by_avatar_id = index.get("by_avatar_id") or {}

    for avatar_id, rec in by_avatar_id.items():
        if not avatar_id:
            continue

        url_checks = rec.get("url_checks") or {}

        candidates = []

        for declared_variant, fields in {
            "head": ["head_url", "head_verified_url", "head_urls"],
            "thumb": ["thumb_url", "thumb_verified_url", "thumb_urls"],
            "snapshot": ["snapshot_url", "snapshot_verified_url", "snapshot_urls"],
        }.items():
            for field in fields:
                value = rec.get(field)

                if not value:
                    continue

                if isinstance(value, list):
                    for url in value:
                        if url:
                            candidates.append((declared_variant, url))
                elif isinstance(value, str):
                    candidates.append((declared_variant, value))

        seen = set()

        for declared_variant, url in candidates:
            if not url or url in seen:
                continue

            seen.add(url)

            variant = variant_from_url(url, declared_variant)
            asset_hash = asset_hash_from_url(avatar_id, url)

            if not asset_hash:
                continue

            check = url_checks.get(declared_variant) or url_checks.get(variant) or {}

            status = int(check.get("status") or 0)
            content_type = check.get("content_type") or ""
            ok = bool(check.get("ok"))

            # Also trust explicit verified_url fields.
            if url in {
                rec.get("head_verified_url"),
                rec.get("thumb_verified_url"),
                rec.get("snapshot_verified_url"),
            }:
                ok = True
                if not status:
                    status = 200
                if not content_type:
                    content_type = "image/png"

            yield {
                "avatar_id": avatar_id,
                "variant": variant,
                "asset_hash": asset_hash,
                "url": url,
                "http_status": status,
                "content_type": content_type,
                "is_verified_image": 1 if ok else 0,
                "source": ",".join(rec.get("sources") or [])[:1000],
            }


def main():
    index = load_json(AVATAR_INDEX, {})
    con = sqlite3.connect(IDENTITY_DB)
    create_schema(con)

    ts = now()
    inserted = 0
    verified = 0

    for row in iter_asset_rows(index):
        con.execute(
            """
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
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(avatar_id, variant, asset_hash, url)
            DO UPDATE SET
              http_status = excluded.http_status,
              content_type = excluded.content_type,
              is_verified_image = excluded.is_verified_image,
              source = excluded.source,
              last_seen = excluded.last_seen
            """,
            (
                row["avatar_id"],
                row["variant"],
                row["asset_hash"],
                row["url"],
                row["http_status"],
                row["content_type"],
                row["is_verified_image"],
                row["source"],
                ts,
                ts,
            ),
        )

        inserted += 1
        verified += row["is_verified_image"]

    con.commit()

    counts = con.execute("""
      SELECT
        COUNT(*) AS assets,
        SUM(is_verified_image) AS verified,
        COUNT(DISTINCT avatar_id) AS avatars,
        COUNT(DISTINCT CASE WHEN is_verified_image = 1 THEN avatar_id END) AS avatars_verified
      FROM avatar_assets
    """).fetchone()

    con.close()

    print(json.dumps({
        "ok": True,
        "imported_rows_seen": inserted,
        "imported_verified_rows_seen": verified,
        "avatar_assets_total": counts[0],
        "verified_assets_total": counts[1] or 0,
        "avatars_total": counts[2],
        "avatars_with_verified_asset": counts[3],
    }, indent=2))


if __name__ == "__main__":
    main()
