#!/usr/bin/env python3
"""SWF-accurate helpers for the read-only Find Friends gateway call.

The game sends ``friend.searchForFriends`` through ``AMFHTTPEndpoint``.  This
module deliberately contains only the non-secret protocol mechanics recovered
from the shipped SWF and a user-provided capture.  Session cookies, gateway
paths, and downloaded images belong to the VPS worker and are never emitted by
these helpers.
"""
from __future__ import annotations

import hashlib
import base64
import re
import time
import zlib
import xml.etree.ElementTree as ET
from typing import Any

from smallverse_amf import decode_remoting_envelope


# ``AMFEndpoint.ARGUMENT_AUTH_KEY`` in the recovered main SWF.
ARGUMENT_AUTH_KEY = "caXBGo4b"
METHOD = "friend.searchForFriends"
OWNER_AVATARS_METHOD = "avatarcore.getUsersAvatars"
AVATAR_ID = re.compile(r"^[0-9a-f]{24}$", re.I)
OWNER_ID = re.compile(r"^[0-9a-f]{24}$", re.I)
PROCESS_STARTED_AT = time.monotonic()


def _avatar_config_xml(avatar: dict[str, Any]) -> str:
    """Accept a config only when the service returned a complete avatar XML."""
    value = next((avatar.get(key) for key in (
        "config", "avatarConfig", "avatar_config", "compressedConfig",
        "compressed_config", "bodyConfig", "body_config"
    ) if avatar.get(key)), None)
    if not isinstance(value, str):
        return ""
    candidates = [value.strip()]
    try:
        raw = base64.b64decode(value, validate=True)
        for wbits in (zlib.MAX_WBITS, -zlib.MAX_WBITS):
            try:
                candidates.append(zlib.decompress(raw, wbits).decode("utf-8"))
                break
            except (zlib.error, UnicodeDecodeError):
                continue
    except (ValueError, TypeError):
        pass
    for candidate in candidates:
        try:
            root = ET.fromstring(candidate)
        except ET.ParseError:
            continue
        if root.tag == "avatar":
            return candidate
    return ""


def normalize_query(value: str) -> str:
    """Match the Find Friends panel's ordinary text-search input shape."""
    query = str(value or "").strip().lower()
    if len(query) < 2:
        raise ValueError("Find Friends requires a query of at least two characters")
    if len(query) > 100:
        raise ValueError("Find Friends query is too long")
    return query


def make_auth_context(query: str, timer_ms: int | None = None) -> str:
    """Reproduce ``AMFEndpoint.addAuthenticationToken`` for this call.

    ``FriendService.searchForFriends(callback, query, true)`` provides one
    string and one Boolean argument.  The SWF includes strings/numbers in the
    hash input but *not* Booleans, so the input is exactly::

        caXBGo4b + getTimer() + query

    The produced context is the first element in the AMF argument array.  A
    supplied ``timer_ms`` makes capture fixtures deterministic.  The default
    is a process-relative millisecond clock, the closest host-side equivalent
    when this helper is used outside the Flash VM.
    """
    query = normalize_query(query)
    if timer_ms is None:
        timer_ms = int((time.monotonic() - PROCESS_STARTED_AT) * 1000)
    if isinstance(timer_ms, bool) or int(timer_ms) < 0:
        raise ValueError("timer_ms must be a non-negative integer")
    timer = str(int(timer_ms))
    # The SWF truncates every string argument to 256 characters before hashing.
    digest_input = f"{ARGUMENT_AUTH_KEY}{timer}{query[:256]}"
    digest = hashlib.md5(digest_input.encode("utf-8")).hexdigest()
    return f"{digest},{timer}"


def make_owner_avatars_auth_context(
    owner_id: str,
    timer_ms: int | None = None,
) -> str:
    """Build the SWF authentication context for ``getUsersAvatars``.

    ``AvatarService.getUsersAvatars`` passes exactly one string argument: the
    owner/user id.  Like Find Friends, this context is evidence-compatible
    with ``AMFEndpoint.addAuthenticationToken`` and does not guess any avatar
    id from the owner id.
    """
    owner_id = str(owner_id or "").strip().lower()
    if not OWNER_ID.fullmatch(owner_id):
        raise ValueError("owner_id must be a 24-character hexadecimal id")
    if timer_ms is None:
        timer_ms = int((time.monotonic() - PROCESS_STARTED_AT) * 1000)
    if isinstance(timer_ms, bool) or int(timer_ms) < 0:
        raise ValueError("timer_ms must be a non-negative integer")
    timer = str(int(timer_ms))
    digest_input = f"{ARGUMENT_AUTH_KEY}{timer}{owner_id[:256]}"
    digest = hashlib.md5(digest_input.encode("utf-8")).hexdigest()
    return f"{digest},{timer}"


