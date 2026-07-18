#!/usr/bin/env python3
"""Search Smallverse avatars through the crawler's live Flash gateway session.

The old avatar image URLs in preserved SAZ data expire.  The Flash client still
knows the authenticated, session-scoped gateway URL, so this uses Chromium's
existing page context to call the same ``friend.searchForFriends`` AMF method
that the game UI uses.  No cookie, gateway token, or session URL is read into
Beacon or printed by this script.

The resulting current image references are passed to the existing CDP cache
worker, which saves PNGs under the crawler workspace for Beacon to sync.
"""
from __future__ import annotations

import argparse
import base64
import importlib.util
import json
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent


def load_module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


CDP_TOOL = load_module("smallverse_cdp_cache", "cache_avatar_thumbnails_via_cdp.py")
FRIENDS = load_module("smallverse_friend_search", "beacon_friend_search_live.py")
PROTOCOL = load_module("smallverse_friend_search_protocol", "smallverse_friend_search_protocol.py")


def cdp_command(cdp: Any, method: str, params: dict[str, Any], events: list[dict[str, Any]]) -> dict[str, Any]:
    """Issue one DevTools command while retaining asynchronous network events."""
    cdp.message_id += 1
    message_id = cdp.message_id
    cdp._send({"id": message_id, "method": method, "params": params})
    while True:
        message = json.loads(cdp._receive())
        if message.get("id") == message_id:
            if "error" in message:
                raise RuntimeError(str(message["error"].get("message") or method))
            return message.get("result") or {}
        events.append(message)


def gateway_request(cdp: Any, body: bytes) -> dict[str, Any]:
    endpoint = cdp.evaluate("""
      (function () {
        const entries = performance.getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((name) => /^https:\\/\\/gateway\\.smallverse\\.app\\/gateway\\/;=/.test(name));
        return entries.length ? entries[entries.length - 1] : '';
      })()
    """)
    if not endpoint:
        raise RuntimeError("No live Flash gateway endpoint in this crawler page.")

    # CORS blocks JavaScript from reading Flash's AMF response. DevTools can
    # safely retrieve that response body from the browser network stack while
    # retaining the crawler's own cookies and session-scoped gateway path.
    events: list[dict[str, Any]] = []
    cdp_command(cdp, "Network.enable", {}, events)
    encoded = base64.b64encode(body).decode("ascii")
    expression = f"""
      (async () => {{
        const bytes = Uint8Array.from(atob({json.dumps(encoded)}), (ch) => ch.charCodeAt(0));
        try {{
          await fetch({json.dumps(str(endpoint))}, {{
            method: 'POST', credentials: 'include',
            headers: {{'Content-Type': 'application/x-amf', 'Accept': '*/*', 'X-Requested-With': 'ShockwaveFlash/11.2.999.999'}},
            body: bytes
          }});
        }} catch (_) {{
          // The request still reaches the gateway; Network.getResponseBody
          // below is the authorized reader for the CORS-blocked response.
        }}
        return true;
      }})()
    """
    cdp_command(cdp, "Runtime.evaluate", {
        "expression": expression,
        "awaitPromise": True,
        "returnByValue": True,
    }, events)

    request_id = ""
    response: dict[str, Any] = {}
    finished = False
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        for event in events:
            params = event.get("params") or {}
            request = params.get("request") or {}
            if (
                event.get("method") == "Network.requestWillBeSent"
                and request.get("url") == endpoint
                and request.get("method") == "POST"
            ):
                request_id = str(params.get("requestId") or "")
            if request_id and str(params.get("requestId") or "") == request_id:
                if event.get("method") == "Network.responseReceived":
                    response = params.get("response") or {}
                elif event.get("method") == "Network.loadingFinished":
                    finished = True
        if request_id and finished:
            break
        events.clear()
        cdp.sock.settimeout(max(0.5, deadline - time.monotonic()))
        try:
            events.append(json.loads(cdp._receive()))
        except TimeoutError:
            break
        finally:
            cdp.sock.settimeout(10)

    if not request_id or not finished:
        raise RuntimeError("The live gateway request did not complete in DevTools.")
    body_result = cdp_command(cdp, "Network.getResponseBody", {"requestId": request_id}, events)
    raw_body = str(body_result.get("body") or "")
    decoded = base64.b64decode(raw_body) if body_result.get("base64Encoded") else raw_body.encode("latin1")
    status = int(response.get("status") or 0)
    if status != 200:
        raise RuntimeError(f"Flash gateway returned HTTP {status}.")
    return {
        "ok": True,
        "status": status,
        "content_type": str(response.get("mimeType") or ""),
        "body": base64.b64encode(decoded).decode("ascii"),
    }


