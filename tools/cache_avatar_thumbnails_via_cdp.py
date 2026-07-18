#!/usr/bin/env python3
"""Cache avatar portrait PNGs from authoritative URLs returned by the game.

RTMP avatar shared objects contain the avatar id plus the content hash used by
Smallverse's avatar image URLs.  The content host rejects generic HTTP clients,
but accepts the same request from the signed-in crawler Chromium instance.  This
Direct transport is attempted first so scheduled collection does not depend on
a permanently open Chromium debugging port. CDP remains a fallback when the
content host requires the authenticated browser context.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import socket
import struct
import urllib.request
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit


AVATAR_ID = re.compile(r"^[0-9a-f]{24}$", re.I)
HASH = re.compile(r"^[0-9a-f]{32}$", re.I)
AVATAR_IMAGE_URL = re.compile(
    r"/uploads/avatars/([0-9a-f]{24})([0-9a-f]{32})(?:_(thumb|snap))?\.png(?:[?#].*)?$",
    re.I,
)
PNG = b"\x89PNG\r\n\x1a\n"
AVATAR_CONTENT_HOST = "content.smallverse.app"
AVATAR_CONTENT_PREFIX = "/uploads/avatars/"
VARIANT_SUFFIXES = {
    "head": ".png",
    "thumb": "_thumb.png",
    "snapshot": "_snap.png",
}
IDENTITY_FIELDS = (
    "owner_id",
    "owner_first_name",
    "owner_last_name",
    "first_name",
    "last_name",
    "display_name",
    "gender",
    "current_space_id",
    "home_space_id",
    "current_instance_id",
    "source_query",
    "source_class",
    "source_method",
    "relationship_basis",
)


def records(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [entry for entry in payload if isinstance(entry, dict)]
    if isinstance(payload, dict):
        avatars = payload.get("avatars")
        if isinstance(avatars, list):
            return [entry for entry in avatars if isinstance(entry, dict)]
        entries = payload.get("by_avatar_id")
        if isinstance(entries, dict):
            return [dict(value, avatar_id=key) for key, value in entries.items() if isinstance(value, dict)]
    return []


def merge_records(*payloads: Any) -> list[dict[str, Any]]:
    """Merge manifest and preserved-index records without losing newer hashes.

    The RTMP manifest is the authoritative source for a newly observed avatar,
    while the preserved URL index contains portraits that were discovered before
    the current crawler capture.  Cache both when explicitly requested, but
    retain the first non-empty value for every field so a live RTMP hash wins
    over an older saved URL.
    """
    merged: dict[str, dict[str, Any]] = {}

    for payload in payloads:
        for raw in records(payload):
            avatar_id = str(raw.get("avatar_id") or "").lower()
            if not AVATAR_ID.fullmatch(avatar_id):
                continue
            target = merged.setdefault(avatar_id, {"avatar_id": avatar_id})
            for key, value in raw.items():
                if key == "avatar_id" or value in (None, "", [], {}):
                    continue
                if target.get(key) in (None, "", [], {}):
                    target[key] = value

    return list(merged.values())


def fill_postfixes(entry: dict[str, Any]) -> dict[str, Any]:
    """Accept either RTMP postfixes or preserved avatar-index URLs.

    Older crawler exports have image URLs but no separate ``*_postfix`` keys.
    The hash is part of the canonical Smallverse URL, so deriving it here lets
    the signed-in crawler cache those owners too instead of only newly-seen
    RTMP avatars.
    """
    normalized = dict(entry)
    for variant, suffix in (("head", None), ("thumb", "thumb"), ("snapshot", "snap")):
        existing = str(normalized.get(f"{variant}_postfix") or "").lower()
        if HASH.fullmatch(existing):
            continue
        candidates: list[Any] = [
            normalized.get(f"{variant}_url"),
            normalized.get(f"{variant}_verified_url"),
        ]
        candidates.extend(normalized.get(f"{variant}_urls") or [])
        cached_from = normalized.get("cached_from")
        if isinstance(cached_from, dict):
            candidates.append(cached_from.get(variant))
        for candidate in candidates:
            match = AVATAR_IMAGE_URL.search(str(candidate or ""))
            if not match:
                continue
            _, postfix, detected_suffix = match.groups()
            if detected_suffix == suffix:
                normalized[f"{variant}_postfix"] = postfix.lower()
                break
    return normalized


def image_postfix(value: Any, suffix: str | None) -> str:
    """Return the hash encoded in one canonical avatar image URL, if any."""
    match = AVATAR_IMAGE_URL.search(str(value or ""))
    if not match:
        return ""
    _, postfix, detected_suffix = match.groups()
    return postfix.lower() if detected_suffix == suffix else ""


def cached_postfix(record: dict[str, Any], variant: str, suffix: str | None) -> str:
    """Find the hash represented by an existing local cache entry.

    Cache files are named only by avatar id and variant.  Persisting the hash
    prevents a later avatar appearance from being silently served as an old
    portrait merely because a PNG already exists at that path.
    """
    explicit = str(record.get(f"{variant}_cached_postfix") or "").lower()
    if HASH.fullmatch(explicit):
        return explicit

    for value in (
        record.get(f"{variant}_verified_url"),
        record.get(f"{variant}_url"),
        (record.get("cached_from") or {}).get(variant)
        if isinstance(record.get("cached_from"), dict) else "",
    ):
        found = image_postfix(value, suffix)
        if found:
            return found
    return ""


def is_authoritative_avatar_url(value: Any, avatar_id: str, variant: str) -> bool:
    """Validate a URL returned by the game without trying to derive its hash.

    Find Friends returns the exact current image URL in ``AvatarIdentity``.
    The opaque component after the avatar id is server-generated and not a
    stable contract, so deliberately validate only the trusted content origin,
    avatar id, and requested image variant.  This accepts real URL exceptions
    that do not use the legacy 32-hex postfix form.
    """
    expected_suffix = VARIANT_SUFFIXES[variant]
    try:
        parsed = urlsplit(str(value or ""))
    except ValueError:
        return False
    if parsed.scheme != "https" or (parsed.hostname or "").lower() != AVATAR_CONTENT_HOST:
        return False
    if parsed.username or parsed.password or parsed.port:
        return False
    path = parsed.path
    if not path.startswith(AVATAR_CONTENT_PREFIX):
        return False
    filename = path[len(AVATAR_CONTENT_PREFIX):]
    if "/" in filename or not filename.lower().startswith(avatar_id.lower()):
        return False
    if not filename.lower().endswith(expected_suffix):
        return False
    if variant == "head" and filename.lower().endswith(("_thumb.png", "_snap.png")):
        return False
    return True


def authoritative_variant_url(entry: dict[str, Any], avatar_id: str, variant: str) -> str:
    """Return the literal game-returned URL for a portrait variant, if present.

    This is intentionally ahead of the old postfix reconstruction fallback.
    Captured Find Friends results are authoritative and must survive even when
    their opaque filename suffix cannot be parsed by the legacy RTMP path.
    """
    candidates: list[Any] = [
        entry.get(f"{variant}_source_url"),
        entry.get(f"{variant}_verified_url"),
        entry.get(f"{variant}_url"),
    ]
    candidate_list = entry.get(f"{variant}_urls")
    if isinstance(candidate_list, list):
        candidates.extend(candidate_list)
    cached_from = entry.get("cached_from")
    if isinstance(cached_from, dict):
        candidates.append(cached_from.get(variant))
    for candidate in candidates:
        if is_authoritative_avatar_url(candidate, avatar_id, variant):
            return str(candidate)
    return ""


def source_fingerprint(url: str) -> str:
    """Stable cache key for the exact URL the game returned."""
    return hashlib.sha256(url.encode("utf-8")).hexdigest()


def merge_identity_metadata(record: dict[str, Any], entry: dict[str, Any]) -> None:
    """Carry Find Friends identity fields into the private avatar URL index.

    Owner-to-avatar association remains Observatory evidence; this only fills
    the avatar's own name and current game portrait metadata.
    """
    for field in IDENTITY_FIELDS:
        value = entry.get(field)
        if value not in (None, "", [], {}):
            record[field] = value
    sources = record.setdefault("sources", [])
    if not isinstance(sources, list):
        sources = record["sources"] = []
    source = str(entry.get("source") or "friend.searchForFriends")
    if source not in sources:
        sources.append(source)


def owner_avatar_ids(path: Path) -> set[str]:
    """Read the crawler's existing owner/avatar joins without changing them."""
    try:
        payload = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return set()
    profiles = payload.get("profiles") if isinstance(payload, dict) else None
    if not isinstance(profiles, dict):
        return set()
    values: set[str] = set()
    for profile in profiles.values():
        owners = profile.get("owners") if isinstance(profile, dict) else None
        if not isinstance(owners, list):
            continue
        for owner in owners:
            avatar_id = str(owner.get("avatar_id") or "").lower() if isinstance(owner, dict) else ""
            if AVATAR_ID.fullmatch(avatar_id):
                values.add(avatar_id)
    return values