def _utf(value: str) -> bytes:
    raw = value.encode("utf-8")
    if len(raw) > 0xFFFF:
        raise ValueError("AMF short string too long")
    return len(raw).to_bytes(2, "big") + raw


def _amf0_string(value: str) -> bytes:
    return b"\x02" + _utf(value)


def build_request(
    query: str,
    *,
    call_id: int = 1,
    timer_ms: int | None = None,
) -> bytes:
    """Build the one-message AMF v3 envelope the Find Friends panel sends."""
    query = normalize_query(query)
    if isinstance(call_id, bool) or int(call_id) < 1:
        raise ValueError("call_id must be a positive integer")
    context = make_auth_context(query, timer_ms)
    body = (
        b"\x0a" + (3).to_bytes(4, "big") +
        _amf0_string(context) +
        _amf0_string(query) +
        b"\x01\x01"  # AMF0 Boolean true: include broad, not friend-only matches.
    )
    target = METHOD.encode("utf-8")
    response = f"/{int(call_id)}".encode("utf-8")
    return (
        b"\x00\x03" +  # remoting envelope version 3
        b"\x00\x00" +  # no headers
        b"\x00\x01" +  # one message
        len(target).to_bytes(2, "big") + target +
        len(response).to_bytes(2, "big") + response +
        len(body).to_bytes(4, "big") + body
    )


def build_owner_avatars_request(
    owner_id: str,
    *,
    call_id: int = 1,
    timer_ms: int | None = None,
) -> bytes:
    """Build ``avatarcore.getUsersAvatars(ownerId)`` as shipped by the SWF."""
    owner_id = str(owner_id or "").strip().lower()
    if not OWNER_ID.fullmatch(owner_id):
        raise ValueError("owner_id must be a 24-character hexadecimal id")
    if isinstance(call_id, bool) or int(call_id) < 1:
        raise ValueError("call_id must be a positive integer")
    context = make_owner_avatars_auth_context(owner_id, timer_ms)
    body = (
        b"\x0a" + (2).to_bytes(4, "big") +
        _amf0_string(context) +
        _amf0_string(owner_id)
    )
    target = OWNER_AVATARS_METHOD.encode("utf-8")
    response = f"/{int(call_id)}".encode("utf-8")
    return (
        b"\x00\x03" +
        b"\x00\x00" +
        b"\x00\x01" +
        len(target).to_bytes(2, "big") + target +
        len(response).to_bytes(2, "big") + response +
        len(body).to_bytes(4, "big") + body
    )


def _class_tail(value: Any) -> str:
    return str((value or {}).get("__class__") or "").rsplit(".", 1)[-1]


def _text(value: Any) -> str:
    return value if isinstance(value, str) else ""


