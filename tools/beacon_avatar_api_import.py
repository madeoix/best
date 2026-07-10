import argparse
import json
import re
import sqlite3
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

WORKSPACE = Path("/opt/smallverse/workspace")
IDENTITY_DB = WORKSPACE / "identity.sqlite"

API_BASE = "https://api.smallverse.app/api/avatar"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115 Safari/537.36 SmallVerse/1.0"


def smallverse_cookie_header():
    # Prefer the full browser Cookie header copied from DevTools.
    full = os.environ.get("SMALLVERSE_COOKIE", "").strip()
    if full:
        return full.replace("\n", " ").strip()

    # Backward-compatible single-cookie mode.
    raw = os.environ.get("SMALLVERSE_SWSID", "").strip()
    if not raw:
        return ""

    if raw.startswith("SWSID="):
        return raw

    return f"SWSID={raw}"

URL_AVATAR_RE = re.compile(r"/uploads/avatars/([0-9a-f]{24})([0-9a-f]+)(?:_(thumb|snap))?\.png$", re.I)


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def create_schema(con):
    con.execute("""
    CREATE TABLE IF NOT EXISTS avatar_api_profiles (
      avatar_id TEXT PRIMARY KEY,
      full_name TEXT DEFAULT '',
      first_name TEXT DEFAULT '',
      last_name TEXT DEFAULT '',
      username TEXT DEFAULT '',
      gender TEXT DEFAULT '',
      title TEXT DEFAULT '',
      theme TEXT DEFAULT '',
      thumb_url TEXT DEFAULT '',
      snap_url TEXT DEFAULT '',
      head_url TEXT DEFAULT '',
      raw_json TEXT DEFAULT '',
      http_status INTEGER DEFAULT 0,
      source TEXT DEFAULT '',
      first_seen TEXT DEFAULT '',
      last_seen TEXT DEFAULT ''
    )
    """)

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


def parse_asset_url(url):
    if not url:
        return None

    path = urlparse(url).path
    match = URL_AVATAR_RE.search(path)

    if not match:
        return None

    avatar_id, asset_hash, suffix = match.groups()

    if suffix == "thumb":
        variant = "thumb"
    elif suffix == "snap":
        variant = "snapshot"
    else:
        variant = "head"

    return {
        "avatar_id": avatar_id,
        "asset_hash": asset_hash,
        "variant": variant,
        "url": url,
    }