class CDP:
    def __init__(self, port: int, page_hint: str):
        pages = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=8))
        page = next((entry for entry in pages if page_hint in str(entry.get("url", ""))), None)
        if not page:
            page = next((entry for entry in pages if entry.get("type") == "page" and str(entry.get("url", "")).startswith("https://www.smallverse.app/")), None)
        if not page:
            raise RuntimeError("no signed-in Smallverse Chromium page is available")
        endpoint = str(page["webSocketDebuggerUrl"])
        host_port, path = endpoint[5:].split("/", 1)
        host, port_s = host_port.rsplit(":", 1)
        self.sock = socket.create_connection((host, int(port_s)), timeout=10)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall((
            f"GET /{path} HTTP/1.1\r\nHost: {host_port}\r\nUpgrade: websocket\r\n"
            f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        ).encode())
        if b" 101 " not in self.sock.recv(4096):
            raise RuntimeError("Chromium DevTools websocket upgrade failed")
        self.message_id = 0

    def _send(self, value: dict[str, Any]) -> None:
        body = json.dumps(value, separators=(",", ":")).encode()
        mask = os.urandom(4)
        size = len(body)
        if size < 126:
            header = bytes((0x81, 0x80 | size))
        elif size < 65536:
            header = bytes((0x81, 0xFE)) + struct.pack("!H", size)
        else:
            header = bytes((0x81, 0xFF)) + struct.pack("!Q", size)
        self.sock.sendall(header + mask + bytes(byte ^ mask[index % 4] for index, byte in enumerate(body)))

    def _receive(self) -> str:
        first = self.sock.recv(2)
        if len(first) != 2:
            raise RuntimeError("DevTools websocket closed")
        length = first[1] & 0x7F
        if length == 126:
            length = struct.unpack("!H", self.sock.recv(2))[0]
        elif length == 127:
            length = struct.unpack("!Q", self.sock.recv(8))[0]
        chunks = bytearray()
        while len(chunks) < length:
            chunk = self.sock.recv(length - len(chunks))
            if not chunk:
                raise RuntimeError("DevTools websocket closed while reading")
            chunks.extend(chunk)
        return chunks.decode()

    def evaluate(self, expression: str) -> Any:
        self.message_id += 1
        current = self.message_id
        self._send({"id": current, "method": "Runtime.evaluate", "params": {
            "expression": expression, "awaitPromise": True, "returnByValue": True
        }})
        while True:
            message = json.loads(self._receive())
            if message.get("id") != current:
                continue
            result = message.get("result", {}).get("result", {})
            if result.get("subtype") == "error":
                raise RuntimeError(str(result.get("description") or "browser fetch failed"))
            return result.get("value")