def avatar_rows(response: bytes, query: str = "") -> list[dict[str, Any]]:
    """Return identity/portrait rows from a real Find Friends AMF response.

    The response source of truth is ``Person.avatar`` (an ``AvatarIdentity``),
    not ``Person.avatarId``: captures show the latter is null.  URLs are kept
    verbatim because their suffixes are server-generated and cannot safely be
    inferred from an avatar id.
    """
    rows: dict[str, dict[str, Any]] = {}
    for message in decode_remoting_envelope(response):
        body = message.body
        if not isinstance(body, dict):
            continue
        candidates = body.get("list")
        if not isinstance(candidates, list):
            continue  # successful empty result and ErrorResult are both valid.
        for person in candidates:
            if not isinstance(person, dict):
                continue
            avatar = person.get("avatar")
            if not isinstance(avatar, dict):
                continue
            user = person.get("user")
            if not isinstance(user, dict):
                user = {}
            owner_id = _text(user.get("id")).lower()
            if not OWNER_ID.fullmatch(owner_id):
                owner_id = ""
            avatar_id = _text(avatar.get("id")).lower()
            if not AVATAR_ID.fullmatch(avatar_id):
                continue
            first = _text(avatar.get("firstName"))
            last = _text(avatar.get("lastName"))
            name = " ".join(part for part in (first, last) if part).strip()
            rows[avatar_id] = {
                "owner_id": owner_id,
                "owner_first_name": _text(user.get("firstName")),
                "owner_last_name": _text(user.get("lastName")),
                "avatar_id": avatar_id,
                "first_name": first,
                "last_name": last,
                "display_name": name or avatar_id,
                "gender": _text(avatar.get("gender")),
                "home_space_id": _text(avatar.get("homeSpaceId")),
                "current_space_id": _text(avatar.get("currentSpaceId")),
                "current_instance_id": _text(avatar.get("currentInstanceId")),
                "head_url": _text(avatar.get("headUrl")),
                "thumb_url": _text(avatar.get("thumbUrl")),
                "snapshot_url": _text(avatar.get("snapshotUrl")),
                "online": avatar.get("online"),
                "is_friend": avatar.get("isFriend"),
                "is_reciprocal": avatar.get("isReciprocal"),
                "source_query": normalize_query(query) if query else "",
                "source_class": _class_tail(person),
                "relationship_basis": (
                    "friend.searchForFriends:Person.user.id+Person.avatar.id"
                    if owner_id else ""
                ),
                # A Find Friends result proves that this avatar was publicly
                # returned for the owner at observation time. It does not
                # prove that the avatar is the account default or primary.
                "default_state": None,
                "selected_state": None,
            }
    return list(rows.values())


def owner_avatar_rows(response: bytes, owner_id: str) -> list[dict[str, Any]]:
    """Decode the owner's actual avatar list returned by the shipped service.

    ``UserAvatar.isDefault`` is the only field in this response that is used
    as primary/default evidence. ``active`` is preserved as lifecycle data;
    it is deliberately not interpreted as the account's selected avatar.
    """
    owner_id = str(owner_id or "").strip().lower()
    if not OWNER_ID.fullmatch(owner_id):
        raise ValueError("owner_id must be a 24-character hexadecimal id")

    rows: dict[str, dict[str, Any]] = {}
    for message in decode_remoting_envelope(response):
        body = message.body
        if not isinstance(body, dict):
            continue
        candidates = body.get("list")
        if not isinstance(candidates, list):
            continue
        for avatar in candidates:
            if not isinstance(avatar, dict):
                continue
            avatar_type = avatar.get("type")
            # UserAvatar.TYPE_USER == 1. Missing type is accepted because
            # older captures omit it, but explicit pet/NPC rows are excluded.
            if avatar_type not in (None, 1, 1.0):
                continue
            avatar_id = _text(
                avatar.get("id") or avatar.get("avatarId") or avatar.get("avatar_id")
            ).lower()
            if not AVATAR_ID.fullmatch(avatar_id):
                continue
            first = _text(avatar.get("fName") or avatar.get("firstName"))
            last = _text(avatar.get("lName") or avatar.get("lastName"))
            full = _text(avatar.get("fullName"))
            is_default = avatar.get("isDefault")
            if not isinstance(is_default, bool):
                is_default = None
            active = avatar.get("active")
            if not isinstance(active, bool):
                active = None
            config_xml = _avatar_config_xml(avatar)
            rows[avatar_id] = {
                "owner_id": owner_id,
                "avatar_id": avatar_id,
                "first_name": first,
                "last_name": last,
                "display_name": full or " ".join(
                    part for part in (first, last) if part
                ).strip() or avatar_id,
                "name_instance": avatar.get("nameInstance"),
                "thumb_url": _text(avatar.get("thumbUrl")),
                "snapshot_url": _text(avatar.get("snapshotUrl")),
                "head_url": _text(avatar.get("headUrl")),
                "is_default": is_default,
                "active": active,
                "created": avatar.get("created"),
                "relationship_basis": "avatarcore.getUsersAvatars(ownerId)",
                "default_basis": (
                    "avatarcore.getUsersAvatars:isDefault"
                    if is_default is not None else ""
                ),
                "selected_state": None,
                "config_xml": config_xml,
                "config_sha256": hashlib.sha256(config_xml.encode()).hexdigest() if config_xml else "",
            }
    return list(rows.values())
