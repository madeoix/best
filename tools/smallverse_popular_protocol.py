#!/usr/bin/env python3
"""Protocol and manifest helpers for Smallverse's live Popular-space list.

The recovered client performs two read-only AMF calls:

``catalog_category.getActiveSpaceCategoryTree()``
    Resolve the current server-owned Popular category id.

``catalog_entry.getSpacesForCategory(categoryId, offset, limit)``
    Read the category's current space records and visitor counts.

This module contains no browser/session handling.  In particular, gateway
URLs, cookies, and credentials are neither accepted nor serialized here.
"""
from __future__ import annotations

import hashlib
import math
import re
import struct
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable
from urllib.parse import urlparse

from smallverse_amf import decode_remoting_envelope


ARGUMENT_AUTH_KEY = "caXBGo4b"
CATEGORY_TREE_METHOD = "catalog_category.getActiveSpaceCategoryTree"
SPACES_METHOD = "catalog_entry.getSpacesForCategory"
POPULAR_API_PATH = "/api/space/popular"
MANIFEST_CONTRACT = "smallverse-popular-spaces/v2"
SPACE_ID = re.compile(r"^[0-9a-f]{32}$", re.I)
AVATAR_ID = re.compile(r"^[0-9a-f]{24}$", re.I)
PROCESS_STARTED_AT = time.monotonic()

AMF_SOURCE = {
    "transport": "crawler-browser-cdp-amf",
    "category_method": CATEGORY_TREE_METHOD,
    "spaces_method": SPACES_METHOD,
}
API_SOURCE = {
    "transport": "crawler-browser-cdp-json",
    "method": "GET",
    "path": POPULAR_API_PATH,
}


class PopularProtocolError(ValueError):
    """The live AMF response or exported manifest violated its contract."""


def _utf(value: str) -> bytes:
    raw = value.encode("utf-8")
    if len(raw) > 0xFFFF:
        raise ValueError("AMF short string too long")
    return len(raw).to_bytes(2, "big") + raw


def _amf0_value(value: Any) -> bytes:
    if isinstance(value, str):
        return b"\x02" + _utf(value)
    if isinstance(value, bool):
        return b"\x01" + (b"\x01" if value else b"\x00")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        number = float(value)
        if not math.isfinite(number):
            raise ValueError("AMF number must be finite")
        return b"\x00" + struct.pack(">d", number)
    raise TypeError(f"unsupported Popular AMF argument: {type(value).__name__}")


def _flash_number(value: int | float) -> str:
    """Format the integer paging values like ActionScript ``toString``."""
    number = float(value)
    if not math.isfinite(number):
        raise ValueError("authentication number must be finite")
    if number.is_integer():
        return str(int(number))
    return format(number, ".15g")


def make_auth_context(arguments: Iterable[Any], timer_ms: int | None = None) -> str:
    """Mirror ``AMFEndpoint.addAuthenticationToken`` from the recovered SWF."""
    if timer_ms is None:
        timer_ms = int((time.monotonic() - PROCESS_STARTED_AT) * 1000)
    if isinstance(timer_ms, bool) or int(timer_ms) < 0:
        raise ValueError("timer_ms must be a non-negative integer")

    material = ""
    for value in arguments:
        if isinstance(value, str):
            material += value[:256]
        elif isinstance(value, (int, float)) and not isinstance(value, bool):
            material += _flash_number(value)
        # ActionScript intentionally excludes Boolean/object arguments.
    if not material:
        raise ValueError("the recovered SWF does not authenticate an empty argument list")

    timer = str(int(timer_ms))
    digest = hashlib.md5(f"{ARGUMENT_AUTH_KEY}{timer}{material}".encode("utf-8")).hexdigest()
    return f"{digest},{timer}"


def _build_request(method: str, arguments: list[Any], call_id: int) -> bytes:
    if isinstance(call_id, bool) or int(call_id) < 1:
        raise ValueError("call_id must be a positive integer")
    body = b"\x0a" + len(arguments).to_bytes(4, "big")
    body += b"".join(_amf0_value(value) for value in arguments)
    target = method.encode("utf-8")
    response = f"/{int(call_id)}".encode("utf-8")
    return (
        b"\x00\x03"  # AMF remoting envelope v3
        b"\x00\x00"  # no headers
        b"\x00\x01"  # one message
        + len(target).to_bytes(2, "big") + target
        + len(response).to_bytes(2, "big") + response
        + len(body).to_bytes(4, "big") + body
    )


