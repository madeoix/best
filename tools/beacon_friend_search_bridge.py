#!/usr/bin/env python3
"""Run a read-only, SWF-accurate Find Friends call from a VPS session file.

This worker is intentionally not a login tool.  It reads an already-renewed
crawler session from the VPS-native profile vault (or an explicitly supplied
private cookie file), uses it only in-memory, and writes returned
avatar/portrait references to a mode-0600 manifest for the authenticated
portrait cache worker.  It never prints cookies, SWSIDs, gateway paths, raw
AMF, or portrait URLs.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from smallverse_friend_search_protocol import (
    OWNER_AVATARS_METHOD,
    avatar_rows,
    build_owner_avatars_request,
    build_request,
    normalize_query,
    owner_avatar_rows,
)


GATEWAY_BASE = "https://gateway.smallverse.app/gateway/;="
COOKIE_VALUE = re.compile(r"(?:^|;\s*)(JSESSIONID|SWSID)=([^;\s]+)", re.I)
FLASH_TIMER_MIN = 1_000_000
FLASH_TIMER_SPAN = 7_000_000
FLASH_TIMER_INITIAL = 1_586_786


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def flash_like_timer_ms() -> int:
    """Make a fresh, seven-digit host equivalent of Flash ``getTimer()``.

    The gateway accepts the SWF authentication context only when its timer has
    the normal shape of a running Flash client.  A raw host-uptime value can be
    far outside that range; a constant fixture would replay the same context.
    This wraps the monotonic clock into the observed seven-digit operating
    window while changing on every call.
    """
    return FLASH_TIMER_MIN + int(time.monotonic() * 1000) % FLASH_TIMER_SPAN


def read_timer_state(path: Path) -> int:
    """Return a fresh Flash-shaped timer without replaying a prior context."""
    try:
        value = json.loads(path.read_text())
        previous = int(value.get("last_timer_ms") or 0)
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        previous = 0
    candidate = previous + 1
    if FLASH_TIMER_MIN <= candidate < FLASH_TIMER_MIN + FLASH_TIMER_SPAN:
        return candidate
    return FLASH_TIMER_INITIAL


def write_timer_state(path: Path, timer_ms: int) -> None:
    atomic_json(path, {"last_timer_ms": int(timer_ms)})


def session_cookie(path: Path) -> tuple[str, str]:
    """Return the canonical cookie header and SWSID without exposing either."""
    raw = path.read_text(encoding="utf-8", errors="replace").strip()
    values = {name.upper(): value for name, value in COOKIE_VALUE.findall(raw)}
    jsession = values.get("JSESSIONID", "").strip()
    swsid = values.get("SWSID", "").strip()
    if not jsession or not swsid:
        raise ValueError("cookie file must contain both JSESSIONID and SWSID")
    return f"JSESSIONID={jsession}; SWSID={swsid}", swsid


def profile_cookie(
    workspace_root: Path,
    profile: str,
    core_root: Path,
) -> tuple[str, str]:
    """Load one crawler session from the VPS-native profile vault in memory.

    This is the normal automation path.  It deliberately relies on the
    existing crawler renewal vault instead of asking an operator to copy a
    cookie into a file or into Beacon.  ``smallverse_core`` exists only on the
    VPS, which is why the import stays inside this worker function.
    """
    # /opt/smallverse may contain a minimal deployment-time package with the
    # same name.  The authoritative session vault code lives with the VPS
    # runtime, so put that root ahead of the script directory deliberately.
    resolved_core_root = str(Path(core_root).resolve())
    if resolved_core_root not in sys.path:
        sys.path.insert(0, resolved_core_root)
    else:
        sys.path.remove(resolved_core_root)
        sys.path.insert(0, resolved_core_root)
    try:
        from smallverse_core.session_profiles import SessionProfileStore
    except ImportError as error:  # pragma: no cover - local fixture environments
        raise ValueError("VPS session-profile support is unavailable") from error

    workspace = Path(workspace_root)
    store = SessionProfileStore(
        workspace / "session-profiles",
        index_path=workspace / "spintowin-panel" / "sessions.json",
    )
    metadata = store.get_profile(profile)
    if not metadata:
        raise ValueError("crawler session profile was not found")
    if str(metadata.get("role") or "") != "crawler":
        raise ValueError("Find Friends automation requires a crawler profile")
    secret = store.load_secret(str(metadata["profile_id"]))
    cookie = str(secret.get("cookie") or "").strip()
    swsid = str(secret.get("svsid") or "").strip()
    if not cookie or not swsid:
        raise ValueError("crawler session profile is missing an active session")
    return cookie, swsid


def post_amf(
    payload: bytes,
    *,
    cookie: str,
    swsid: str,
    timeout: float,
) -> tuple[int, str, bytes]:
    request = urllib.request.Request(
        GATEWAY_BASE + swsid,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/x-amf",
            "Accept": "*/*",
            "Accept-Encoding": "identity",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115 Safari/537.36 SmallVerse/1.0",
            "X-Requested-With": "ShockwaveFlash/11.2.999.999",
            "Referer": "https://content.smallverse.app/releases/en_US/main.swf",
            "Cookie": cookie,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return int(response.status), str(response.headers.get("content-type") or ""), response.read()
    except urllib.error.HTTPError as error:
        # Do not read or emit error bodies: gateway error payloads can contain
        # session diagnostics that do not belong in public logs.
        return int(error.code), str(error.headers.get("content-type") or ""), b""


def post_search(
    query: str,
    *,
    cookie: str,
    swsid: str,
    call_id: int,
    timer_ms: int | None,
    timeout: float,
) -> tuple[int, str, bytes]:
    return post_amf(
        build_request(query, call_id=call_id, timer_ms=timer_ms),
        cookie=cookie,
        swsid=swsid,
        timeout=timeout,
    )


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        path.parent.chmod(0o700)
    except OSError:
        pass
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    temporary = Path(temporary_name)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        path.chmod(0o600)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only Smallverse Find Friends bridge")
    parser.add_argument("--query", required=True, help="Two-or-more-character Find Friends query")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--cookie-file", type=Path, help="Private crawler session Cookie file")
    source.add_argument("--session-profile", help="Crawler profile in the VPS-native session vault")
    parser.add_argument(
        "--session-workspace",
        type=Path,
        default=Path("/opt/smallverse-staging-dual/workspace"),
        help="VPS workspace that contains the crawler session-profile vault",
    )
    parser.add_argument(
        "--session-core-root",
        type=Path,
        default=Path("/opt/smallverse-staging-dual"),
        help="VPS runtime root that provides smallverse_core.session_profiles",
    )
    parser.add_argument("--output", type=Path, required=True, help="Private avatar-reference manifest for the cache worker")
    parser.add_argument("--avatar-config-queue", type=Path, help="Optional private renderer queue for complete configs returned by getUsersAvatars")
    parser.add_argument("--call-id", type=int, default=1)
    parser.add_argument("--timer-ms", type=int, help="Flash getTimer-compatible value; default uses the VPS monotonic clock")
    parser.add_argument(
        "--timer-state",
        type=Path,
        help="Private state file that keeps automatic calls from replaying a timer context",
    )
    parser.add_argument("--timeout", type=float, default=45.0)
    parser.add_argument(
        "--resolve-owner-avatars",
        action="store_true",
        help=(
            "Follow Person.user ids with the shipped "
            "avatarcore.getUsersAvatars call."
        ),
    )
    parser.add_argument(
        "--owner-limit",
        type=int,
        default=25,
        help="Maximum account-list follow-up calls per run (default: 25).",
    )
    args = parser.parse_args()

    query = normalize_query(args.query)
    if args.session_profile:
        cookie, swsid = profile_cookie(
            args.session_workspace,
            args.session_profile,
            args.session_core_root,
        )
    else:
        cookie, swsid = session_cookie(args.cookie_file)
    # A new worker process would otherwise restart a process-relative clock at
    # zero and replay the same authenticated context for the same query.
    timer_ms = args.timer_ms
    if timer_ms is None:
        timer_ms = read_timer_state(args.timer_state) if args.timer_state else flash_like_timer_ms()
    status, content_type, response = post_search(
        query,
        cookie=cookie,
        swsid=swsid,
        call_id=args.call_id,
        timer_ms=timer_ms,
        timeout=args.timeout,
    )
    if status != 200:
        print(json.dumps({
            "ok": False,
            "query": query,
            "http_status": status,
            "content_type": content_type,
            "avatars": 0,
            "secrets_exposed": False,
        }))
        return 1

    rows = avatar_rows(response, query=query)
    owner_accounts: list[dict[str, Any]] = []
    owner_lookup_failures = 0
    last_timer_ms = timer_ms
    if args.resolve_owner_avatars:
        if args.owner_limit < 1:
            raise SystemExit("--owner-limit must be positive")
        owner_ids = list(dict.fromkeys(
            row["owner_id"] for row in rows if row.get("owner_id")
        ))
        by_avatar_id = {row["avatar_id"]: row for row in rows}
        for offset, owner_id in enumerate(owner_ids[:args.owner_limit], start=1):
            owner_timer_ms = timer_ms + offset
            last_timer_ms = owner_timer_ms
            owner_status, _, owner_response = post_amf(
                build_owner_avatars_request(
                    owner_id,
                    call_id=args.call_id + offset,
                    timer_ms=owner_timer_ms,
                ),
                cookie=cookie,
                swsid=swsid,
                timeout=args.timeout,
            )
            if owner_status != 200:
                owner_lookup_failures += 1
                continue
            account_avatars = owner_avatar_rows(owner_response, owner_id)
            owner_accounts.append({
                "owner_id": owner_id,
                "source_method": OWNER_AVATARS_METHOD,
                "avatars": account_avatars,
            })
            # The portrait cache consumes the top-level avatar list. Add the
            # owner's other avatars without replacing richer Find Friends
            # identity fields for an avatar already observed there.
            for avatar in account_avatars:
                avatar_id = avatar["avatar_id"]
                if avatar_id not in by_avatar_id:
                    cache_row = dict(avatar, source_method=OWNER_AVATARS_METHOD)
                    rows.append(cache_row)
                    by_avatar_id[avatar_id] = cache_row

    if args.timer_state:
        write_timer_state(args.timer_state, last_timer_ms)

    payload = {
        "contract": "beacon-crawler-friend-search/v3",
        "generated_at": utc_now(),
        "query": query,
        "avatars": rows,
        "owner_accounts": owner_accounts,
    }
    atomic_json(args.output, payload)
    configs_published = 0
    if args.avatar_config_queue:
        try:
            existing = json.loads(args.avatar_config_queue.read_text())
        except (OSError, json.JSONDecodeError):
            existing = {"contract": "beacon-avatar-render-queue/v1", "avatars": []}
        queued = {str(row.get("avatar_id")): row for row in existing.get("avatars", []) if isinstance(row, dict) and row.get("avatar_id")}
        for row in rows:
            config_xml = str(row.get("config_xml") or "").strip()
            avatar_id = str(row.get("avatar_id") or "")
            if not config_xml.startswith("<avatar") or not re.fullmatch(r"[0-9a-f]{24}", avatar_id, re.I):
                continue
            queued[avatar_id] = {
                "avatar_id": avatar_id.lower(),
                "gender": row.get("gender") or "unknown",
                "config_xml": config_xml,
                "config_sha256": row.get("config_sha256"),
                "captured_at": utc_now(),
                "source": "avatarcore.getUsersAvatars",
            }
            configs_published += 1
        atomic_json(args.avatar_config_queue, {"contract": "beacon-avatar-render-queue/v1", "avatars": list(queued.values())})
    print(json.dumps({
        "ok": True,
        "query": query,
        "http_status": status,
        "response_bytes": len(response),
        "avatars": len(rows),
        "owners": len({row["owner_id"] for row in rows if row.get("owner_id")}),
        "owner_accounts_resolved": len(owner_accounts),
        "owner_lookup_failures": owner_lookup_failures,
        "avatar_configs_published": configs_published,
        "with_head_url": sum(1 for row in rows if row["head_url"]),
        "with_thumb_url": sum(1 for row in rows if row["thumb_url"]),
        "with_snapshot_url": sum(1 for row in rows if row["snapshot_url"]),
        "output": str(args.output),
        "secrets_exposed": False,
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