def browser_download(cdp: CDP, url: str) -> tuple[int, bytes]:
    expression = (
        "fetch(" + json.dumps(url) + ",{credentials:'include',cache:'no-store'})"
        ".then(async r=>JSON.stringify({status:r.status,body:btoa(String.fromCharCode(...new Uint8Array(await r.arrayBuffer())))}))"
    )
    raw = cdp.evaluate(expression)
    response = json.loads(str(raw))
    return int(response.get("status") or 0), base64.b64decode(str(response.get("body") or ""))


def direct_download(url: str) -> tuple[int, bytes]:
    request = urllib.request.Request(url, headers={
        "Accept": "image/png,image/*;q=0.8",
        "User-Agent": "Smallverse-Beacon/1.0",
    })
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return int(response.status), response.read()
    except urllib.error.HTTPError as error:
        return int(error.code), error.read()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True, help="RTMP extracted manifest with avatar ids and *_postfix fields")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--avatar-index", type=Path)
    parser.add_argument(
        "--owner-avatar-ids-from",
        type=Path,
        help="Only cache IDs that already occur in this preserved item-profile owner set.",
    )
    parser.add_argument(
        "--include-avatar-index",
        action="store_true",
        help="Also retry preserved avatar-index records; live RTMP records keep precedence.",
    )
    parser.add_argument("--cdp-port", type=int, default=19992)
    parser.add_argument("--page-hint", default="smallverse.app")
    parser.add_argument(
        "--transport", choices=("auto", "direct", "cdp"), default="auto",
        help="Use direct authoritative URLs, CDP, or direct with CDP fallback.",
    )
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument(
        "--variants",
        default="head,thumb,snapshot",
        help="Comma-separated portrait variants to cache (head,thumb,snapshot)",
    )
    args = parser.parse_args()

    payload = json.loads(args.manifest.read_text())
    index: dict[str, Any] = {"contract": "smallverse-avatar-url-index/v1", "by_avatar_id": {}}
    if args.avatar_index and args.avatar_index.is_file():
        index = json.loads(args.avatar_index.read_text())
        index.setdefault("by_avatar_id", {})
    cdp: CDP | None = None
    requested_variants = {
        value.strip().lower()
        for value in str(args.variants).split(",")
        if value.strip()
    }
    unknown_variants = requested_variants - {"head", "thumb", "snapshot"}
    if unknown_variants:
        raise SystemExit(f"unknown --variants: {', '.join(sorted(unknown_variants))}")
    source_records = merge_records(
        payload,
        index if args.include_avatar_index else None,
    )
    if args.owner_avatar_ids_from:
        owner_ids = owner_avatar_ids(args.owner_avatar_ids_from)
        source_records = [
            entry
            for entry in source_records
            if str(entry.get("avatar_id") or "").lower() in owner_ids
        ]
    cached: list[str] = []
    unavailable: list[dict[str, Any]] = []
    for raw_entry in source_records:
        entry = fill_postfixes(raw_entry)
        avatar_id = str(entry.get("avatar_id") or "").lower()
        if not AVATAR_ID.fullmatch(avatar_id):
            continue
        if args.limit and len(cached) >= args.limit:
            break
        record = index["by_avatar_id"].setdefault(avatar_id, {"avatar_id": avatar_id})
        merge_identity_metadata(record, entry)
        saved = False
        for variant, suffix, filename in (("head", "", "head.png"), ("thumb", "_thumb", "thumb.png"), ("snapshot", "_snap", "snapshot.png")):
            if variant not in requested_variants:
                continue
            # First use the literal signed-in game URL returned by Find
            # Friends.  A legacy RTMP manifest can still fall back to its
            # known postfix, but never takes precedence over the SWF result.
            url = authoritative_variant_url(entry, avatar_id, variant)
            postfix = str(entry.get(f"{variant}_postfix") or "").lower()
            if not url:
                if not HASH.fullmatch(postfix):
                    continue
                url = f"https://content.smallverse.app/uploads/avatars/{avatar_id}{postfix}{suffix}.png"
            destination = args.output_dir / avatar_id / filename
            reference = source_fingerprint(url)
            local_hash = cached_postfix(record, variant, suffix or None)
            if (
                destination.is_file()
                and destination.read_bytes().startswith(PNG)
                and (
                    str(record.get(f"{variant}_source_fingerprint") or "") == reference
                    or (HASH.fullmatch(postfix) and local_hash == postfix)
                )
            ):
                data, status = destination.read_bytes(), 200
            else:
                status, data = 0, b""
                errors: list[str] = []
                if args.transport in {"auto", "direct"}:
                    try:
                        status, data = direct_download(url)
                    except Exception as error:
                        errors.append(f"direct: {error}")
                if (status != 200 or not data.startswith(PNG)) and args.transport in {"auto", "cdp"}:
                    try:
                        if cdp is None:
                            cdp = CDP(args.cdp_port, args.page_hint)
                        status, data = browser_download(cdp, url)
                    except Exception as error:
                        errors.append(f"cdp: {error}")
                if errors and (status != 200 or not data.startswith(PNG)):
                    unavailable.append({"avatar_id": avatar_id, "variant": variant, "error": "; ".join(errors)})
                    continue
            if status != 200 or not data.startswith(PNG):
                unavailable.append({"avatar_id": avatar_id, "variant": variant, "status": status})
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
            # The cache is eventually synced to static/avatar-thumbnails, so
            # write its real public same-origin route now.  Do not make the UI
            # depend on a nonexistent API image endpoint.
            record[f"{variant}_url"] = f"/avatar-thumbnails/{avatar_id}/{filename}"
            record[f"{variant}_verified_url"] = url
            record[f"{variant}_source_url"] = url
            record[f"{variant}_source_fingerprint"] = reference
            record.setdefault("cached_from", {})[variant] = url
            if HASH.fullmatch(postfix):
                record[f"{variant}_cached_postfix"] = postfix
            saved = True
        if saved:
            cached.append(avatar_id)
    if args.avatar_index:
        args.avatar_index.parent.mkdir(parents=True, exist_ok=True)
        args.avatar_index.write_text(json.dumps(index, indent=2) + "\n")
    print(json.dumps({"ok": True, "cached_avatar_ids": cached, "cached_count": len(cached), "unavailable": unavailable}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