def build_category_tree_request(*, call_id: int = 1) -> bytes:
    """Build the no-argument category call exactly as ``AMFEndpoint`` does."""
    return _build_request(CATEGORY_TREE_METHOD, [], call_id)


def build_spaces_request(
    category_id: str,
    offset: int = 0,
    limit: int = 12,
    *,
    call_id: int = 2,
    timer_ms: int | None = None,
) -> bytes:
    """Build the authenticated Popular category page request."""
    category_id = str(category_id or "").strip().lower()
    if not SPACE_ID.fullmatch(category_id):
        raise ValueError("category_id must be 32 hexadecimal characters")
    if isinstance(offset, bool) or int(offset) < 0:
        raise ValueError("offset must be a non-negative integer")
    if isinstance(limit, bool) or not 1 <= int(limit) <= 500:
        raise ValueError("limit must be between 1 and 500")
    arguments: list[Any] = [category_id, int(offset), int(limit)]
    context = make_auth_context(arguments, timer_ms)
    return _build_request(SPACES_METHOD, [context, *arguments], call_id)


def _one_success_body(response: bytes, label: str) -> dict[str, Any]:
    try:
        messages = decode_remoting_envelope(response)
    except Exception as exc:
        raise PopularProtocolError(f"{label} was not a valid AMF response") from exc
    if len(messages) != 1:
        raise PopularProtocolError(f"{label} must contain exactly one AMF message")
    message = messages[0]
    if not message.target.endswith("/onResult"):
        raise PopularProtocolError(f"{label} did not return an onResult message")
    if not isinstance(message.body, dict) or message.body.get("success") is not True:
        raise PopularProtocolError(f"{label} did not return a successful result")
    return message.body


def _category_rows(values: Any) -> Iterable[dict[str, Any]]:
    if not isinstance(values, list):
        raise PopularProtocolError("category tree result did not contain a list")
    for value in values:
        if not isinstance(value, dict):
            raise PopularProtocolError("category tree contained a non-object row")
        yield value
        children = value.get("children")
        if children is not None:
            yield from _category_rows(children)


def decode_popular_category(response: bytes) -> dict[str, Any]:
    """Resolve one unambiguous Popular category from the active category tree."""
    body = _one_success_body(response, "active category tree")
    rows = list(_category_rows(body.get("list")))
    valid: list[dict[str, Any]] = []
    for row in rows:
        category_id = str(row.get("id") or "").strip().lower()
        name = str(row.get("name") or "").strip()
        if SPACE_ID.fullmatch(category_id):
            valid.append({
                "id": category_id,
                "name": name,
                "active": row.get("active"),
                "isControlledByPopularity": row.get("isControlledByPopularity") is True,
            })

    exact = [row for row in valid if row["name"].casefold() == "popular"]
    candidates = exact or [row for row in valid if row["isControlledByPopularity"]]
    candidates = [row for row in candidates if row["active"] is not False]
    unique = {row["id"]: row for row in candidates}
    if len(unique) != 1:
        raise PopularProtocolError(
            "active category tree did not identify exactly one Popular category"
        )
    return next(iter(unique.values()))


