#!/usr/bin/env python3
"""Ingest and export Beacon's source-correct owner/avatar identity graph.

The graph has two authoritative acquisition paths recovered from the shipped
Smallworlds SWF:

* ``friend.searchForFriends`` returns ``Person.user.id`` beside one nested
  ``Person.avatar``. This proves an owner/avatar relationship and preserves
  the avatar's exact name and portrait URLs, but does *not* prove primary.
* ``avatarcore.getUsersAvatars(ownerId)`` returns the account's avatar list.
  Its explicit ``UserAvatar.isDefault`` flag is valid default/primary
  evidence. ``active`` is lifecycle state and is never treated as selected.

The SQLite tables retain append-only evidence. The JSON export is a public
read model; it never contains cookies, gateway paths, or AMF payloads.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


HEX24 = re.compile(r"^[0-9a-f]{24}$", re.I)
LOCAL_AVATAR_URL = re.compile(
    r"^/avatar-thumbnails/([0-9a-f]{24})/(head|thumb|snapshot)\.png$",
    re.I,
)
FRIEND_METHOD = "friend.searchForFriends"
OWNER_AVATARS_METHOD = "avatarcore.getUsersAvatars"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def timestamp(value: Any, fallback: str | None = None) -> str:
    candidate = str(value or "").strip()
    if candidate:
        try:
            parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
            if parsed.tzinfo is not None:
                return parsed.astimezone(timezone.utc).isoformat()
        except ValueError:
            pass
    return fallback or utc_now()


def text(value: Any) -> str:
    return value if isinstance(value, str) else ""


def id24(value: Any) -> str:
    value = text(value).strip().lower()
    return value if HEX24.fullmatch(value) else ""


def nullable_bool(value: Any) -> int | None:
    if isinstance(value, bool):
        return 1 if value else 0
    if value in (0, 1) and not isinstance(value, str):
        return int(value)
    return None


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def ensure_schema(connection: sqlite3.Connection) -> None:
    connection.executescript("""
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS identity_owner_accounts_v1 (
      owner_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL DEFAULT '',
      first_observed_at TEXT NOT NULL,
      last_observed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS identity_avatar_entities_v1 (
      avatar_id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      display_name TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL DEFAULT '',
      head_url TEXT NOT NULL DEFAULT '',
      thumb_url TEXT NOT NULL DEFAULT '',
      snapshot_url TEXT NOT NULL DEFAULT '',
      first_observed_at TEXT NOT NULL,
      last_observed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS identity_owner_avatar_evidence_v1 (
      evidence_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      avatar_id TEXT NOT NULL,
      source_method TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      source_query TEXT NOT NULL DEFAULT '',
      observed_at TEXT NOT NULL,
      relationship_basis TEXT NOT NULL,
      is_default INTEGER,
      is_selected INTEGER,
      raw_ref TEXT NOT NULL DEFAULT '{}',
      CHECK (is_default IS NULL OR is_default IN (0, 1)),
      CHECK (is_selected IS NULL OR is_selected IN (0, 1)),
      FOREIGN KEY (owner_id) REFERENCES identity_owner_accounts_v1(owner_id),
      FOREIGN KEY (avatar_id) REFERENCES identity_avatar_entities_v1(avatar_id)
    );

    CREATE INDEX IF NOT EXISTS idx_identity_owner_avatar_evidence_owner
    ON identity_owner_avatar_evidence_v1(owner_id, observed_at DESC);

    CREATE INDEX IF NOT EXISTS idx_identity_owner_avatar_evidence_avatar
    ON identity_owner_avatar_evidence_v1(avatar_id, observed_at DESC);
    """)


def upsert_owner(
    connection: sqlite3.Connection,
    owner_id: str,
    observed_at: str,
    display_name: str = "",
) -> None:
    connection.execute("""
      INSERT INTO identity_owner_accounts_v1 (
        owner_id, display_name, first_observed_at, last_observed_at
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(owner_id) DO UPDATE SET
        display_name = COALESCE(NULLIF(excluded.display_name, ''), display_name),
        first_observed_at = MIN(first_observed_at, excluded.first_observed_at),
        last_observed_at = MAX(last_observed_at, excluded.last_observed_at)
    """, (owner_id, display_name, observed_at, observed_at))


def upsert_avatar(
    connection: sqlite3.Connection,
    row: dict[str, Any],
    observed_at: str,
) -> str:
    avatar_id = id24(row.get("avatar_id") or row.get("id"))
    if not avatar_id:
        return ""
    first = text(row.get("first_name") or row.get("fName") or row.get("firstName"))
    last = text(row.get("last_name") or row.get("lName") or row.get("lastName"))
    display = text(row.get("display_name") or row.get("fullName"))
    if not display:
        display = " ".join(part for part in (first, last) if part).strip()
    connection.execute("""
      INSERT INTO identity_avatar_entities_v1 (
        avatar_id, first_name, last_name, display_name, gender,
        head_url, thumb_url, snapshot_url,
        first_observed_at, last_observed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(avatar_id) DO UPDATE SET
        first_name = COALESCE(NULLIF(excluded.first_name, ''), first_name),
        last_name = COALESCE(NULLIF(excluded.last_name, ''), last_name),
        display_name = COALESCE(NULLIF(excluded.display_name, ''), display_name),
        gender = COALESCE(NULLIF(excluded.gender, ''), gender),
        head_url = COALESCE(NULLIF(excluded.head_url, ''), head_url),
        thumb_url = COALESCE(NULLIF(excluded.thumb_url, ''), thumb_url),
        snapshot_url = COALESCE(NULLIF(excluded.snapshot_url, ''), snapshot_url),
        first_observed_at = MIN(first_observed_at, excluded.first_observed_at),
        last_observed_at = MAX(last_observed_at, excluded.last_observed_at)
    """, (
        avatar_id,
        first,
        last,
        display,
        text(row.get("gender")),
        text(row.get("head_url") or row.get("headUrl")),
        text(row.get("thumb_url") or row.get("thumbUrl")),
        text(row.get("snapshot_url") or row.get("snapshotUrl")),
        observed_at,
        observed_at,
    ))
    return avatar_id


def evidence_id(value: dict[str, Any]) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def insert_relationship(
    connection: sqlite3.Connection,
    *,
    owner_id: str,
    avatar_id: str,
    source_method: str,
    source_ref: str,
    source_query: str,
    observed_at: str,
    relationship_basis: str,
    is_default: int | None,
    is_selected: int | None,
    raw_ref: dict[str, Any],
) -> bool:
    identity = {
        "owner_id": owner_id,
        "avatar_id": avatar_id,
        "source_method": source_method,
        "source_ref": source_ref,
        "source_query": source_query,
        "observed_at": observed_at,
        "relationship_basis": relationship_basis,
        "is_default": is_default,
        "is_selected": is_selected,
    }
    before = connection.total_changes
    connection.execute("""
      INSERT OR IGNORE INTO identity_owner_avatar_evidence_v1 (
        evidence_id, owner_id, avatar_id, source_method, source_ref,
        source_query, observed_at, relationship_basis,
        is_default, is_selected, raw_ref
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        evidence_id(identity), owner_id, avatar_id, source_method, source_ref,
        source_query, observed_at, relationship_basis,
        is_default, is_selected,
        json.dumps(raw_ref, sort_keys=True, separators=(",", ":")),
    ))
    return connection.total_changes > before


def safe_avatar_ref(row: dict[str, Any]) -> dict[str, Any]:
    """Retain identity evidence without private transport/session material."""
    return {
        key: row.get(key)
        for key in (
            "owner_id", "avatar_id", "first_name", "last_name",
            "display_name", "gender", "head_url", "thumb_url",
            "snapshot_url", "source_query", "relationship_basis",
            "is_default", "default_state", "selected_state", "active",
        )
        if row.get(key) not in (None, "")
    }


def ingest_friend_manifest(
    connection: sqlite3.Connection,
    payload: dict[str, Any],
    source_ref: str,
) -> dict[str, int]:
    observed_at = timestamp(payload.get("generated_at"))
    rows = payload.get("avatars")
    if not isinstance(rows, list):
        rows = []
    avatars = owners = relationships = 0
    for candidate in rows:
        if not isinstance(candidate, dict):
            continue
        avatar_id = upsert_avatar(connection, candidate, observed_at)
        if not avatar_id:
            continue
        avatars += 1
        owner_id = id24(candidate.get("owner_id"))
        if not owner_id:
            # Never infer an owner id from an avatar id or portrait URL.
            continue
        if text(candidate.get("source_method")) == OWNER_AVATARS_METHOD:
            # The same combined manifest is ingested through its explicit
            # owner_accounts collection below. Do not mislabel a secondary
            # account avatar as a public Find Friends result.
            continue
        owner_name = " ".join(part for part in (
            text(candidate.get("owner_first_name")),
            text(candidate.get("owner_last_name")),
        ) if part).strip()
        upsert_owner(connection, owner_id, observed_at, owner_name)
        owners += 1
        if insert_relationship(
            connection,
            owner_id=owner_id,
            avatar_id=avatar_id,
            source_method=FRIEND_METHOD,
            source_ref=source_ref,
            source_query=text(candidate.get("source_query") or payload.get("query")),
            observed_at=observed_at,
            relationship_basis=(
                text(candidate.get("relationship_basis")) or
                "friend.searchForFriends:Person.user.id+Person.avatar.id"
            ),
            is_default=None,
            is_selected=None,
            raw_ref=safe_avatar_ref(candidate),
        ):
            relationships += 1
    return {
        "avatars": avatars,
        "owners": len({
            id24(row.get("owner_id")) for row in rows
            if isinstance(row, dict) and id24(row.get("owner_id"))
        }),
        "relationships_added": relationships,
    }


def owner_account_groups(payload: dict[str, Any]) -> Iterable[dict[str, Any]]:
    groups = payload.get("owner_accounts")
    if isinstance(groups, list):
        yield from (group for group in groups if isinstance(group, dict))
    owner_id = id24(payload.get("owner_id"))
    avatars = payload.get("avatars")
    if owner_id and isinstance(avatars, list):
        yield {
            "owner_id": owner_id,
            "source_method": payload.get("source_method") or OWNER_AVATARS_METHOD,
            "avatars": avatars,
        }


def ingest_owner_avatar_manifest(
    connection: sqlite3.Connection,
    payload: dict[str, Any],
    source_ref: str,
) -> dict[str, int]:
    observed_at = timestamp(payload.get("generated_at"))
    owners = avatars = relationships = explicit_defaults = 0
    seen_owners: set[str] = set()
    for group in owner_account_groups(payload):
        owner_id = id24(group.get("owner_id"))
        if not owner_id:
            continue
        upsert_owner(connection, owner_id, observed_at)
        seen_owners.add(owner_id)
        rows = group.get("avatars")
        if not isinstance(rows, list):
            continue
        for candidate in rows:
            if not isinstance(candidate, dict):
                continue
            row = dict(candidate, owner_id=owner_id)
            avatar_id = upsert_avatar(connection, row, observed_at)
            if not avatar_id:
                continue
            avatars += 1
            default_state = nullable_bool(
                row.get("is_default")
                if "is_default" in row else row.get("default_state")
            )
            selected_state = nullable_bool(row.get("selected_state"))
            if default_state == 1:
                explicit_defaults += 1
            if insert_relationship(
                connection,
                owner_id=owner_id,
                avatar_id=avatar_id,
                source_method=text(group.get("source_method")) or OWNER_AVATARS_METHOD,
                source_ref=source_ref,
                source_query="",
                observed_at=observed_at,
                relationship_basis=(
                    text(row.get("relationship_basis")) or
                    "avatarcore.getUsersAvatars(ownerId)"
                ),
                is_default=default_state,
                is_selected=selected_state,
                raw_ref=safe_avatar_ref(row),
            ):
                relationships += 1
    owners = len(seen_owners)
    return {
        "owners": owners,
        "avatars": avatars,
        "relationships_added": relationships,
        "explicit_defaults": explicit_defaults,
    }


def local_assets(index: dict[str, Any], avatar_id: str) -> dict[str, Any]:
    record = (index.get("by_avatar_id") or {}).get(avatar_id)
    if not isinstance(record, dict):
        return {}
    output: dict[str, Any] = {}
    for variant in ("head", "thumb", "snapshot"):
        value = text(record.get(f"{variant}_url"))
        match = LOCAL_AVATAR_URL.fullmatch(value)
        if match and match.group(1).lower() == avatar_id and match.group(2).lower() == variant:
            output[f"{variant}_local_url"] = value

        # A private crawler index can retain the exact CDN acquisition URL in
        # url_checks/cached_from. It is evidence, never a browser fallback.
        exact = ""
        checks = record.get("url_checks")
        if isinstance(checks, dict):
            check_key = "snap" if variant == "snapshot" else variant
            check = checks.get(check_key)
            if isinstance(check, dict):
                exact = text(check.get("url"))
        cached_from = record.get("cached_from")
        if not exact and isinstance(cached_from, dict):
            exact = text(cached_from.get(variant))
        if exact:
            output[f"{variant}_source_url"] = exact
    return output


def latest_explicit_state(
    connection: sqlite3.Connection,
    owner_id: str,
    avatar_id: str,
    column: str,
) -> tuple[int | None, str]:
    if column not in {"is_default", "is_selected"}:
        raise ValueError("unsupported evidence state")
    row = connection.execute(f"""
      SELECT {column}, observed_at
      FROM identity_owner_avatar_evidence_v1
      WHERE owner_id = ? AND avatar_id = ? AND {column} IS NOT NULL
      ORDER BY observed_at DESC, evidence_id DESC
      LIMIT 1
    """, (owner_id, avatar_id)).fetchone()
    return (row[column], row["observed_at"]) if row else (None, "")


def build_read_model(
    connection: sqlite3.Connection,
    avatar_index: dict[str, Any] | None = None,
) -> dict[str, Any]:
    connection.row_factory = sqlite3.Row
    index = avatar_index or {}
    avatars_by_id: dict[str, dict[str, Any]] = {}
    for row in connection.execute("""
      SELECT * FROM identity_avatar_entities_v1 ORDER BY avatar_id
    """):
        avatar_id = row["avatar_id"]
        owner_rows = connection.execute("""
          SELECT DISTINCT owner_id
          FROM identity_owner_avatar_evidence_v1
          WHERE avatar_id = ?
          ORDER BY owner_id
        """, (avatar_id,)).fetchall()
        owner_ids = [entry["owner_id"] for entry in owner_rows]
        source_assets = {
            "head_source_url": row["head_url"],
            "thumb_source_url": row["thumb_url"],
            "snapshot_source_url": row["snapshot_url"],
        }
        source_assets = {
            key: value for key, value in source_assets.items() if value
        }
        assets = {**source_assets, **local_assets(index, avatar_id)}
        name = row["display_name"] or " ".join(
            part for part in (row["first_name"], row["last_name"]) if part
        ).strip()
        avatars_by_id[avatar_id] = {
            "avatar_id": avatar_id,
            "owner_id": owner_ids[0] if len(owner_ids) == 1 else None,
            "owner_ids": owner_ids,
            "name": name or None,
            "name_status": "observed" if name else "unresolved",
            "first_name": row["first_name"] or None,
            "last_name": row["last_name"] or None,
            "gender": row["gender"] or None,
            "portrait_assets": assets,
            "first_observed_at": row["first_observed_at"],
            "last_observed_at": row["last_observed_at"],
            "integrity_status": (
                "ok" if len(owner_ids) <= 1 else "conflicting-owner-evidence"
            ),
        }

    accounts: list[dict[str, Any]] = []
    for owner in connection.execute("""
      SELECT * FROM identity_owner_accounts_v1 ORDER BY owner_id
    """):
        owner_id = owner["owner_id"]
        links = connection.execute("""
          SELECT
            avatar_id,
            MIN(observed_at) AS first_observed_at,
            MAX(observed_at) AS last_observed_at,
            COUNT(*) AS evidence_count,
            SUM(CASE WHEN source_method = ? THEN 1 ELSE 0 END) AS public_count,
            SUM(CASE WHEN source_method = ? THEN 1 ELSE 0 END) AS account_list_count
          FROM identity_owner_avatar_evidence_v1
          WHERE owner_id = ?
          GROUP BY avatar_id
          ORDER BY last_observed_at DESC, avatar_id
        """, (FRIEND_METHOD, OWNER_AVATARS_METHOD, owner_id)).fetchall()

        link_values: list[dict[str, Any]] = []
        default_true: list[tuple[str, str]] = []
        selected_true: list[tuple[str, str]] = []
        for link in links:
            avatar_id = link["avatar_id"]
            default_state, default_at = latest_explicit_state(
                connection, owner_id, avatar_id, "is_default"
            )
            selected_state, selected_at = latest_explicit_state(
                connection, owner_id, avatar_id, "is_selected"
            )
            if default_state == 1:
                default_true.append((avatar_id, default_at))
            if selected_state == 1:
                selected_true.append((avatar_id, selected_at))
            evidence: list[dict[str, Any]] = []
            if default_state is not None:
                evidence.append({
                    "kind": "explicit-default-state",
                    "basis": "avatarcore.getUsersAvatars:isDefault",
                    "value": bool(default_state),
                    "confidence": 100,
                    "proves_primary": bool(default_state),
                    "observed_at": default_at,
                })
            if selected_state is not None:
                evidence.append({
                    "kind": "explicit-selected-state",
                    "basis": "selected-protocol-event",
                    "value": bool(selected_state),
                    "confidence": 100,
                    "proves_primary": bool(selected_state),
                    "observed_at": selected_at,
                })
            if link["public_count"]:
                evidence.append({
                    "kind": "public-avatar-observation",
                    "basis": "friend.searchForFriends:Person.user+Person.avatar",
                    "confidence": 60,
                    "proves_primary": False,
                    "observed_at": link["last_observed_at"],
                })
            if link["account_list_count"]:
                evidence.append({
                    "kind": "account-membership",
                    "basis": "avatarcore.getUsersAvatars(ownerId)",
                    "confidence": 100,
                    "proves_primary": False,
                    "observed_at": link["last_observed_at"],
                })
            link_values.append({
                "avatar_id": avatar_id,
                "first_observed_at": link["first_observed_at"],
                "last_observed_at": link["last_observed_at"],
                "evidence_count": link["evidence_count"],
                "selection_evidence": evidence,
            })

        # The game contract allows at most three user avatars. Keep an anomaly
        # visible instead of silently presenting a fourth as legitimate.
        ordered_links = sorted(
            link_values,
            # ``link_values`` is already newest-first. Python's stable sort
            # only promotes the explicit default and preserves that recency
            # order for every non-default avatar.
            key=lambda link: (
                0 if any(value[0] == link["avatar_id"] for value in default_true) else 1
            ),
        )
        retained = ordered_links[:3]
        overflow = ordered_links[3:]

        primary = None
        if len(default_true) == 1:
            avatar_id, observed_at = default_true[0]
            primary = {
                "avatar_id": avatar_id,
                "basis": "default-endpoint",
                "evidence_source": "avatarcore.getUsersAvatars:isDefault",
                "confidence": 100,
                "selected_at": observed_at,
            }
        selected_avatar_id = selected_true[0][0] if len(selected_true) == 1 else None

        visible = next(
            (link for link in link_values if any(
                evidence["kind"] == "public-avatar-observation"
                for evidence in link["selection_evidence"]
            )),
            None,
        )
        display_avatar_id = (
            primary["avatar_id"] if primary else
            selected_avatar_id or
            (visible["avatar_id"] if visible else None)
        )
        display_basis = (
            "explicit-default" if primary else
            "explicit-selected" if selected_avatar_id else
            "latest-public-avatar-observation" if visible else
            None
        )

        integrity: list[str] = []
        if len(default_true) > 1:
            integrity.append("multiple-explicit-default-avatars")
        if len(selected_true) > 1:
            integrity.append("multiple-explicit-selected-avatars")
        if overflow:
            integrity.append("owner-avatar-limit-exceeded")
        accounts.append({
            "owner_id": owner_id,
            "display_name": owner["display_name"] or None,
            "avatar_ids": [link["avatar_id"] for link in retained],
            "overflow_avatar_ids": [link["avatar_id"] for link in overflow],
            "selected_avatar_id": selected_avatar_id,
            "primary_avatar": primary,
            "display_avatar_id": display_avatar_id,
            "display_avatar_selection": ({
                "basis": display_basis,
                "confidence": 100 if primary or selected_avatar_id else 60,
                "proves_primary": bool(primary or selected_avatar_id),
            } if display_avatar_id else None),
            "avatar_relationships": link_values,
            "first_observed_at": owner["first_observed_at"],
            "last_observed_at": owner["last_observed_at"],
            "integrity_status": "ok" if not integrity else "warning",
            "integrity_warnings": integrity,
        })

    return {
        "contract": "beacon-owner-avatar-identity-graph/v1",
        "generated_at": utc_now(),
        "semantics": {
            "primary_requires_explicit_evidence": True,
            "friend_search_proves_primary": False,
            "default_source": "avatarcore.getUsersAvatars:isDefault",
            "max_avatars_per_owner": 3,
        },
        "counts": {
            "owners": len(accounts),
            "avatars": len(avatars_by_id),
            "owner_avatar_relationships": sum(
                len(account["avatar_relationships"]) for account in accounts
            ),
            "owners_with_explicit_primary": sum(
                1 for account in accounts if account["primary_avatar"]
            ),
        },
        "accounts": accounts,
        "avatars": list(avatars_by_id.values()),
        "by_owner_id": {account["owner_id"]: account for account in accounts},
        "by_avatar_id": avatars_by_id,
    }


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--friend-manifest", type=Path, action="append", default=[])
    parser.add_argument("--owner-avatars-manifest", type=Path, action="append", default=[])
    parser.add_argument("--avatar-index", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    connection = sqlite3.connect(args.database)
    connection.row_factory = sqlite3.Row
    ensure_schema(connection)
    summaries: list[dict[str, Any]] = []
    for path in args.friend_manifest:
        payload = load_json(path)
        summaries.append({
            "source": str(path),
            "kind": "friend-search",
            **ingest_friend_manifest(connection, payload, str(path)),
        })
        # CDP v3 manifests may include the account-list follow-up response.
        if isinstance(payload.get("owner_accounts"), list):
            summaries.append({
                "source": str(path),
                "kind": "owner-avatar-list",
                **ingest_owner_avatar_manifest(connection, payload, str(path)),
            })
    for path in args.owner_avatars_manifest:
        payload = load_json(path)
        summaries.append({
            "source": str(path),
            "kind": "owner-avatar-list",
            **ingest_owner_avatar_manifest(connection, payload, str(path)),
        })
    connection.commit()

    avatar_index = load_json(args.avatar_index) if args.avatar_index else {}
    model = build_read_model(connection, avatar_index)
    connection.close()
    atomic_json(args.output, model)
    print(json.dumps({
        "ok": True,
        "sources": summaries,
        "counts": model["counts"],
        "output": str(args.output),
        "secrets_exposed": False,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
