#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import random
import re
import sqlite3
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

IDENTITY_DB = Path("/opt/smallverse/workspace/identity.sqlite")

PERSON_CLASS = b"com.smallworlds.service.person.data.Person"

AVATAR_URL_RE = re.compile(
    r"https://content\.smallverse\.app/uploads/avatars/([0-9a-f]{24})([0-9a-f]+?)(?:_(thumb|snap))?\.png",
    re.I,
)
HEX24 = re.compile(r"^[0-9a-f]{24}$", re.I)


def now():
    return datetime.now(timezone.utc).isoformat()


def amf_utf(s: str) -> bytes:
    b = s.encode("utf-8")
    if len(b) > 65535:
        raise ValueError("AMF short string too long")
    return len(b).to_bytes(2, "big") + b


def amf0_string(s: str) -> bytes:
    return b"\x02" + amf_utf(s)


def amf0_bool(v: bool) -> bytes:
    return b"\x01" + (b"\x01" if v else b"\x00")


def build_nonce() -> str:
    # Captures show strings like:
    #   (993e698372cb73e014672f72c52889a8,1586786
    h = hashlib.md5(f"{time.time_ns()}:{random.random()}".encode()).hexdigest()
    n = random.randint(1000000, 9999999)
    return f"({h},{n}"


def build_friend_search_amf(query: str, call_id: int | None = None, nonce: str | None = None) -> bytes:
    query = query.strip().lower()
    if not query:
        raise ValueError("query is required")

    if call_id is None:
        call_id = random.randint(1, 9999)

    if nonce is None:
        nonce = build_nonce()

    body_values = (
        b"\x0a" +                         # AMF0 strict array
        (3).to_bytes(4, "big") +
        amf0_string(nonce) +
        amf0_string(query) +
        amf0_bool(True)
    )

    packet = (
        b"\x00\x03" +                     # AMF packet version
        b"\x00\x00" +                     # header count
        b"\x00\x01" +                     # message count
        amf_utf("friend.searchForFriends") +
        amf_utf(f"/{call_id}") +
        len(body_values).to_bytes(4, "big") +
        body_values
    )

    return packet


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

    if block[pos] == 0x05:
        return ""

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


def parse_person(block: bytes, source_query: str):
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
        "online": amf_bool_prop(block, "online") or 0,
        "is_friend": amf_bool_prop(block, "isFriend") or 0,
        "is_reciprocal": amf_bool_prop(block, "isReciprocal") or 0,
        "source_query": source_query,
        "source_file": "friend_search_live",
        "seen_at": now(),
    }


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
        avatar_id, first_name, last_name, full_name, gender,
        current_space_id, home_space_id,
        head_url, thumb_url, snapshot_url,
        online, is_friend, is_reciprocal,
        source_query, source_file, raw_ref,
        first_seen, last_seen
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
        online = excluded.online,
        is_friend = excluded.is_friend,
        is_reciprocal = excluded.is_reciprocal,
        source_query = excluded.source_query,
        source_file = excluded.source_file,
        raw_ref = excluded.raw_ref,
        last_seen = excluded.last_seen
    """, (
        row["avatar_id"], row["first_name"], row["last_name"], row["full_name"], row["gender"],
        row["current_space_id"], row["home_space_id"],
        row["head_url"], row["thumb_url"], row["snapshot_url"],
        row["online"], row["is_friend"], row["is_reciprocal"],
        row["source_query"], row["source_file"],
        json.dumps(row, ensure_ascii=False, sort_keys=True),
        row["seen_at"], row["seen_at"],
    ))


def upsert_asset_reference(con, avatar_id, url, source):
    if not avatar_id or not url:
        return False

    url_avatar_id, asset_hash = asset_hash_from_url(url)
    if not asset_hash:
        return False

    if url_avatar_id and url_avatar_id != avatar_id:
        return False

    con.execute("""
      INSERT INTO avatar_assets (
        avatar_id, variant, asset_hash, url,
        http_status, content_type, is_verified_image,
        source, first_seen, last_seen
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
        source,
    ))

    return True