def http_json(url, timeout=8):
    headers = {
        "User-Agent": UA,
        "Accept": "application/json,text/plain,*/*",
        "Referer": "https://www.smallverse.app/profile",
        "Origin": "https://www.smallverse.app",
    }

    cookie = smallverse_cookie_header()
    if cookie:
        headers["Cookie"] = cookie

    req = urllib.request.Request(
        url,
        headers=headers,
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            status = resp.status
            content_type = resp.headers.get("content-type", "")
            return status, content_type, json.loads(body.decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        return exc.code, exc.headers.get("content-type", ""), {"error": raw}
    except Exception as exc:
        return 0, "", {"error": str(exc)}


def verify_image(url, timeout=5):
    if not url:
        return 0, "", False

    headers = {
        "User-Agent": UA,
        "Accept": "image/*,*/*",
        "Referer": "https://www.smallverse.app/profile",
    }

    cookie = smallverse_cookie_header()
    if cookie:
        headers["Cookie"] = cookie

    req = urllib.request.Request(
        url,
        method="HEAD",
        headers=headers,
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status = resp.status
            content_type = resp.headers.get("content-type", "")
            return status, content_type, status == 200 and content_type.lower().startswith("image/")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers.get("content-type", ""), False
    except Exception:
        return 0, "", False


def get_avatar_ids(con, limit=0, only_missing=False):
    if only_missing:
        sql = """
        SELECT DISTINCT c.avatar_id
        FROM owner_avatar_candidates c
        LEFT JOIN avatar_assets a
          ON a.avatar_id = c.avatar_id
         AND a.is_verified_image = 1
        WHERE c.avatar_id IS NOT NULL
          AND c.avatar_id != ''
          AND a.avatar_id IS NULL
        ORDER BY c.last_seen DESC, c.evidence_count DESC
        """
    else:
        sql = """
        SELECT DISTINCT avatar_id
        FROM owner_avatar_candidates
        WHERE avatar_id IS NOT NULL AND avatar_id != ''
        ORDER BY last_seen DESC, evidence_count DESC
        """

    if limit and limit > 0:
        sql += f" LIMIT {int(limit)}"

    return [row[0] for row in con.execute(sql).fetchall()]


def upsert_profile(con, avatar_id, payload, status):
    ts = utc_now()

    full_name = payload.get("fullName") or payload.get("full_name") or payload.get("name") or ""
    first_name = payload.get("firstName") or payload.get("first_name") or ""
    last_name = payload.get("lastName") or payload.get("last_name") or ""
    username = payload.get("username") or ""
    gender = payload.get("gender") or ""
    title = payload.get("title") or ""
    theme = payload.get("theme") or ""

    thumb_url = payload.get("thumbUrl") or payload.get("thumb_url") or ""
    snap_url = payload.get("snapUrl") or payload.get("snap_url") or payload.get("snapshotUrl") or ""
    head_url = payload.get("headUrl") or payload.get("head_url") or payload.get("url") or ""

    con.execute(
        """
        INSERT INTO avatar_api_profiles (
          avatar_id, full_name, first_name, last_name, username, gender, title, theme,
          thumb_url, snap_url, head_url, raw_json, http_status, source, first_seen, last_seen
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(avatar_id)
        DO UPDATE SET
          full_name = excluded.full_name,
          first_name = excluded.first_name,
          last_name = excluded.last_name,
          username = excluded.username,
          gender = excluded.gender,
          title = excluded.title,
          theme = excluded.theme,
          thumb_url = excluded.thumb_url,
          snap_url = excluded.snap_url,
          head_url = excluded.head_url,
          raw_json = excluded.raw_json,
          http_status = excluded.http_status,
          source = excluded.source,
          last_seen = excluded.last_seen
        """,
        (
            avatar_id,
            full_name,
            first_name,
            last_name,
            username,
            gender,
            title,
            theme,
            thumb_url,
            snap_url,
            head_url,
            json.dumps(payload, ensure_ascii=False),
            status,
            "api.smallverse.app/api/avatar",
            ts,
            ts,
        ),
    )

    return {
        "thumb": thumb_url,
        "snapshot": snap_url,
        "head": head_url,
    }


def upsert_asset(con, asset, source):
    status, content_type, ok = verify_image(asset["url"])
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
          http_status = excluded.http_status,
          content_type = excluded.content_type,
          is_verified_image = excluded.is_verified_image,
          source = excluded.source,
          last_seen = excluded.last_seen
        """,
        (
            asset["avatar_id"],
            asset["variant"],
            asset["asset_hash"],
            asset["url"],
            status,
            content_type,
            1 if ok else 0,
            source,
            ts,
            ts,
        ),
    )

    return ok


def import_avatar(con, avatar_id):
    status, content_type, payload = http_json(f"{API_BASE}/{avatar_id}")

    if status != 200 or not isinstance(payload, dict) or payload.get("error"):
        return {
            "avatar_id": avatar_id,
            "ok": False,
            "http_status": status,
            "error": payload.get("error") if isinstance(payload, dict) else "bad payload",
        }

    urls = upsert_profile(con, avatar_id, payload, status)

    assets_seen = 0
    verified = 0

    for declared_variant, url in urls.items():
        asset = parse_asset_url(url)
        if not asset:
            continue

        # Safety: endpoint avatar and URL avatar should match.
        if asset["avatar_id"] != avatar_id:
            continue

        assets_seen += 1
        verified += 1 if upsert_asset(con, asset, "api.smallverse.app/api/avatar") else 0

    return {
        "avatar_id": avatar_id,
        "ok": True,
        "name": payload.get("fullName") or payload.get("name") or "",
        "assets_seen": assets_seen,
        "verified_assets": verified,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--avatar-id", default="")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--only-missing", action="store_true")
    parser.add_argument("--sleep", type=float, default=0.08)
    args = parser.parse_args()

    con = sqlite3.connect(IDENTITY_DB)
    create_schema(con)

    if args.avatar_id:
        avatar_ids = [args.avatar_id]
    else:
        avatar_ids = get_avatar_ids(con, limit=args.limit, only_missing=args.only_missing)

    results = []
    ok_count = 0
    verified_assets = 0

    for index, avatar_id in enumerate(avatar_ids, start=1):
        result = import_avatar(con, avatar_id)
        con.commit()

        results.append(result)
        ok_count += 1 if result.get("ok") else 0
        verified_assets += result.get("verified_assets") or 0

        print(json.dumps({
            "i": index,
            "total": len(avatar_ids),
            **result,
        }, ensure_ascii=False), flush=True)

        if args.sleep:
            time.sleep(args.sleep)

    counts = con.execute("""
      SELECT
        COUNT(*) AS assets,
        SUM(is_verified_image) AS verified_assets,
        COUNT(DISTINCT avatar_id) AS avatars,
        COUNT(DISTINCT CASE WHEN is_verified_image = 1 THEN avatar_id END) AS avatars_with_verified
      FROM avatar_assets
    """).fetchone()

    con.close()

    print(json.dumps({
        "ok": True,
        "avatars_attempted": len(avatar_ids),
        "avatar_api_ok": ok_count,
        "verified_assets_imported_this_run": verified_assets,
        "avatar_assets_total": counts[0],
        "verified_assets_total": counts[1] or 0,
        "avatars_total": counts[2],
        "avatars_with_verified_asset": counts[3],
    }, indent=2))


if __name__ == "__main__":
    main()