def _whole_nonnegative(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise PopularProtocolError(f"{field} must be a number")
    number = float(value)
    if not math.isfinite(number) or number < 0 or not number.is_integer():
        raise PopularProtocolError(f"{field} must be a non-negative whole number")
    return int(number)


def decode_space_page(response: bytes) -> dict[str, Any]:
    """Decode one ``SpacePanelItem`` record-set response without guessing ids."""
    body = _one_success_body(response, "Popular spaces page")
    records = body.get("recordSet")
    if not isinstance(records, list):
        raise PopularProtocolError("Popular spaces result did not contain a recordSet")

    spaces: list[dict[str, Any]] = []
    for source_order, row in enumerate(records):
        if not isinstance(row, dict):
            raise PopularProtocolError("Popular spaces result contained a non-object row")
        space_id = str(row.get("id") or "").strip().lower()
        if not SPACE_ID.fullmatch(space_id):
            raise PopularProtocolError("Popular space row had an invalid id")
        visitors = _whole_nonnegative(row.get("currentVisitors"), "currentVisitors")
        space: dict[str, Any] = {
            "space_id": space_id,
            "currentVisitors": visitors,
            "source_order": source_order,
        }
        optional = {
            "name": row.get("desc"),
            "owner_id": row.get("spaceOwner"),
            "avatar_id": row.get("avatarId"),
            "avatar_first_name": row.get("avatarFName"),
            "avatar_last_name": row.get("avatarLName"),
        }
        for key, value in optional.items():
            text = str(value or "").strip()
            if not text:
                continue
            if key in ("owner_id", "avatar_id") and not AVATAR_ID.fullmatch(text):
                continue
            space[key] = text.lower() if key in ("owner_id", "avatar_id") else text
        spaces.append(space)

    return {
        "start_index": _whole_nonnegative(body.get("startIndex", 0), "startIndex"),
        "total_count": _whole_nonnegative(body.get("totalCount", 0), "totalCount"),
        "spaces": spaces,
    }


def popular_api_rows(payload: Any) -> list[dict[str, Any]]:
    """Normalize the current web client's ``/api/space/popular`` result."""
    if not isinstance(payload, list):
        raise PopularProtocolError("live Popular API result must be a list")
    rows: list[dict[str, Any]] = []
    for source_order, raw in enumerate(payload):
        if not isinstance(raw, dict):
            raise PopularProtocolError("live Popular API contained a non-object row")
        space_id = str(raw.get("spaceId") or "").strip().lower()
        if not SPACE_ID.fullmatch(space_id):
            raise PopularProtocolError("live Popular API row had an invalid spaceId")
        visitors = _whole_nonnegative(raw.get("visitors"), "visitors")
        row: dict[str, Any] = {
            "space_id": space_id,
            "currentVisitors": visitors,
            "source_order": source_order,
        }
        name = str(raw.get("desc") or "").strip()
        if name:
            row["name"] = name
        snapshot = str(raw.get("snapShot") or "").strip()
        if snapshot:
            parsed = urlparse(snapshot)
            if parsed.scheme != "https" or parsed.hostname != "content.smallverse.app":
                raise PopularProtocolError("live Popular API row had an untrusted snapshot URL")
            row["snapshot_url"] = snapshot
        rows.append(row)
    return rows


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _timestamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_timestamp(value: Any, field: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError) as exc:
        raise PopularProtocolError(f"{field} must be an ISO-8601 timestamp") from exc
    if parsed.tzinfo is None:
        raise PopularProtocolError(f"{field} must include a timezone")
    return parsed.astimezone(timezone.utc)


def build_manifest(
    category: dict[str, Any],
    spaces: Iterable[dict[str, Any]],
    *,
    generated_at: datetime | None = None,
    fresh_for_seconds: int = 300,
    source: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a sorted, versioned manifest from one authoritative live read."""
    if not 30 <= int(fresh_for_seconds) <= 3600:
        raise ValueError("fresh_for_seconds must be between 30 and 3600")
    generated = (generated_at or utc_now()).astimezone(timezone.utc)
    category_id = str(category.get("id") or "").strip().lower()
    category_name = str(category.get("name") or "").strip()
    source_contract = dict(source or AMF_SOURCE)
    is_api = source_contract == API_SOURCE
    if category_name.casefold() != "popular":
        raise PopularProtocolError("cannot export a manifest for a non-Popular category")
    if not is_api and not SPACE_ID.fullmatch(category_id):
        raise PopularProtocolError("AMF Popular category must have a valid id")

    by_id: dict[str, dict[str, Any]] = {}
    for source_index, raw in enumerate(spaces):
        if not isinstance(raw, dict):
            raise PopularProtocolError("Popular manifest source contained a non-object row")
        space_id = str(raw.get("space_id") or "").strip().lower()
        if not SPACE_ID.fullmatch(space_id):
            raise PopularProtocolError("Popular manifest source contained an invalid space id")
        visitors = _whole_nonnegative(raw.get("currentVisitors"), "currentVisitors")
        row = dict(raw)
        row["space_id"] = space_id
        row["currentVisitors"] = visitors
        row["source_order"] = int(raw.get("source_order", source_index))
        previous = by_id.get(space_id)
        if previous is None or visitors > previous["currentVisitors"]:
            by_id[space_id] = row

    ordered = sorted(
        by_id.values(),
        key=lambda row: (-row["currentVisitors"], row["source_order"], row["space_id"]),
    )
    if not ordered or not any(row["currentVisitors"] > 0 for row in ordered):
        raise PopularProtocolError("live Popular response contained no occupied spaces")
    for rank, row in enumerate(ordered, 1):
        row["rank"] = rank

    expires = generated + timedelta(seconds=int(fresh_for_seconds))
    manifest = {
        "contract": MANIFEST_CONTRACT,
        "generated_at": _timestamp(generated),
        "expires_at": _timestamp(expires),
        "fresh_for_seconds": int(fresh_for_seconds),
        "source": source_contract,
        "category": (
            {"name": category_name}
            if is_api
            else {"id": category_id, "name": category_name}
        ),
        "spaces": ordered,
    }
    validate_manifest(manifest, now=generated)
    return manifest


def build_api_manifest(
    spaces: Iterable[dict[str, Any]],
    *,
    generated_at: datetime | None = None,
    fresh_for_seconds: int = 300,
) -> dict[str, Any]:
    """Build a manifest from the signed-in production Popular API."""
    return build_manifest(
        {"name": "Popular"},
        spaces,
        generated_at=generated_at,
        fresh_for_seconds=fresh_for_seconds,
        source=API_SOURCE,
    )


def validate_manifest(
    payload: Any,
    *,
    now: datetime | None = None,
    max_age_seconds: int | None = None,
) -> dict[str, Any]:
    """Validate structure and freshness; stale data is never a fallback."""
    if not isinstance(payload, dict) or payload.get("contract") != MANIFEST_CONTRACT:
        raise PopularProtocolError(f"Popular manifest must use {MANIFEST_CONTRACT}")
    current = (now or utc_now()).astimezone(timezone.utc)
    generated = _parse_timestamp(payload.get("generated_at"), "generated_at")
    expires = _parse_timestamp(payload.get("expires_at"), "expires_at")
    fresh_for = payload.get("fresh_for_seconds")
    if isinstance(fresh_for, bool) or not isinstance(fresh_for, int) or not 30 <= fresh_for <= 3600:
        raise PopularProtocolError("fresh_for_seconds is outside its safe range")
    if expires != generated + timedelta(seconds=fresh_for):
        raise PopularProtocolError("expires_at does not match the manifest freshness window")
    allowed_age = fresh_for if max_age_seconds is None else min(fresh_for, int(max_age_seconds))
    if allowed_age < 1:
        raise PopularProtocolError("max_age_seconds must be positive")
    if generated > current + timedelta(seconds=30):
        raise PopularProtocolError("Popular manifest was generated in the future")
    if current > generated + timedelta(seconds=allowed_age) or current > expires:
        raise PopularProtocolError("Popular manifest is stale")

    source = payload.get("source")
    if not isinstance(source, dict) or source not in (AMF_SOURCE, API_SOURCE):
        raise PopularProtocolError("Popular manifest source is not authoritative")
    category = payload.get("category")
    if not isinstance(category, dict) \
            or str(category.get("name") or "").strip().casefold() != "popular" \
            or (source == AMF_SOURCE and not SPACE_ID.fullmatch(str(category.get("id") or ""))):
        raise PopularProtocolError("Popular manifest category is invalid")

    spaces = payload.get("spaces")
    if not isinstance(spaces, list) or not spaces:
        raise PopularProtocolError("Popular manifest contains no spaces")
    seen: set[str] = set()
    previous_visitors: int | None = None
    occupied = 0
    for index, row in enumerate(spaces, 1):
        if not isinstance(row, dict):
            raise PopularProtocolError("Popular manifest contains a non-object row")
        space_id = str(row.get("space_id") or "").lower()
        if not SPACE_ID.fullmatch(space_id) or space_id in seen:
            raise PopularProtocolError("Popular manifest contains an invalid or duplicate space id")
        seen.add(space_id)
        visitors = _whole_nonnegative(row.get("currentVisitors"), "currentVisitors")
        if row.get("rank") != index:
            raise PopularProtocolError("Popular manifest ranks are not consecutive")
        if previous_visitors is not None and visitors > previous_visitors:
            raise PopularProtocolError("Popular manifest is not ordered by currentVisitors")
        previous_visitors = visitors
        occupied += int(visitors > 0)
    if occupied == 0:
        raise PopularProtocolError("Popular manifest contains no occupied spaces")
    return payload