def verify_image(url: str, cookie: str = ""):
    headers = {
        "User-Agent": "Mozilla/5.0 SmallVerse/1.0 BeaconFriendSearchLive",
        "Accept": "image/*,*/*",
        "Referer": "https://www.smallverse.app/profile",
    }
    if cookie:
        headers["Cookie"] = cookie

    for method in ["HEAD", "GET"]:
        try:
            req = urllib.request.Request(url, method=method, headers=headers)
            with urllib.request.urlopen(req, timeout=8) as resp:
                status = resp.status
                ctype = resp.headers.get("content-type", "")
                ok = status == 200 and ctype.lower().startswith("image/")
                return status, ctype, ok
        except urllib.error.HTTPError as exc:
            if method == "GET":
                return exc.code, exc.headers.get("content-type", ""), False
        except Exception:
            if method == "GET":
                return 0, "", False

    return 0, "", False


def update_verification(con, url: str, status: int, ctype: str, ok: bool):
    con.execute("""
      UPDATE avatar_assets
      SET http_status = ?,
          content_type = ?,
          is_verified_image = ?,
          last_seen = CURRENT_TIMESTAMP
      WHERE url = ?
    """, (status, ctype, 1 if ok else 0, url))


def live_call(query: str):
    gateway_url = os.environ.get("SMALLVERSE_GATEWAY_URL", "").strip()
    cookie = os.environ.get("SMALLVERSE_COOKIE", "").strip()

    if not gateway_url:
        raise SystemExit("SMALLVERSE_GATEWAY_URL is required")

    body = build_friend_search_amf(query)

    headers = {
        "User-Agent": "Mozilla/5.0",
        "Content-Type": "application/x-amf",
        "Accept": "*/*",
        "X-Requested-With": "ShockwaveFlash/11.2.999.999",
        "Referer": "https://content.smallverse.app/releases/en_US/main.swf",
        "Origin": "https://www.smallverse.app",
    }
    if cookie:
        headers["Cookie"] = cookie

    req = urllib.request.Request(gateway_url, data=body, method="POST", headers=headers)

    with urllib.request.urlopen(req, timeout=45) as resp:
        return resp.status, resp.headers.get("content-type", ""), resp.read()


def import_live(query: str, verify: bool = False, verify_limit: int = 25):
    status, ctype, payload = live_call(query)

    con = sqlite3.connect(IDENTITY_DB)
    setup(con)

    rows = []
    asset_refs = 0
    verified = 0
    failed = 0
    urls_to_verify = []

    for block in person_blocks(payload):
        row = parse_person(block, query)
        if not row:
            continue

        rows.append(row)
        upsert_identity(con, row)

        for key in ["head_url", "thumb_url", "snapshot_url"]:
            url = row[key]
            if upsert_asset_reference(con, row["avatar_id"], url, "friend_search_live_reference"):
                asset_refs += 1
                if url:
                    urls_to_verify.append(url)

    con.commit()

    if verify:
        cookie = os.environ.get("SMALLVERSE_COOKIE", "").strip()
        seen = []
        for url in urls_to_verify:
            if url in seen:
                continue
            seen.append(url)
            if len(seen) > verify_limit:
                break

            s, ct, ok = verify_image(url, cookie=cookie)
            update_verification(con, url, s, ct, ok)
            verified += 1 if ok else 0
            failed += 0 if ok else 1

        con.commit()

    totals = con.execute("""
      SELECT
        COUNT(*) AS identities,
        SUM(CASE WHEN source_file = 'friend_search_live' THEN 1 ELSE 0 END) AS live_touched
      FROM identity_search_results
    """).fetchone()

    con.close()

    return {
        "ok": True,
        "query": query,
        "http_status": status,
        "content_type": ctype,
        "response_bytes": len(payload),
        "parsed_people": len(rows),
        "asset_refs_added_or_touched": asset_refs,
        "verified_this_run": verified,
        "failed_verify_this_run": failed,
        "identity_totals": {
            "identities": totals[0],
            "live_touched": totals[1] or 0,
        },
        "sample": [
            {
                "avatar_id": r["avatar_id"],
                "name": r["full_name"],
                "head": bool(r["head_url"]),
                "thumb": bool(r["thumb_url"]),
                "snapshot": bool(r["snapshot_url"]),
            }
            for r in rows[:10]
        ],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--query", required=True)
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--verify-limit", type=int, default=25)
    args = ap.parse_args()

    print(json.dumps(import_live(args.query, verify=args.verify, verify_limit=args.verify_limit), indent=2))


if __name__ == "__main__":
    main()