def avatar_row(row: dict[str, Any], query: str) -> dict[str, Any] | None:
    avatar_id = str(row.get("avatar_id") or "").lower()
    if not avatar_id:
        return None
    return {
        "owner_id": row.get("owner_id") or "",
        "owner_first_name": row.get("owner_first_name") or "",
        "owner_last_name": row.get("owner_last_name") or "",
        "avatar_id": avatar_id,
        "first_name": row.get("first_name") or "",
        "last_name": row.get("last_name") or "",
        "display_name": row.get("display_name") or avatar_id,
        "gender": row.get("gender") or "unknown",
        "head_url": row.get("head_url") or "",
        "thumb_url": row.get("thumb_url") or "",
        "snapshot_url": row.get("snapshot_url") or "",
        "source_query": query,
        "source_class": row.get("source_class") or "Person",
        "relationship_basis": row.get("relationship_basis") or "",
        "default_state": None,
        "selected_state": None,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--query", action="append", required=True, help="One game friend-search query; repeat this option")
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--delay", type=float, default=0.35)
    parser.add_argument("--cdp-port", type=int, default=19992)
    parser.add_argument("--page-hint", default="smallverse.app")
    parser.add_argument(
        "--resolve-owner-avatars",
        action="store_true",
        help=(
            "Follow real Person.user ids with the SWF's "
            "avatarcore.getUsersAvatars call."
        ),
    )
    parser.add_argument(
        "--owner-limit",
        type=int,
        default=25,
        help="Maximum owner-account follow-up calls per run (default: 25).",
    )
    args = parser.parse_args()

    cdp = CDP_TOOL.CDP(args.cdp_port, args.page_hint)
    avatars: dict[str, dict[str, Any]] = {}
    summaries: list[dict[str, Any]] = []

    for index, query in enumerate(dict.fromkeys(q.strip().lower() for q in args.query if q.strip())):
        payload = FRIENDS.build_friend_search_amf(query, call_id=random.randint(1, 9999))
        response = gateway_request(cdp, payload)
        body = base64.b64decode(str(response["body"]))
        found = 0
        for decoded in PROTOCOL.avatar_rows(body, query=query):
            row = avatar_row(decoded, query)
            if not row:
                continue
            avatars[row["avatar_id"]] = row
            found += 1
        summaries.append({"query": query, "http_status": response["status"], "parsed_people": found})
        if args.delay and index + 1 < len(args.query):
            time.sleep(args.delay)

    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    owner_accounts: list[dict[str, Any]] = []
    owner_ids = list(dict.fromkeys(
        str(row.get("owner_id") or "").lower()
        for row in avatars.values()
        if row.get("owner_id")
    ))
    if args.resolve_owner_avatars:
        if args.owner_limit < 1:
            raise SystemExit("--owner-limit must be positive")
        for index, owner_id in enumerate(owner_ids[:args.owner_limit]):
            payload = PROTOCOL.build_owner_avatars_request(
                owner_id,
                call_id=random.randint(1, 9999),
                # Match the already-working live-CDP friend-search clock.
                timer_ms=int(time.monotonic() * 1000),
            )
            response = gateway_request(cdp, payload)
            rows = PROTOCOL.owner_avatar_rows(
                base64.b64decode(str(response["body"])),
                owner_id,
            )
            owner_accounts.append({
                "owner_id": owner_id,
                "source_method": PROTOCOL.OWNER_AVATARS_METHOD,
                "avatars": rows,
            })
            if args.delay and index + 1 < min(len(owner_ids), args.owner_limit):
                time.sleep(args.delay)

    args.manifest.write_text(json.dumps({
        "contract": "beacon-crawler-friend-search/v3",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "avatars": list(avatars.values()),
        "owner_accounts": owner_accounts,
    }, indent=2) + "\n")
    print(json.dumps({
        "ok": True,
        "queries": summaries,
        "avatars_found": len(avatars),
        "owners_found": len(owner_ids),
        "owner_accounts_resolved": len(owner_accounts),
        "manifest": str(args.manifest),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
