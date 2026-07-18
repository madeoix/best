#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import pwd
import re
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

try:
    from mitmproxy import http  # type: ignore
except Exception:  # pragma: no cover
    http = None  # type: ignore

COOKIE_NAMES = ("JSESSIONID", "SWSID")
SUCCESSFUL_FINGERPRINTS: set[str] = set()
LAST_ATTEMPT_AT: dict[str, float] = {}
RETRY_COOLDOWN_SECONDS = 30.0
LAST_VALUES: dict[str, str] = {}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def cookie_pairs(raw: str) -> dict[str, str]:
    output: dict[str, str] = {}
    for part in (raw or "").split(";"):
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        key = key.strip()
        value = value.strip()
        if key in COOKIE_NAMES and value:
            output[key] = value
    return output


def set_cookie_pairs(values: Iterable[str]) -> dict[str, str]:
    output: dict[str, str] = {}
    for raw in values:
        first = (raw or "").split(";", 1)[0]
        if "=" not in first:
            continue
        key, value = first.split("=", 1)
        key = key.strip()
        value = value.strip()
        if key in COOKIE_NAMES and value:
            output[key] = value
    return output


def canonical_cookie(values: dict[str, str]) -> str | None:
    jsessionid = str(values.get("JSESSIONID") or "").strip()
    swsid = str(values.get("SWSID") or "").strip()
    if not jsessionid or not swsid:
        return None
    return f"JSESSIONID={jsessionid}; SWSID={swsid}"


def secret_fingerprint(cookie: str) -> str:
    return hashlib.sha256(cookie.encode("utf-8", errors="replace")).hexdigest()[:20]


def safe_profile_id(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower()).strip("-")
    if not normalized:
        raise ValueError("profile name does not produce a valid local id")
    return normalized[:80]


def workspace_for_role(role: str) -> str:
    role = (role or "user").strip().lower()
    if role == "crawler":
        return os.environ.get(
            "SMALLVERSE_CRAWLER_REMOTE_WORKSPACE",
            "/opt/smallverse-staging-dual/workspace",
        )
    if role == "user":
        return os.environ.get(
            "SMALLVERSE_USER_REMOTE_WORKSPACE",
            "/opt/smallverse/workspace",
        )
    raise ValueError("role must be user or crawler")


def atomic_write(path: Path, value: str, mode: int = 0o600) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        path.parent.chmod(0o700)
    except OSError:
        pass
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    temporary = Path(temporary_name)
    try:
        os.fchmod(descriptor, mode)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(value)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        try:
            path.chmod(mode)
        except OSError:
            pass
    finally:
        temporary.unlink(missing_ok=True)


def local_session_root() -> Path:
    configured = os.environ.get("SMALLVERSE_LOCAL_SESSION_ROOT", "").strip()
    if configured:
        return Path(configured).expanduser()
    return Path.home() / "SmallverseLab" / "session"


def append_public_event(payload: dict[str, Any]) -> None:
    path = local_session_root() / "session-sync-events.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        path.parent.chmod(0o700)
    except OSError:
        pass
    safe = {
        key: value
        for key, value in payload.items()
        if key not in {"cookie", "jsessionid", "svsid", "session_token"}
    }
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(safe, sort_keys=True) + "\n")
    try:
        path.chmod(0o600)
    except OSError:
        pass


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


class SyncConfig:
    """Immutable session-sync settings compatible with mitmproxy's script loader.

    mitmproxy executes addons through a loader that does not always register the
    module in ``sys.modules`` before execution. ``dataclasses.dataclass`` can
    crash in that environment on Python 3.12, so this intentionally uses a
    small explicit class instead.
    """

    __slots__ = (
        "profile",
        "role",
        "ssh_host",
        "remote_workspace",
        "remote_python",
        "remote_source",
    )

    def __init__(
        self,
        *,
        profile: str,
        role: str,
        ssh_host: str,
        remote_workspace: str,
        remote_python: str,
        remote_source: str,
    ) -> None:
        object.__setattr__(self, "profile", profile)
        object.__setattr__(self, "role", role)
        object.__setattr__(self, "ssh_host", ssh_host)
        object.__setattr__(self, "remote_workspace", remote_workspace)
        object.__setattr__(self, "remote_python", remote_python)
        object.__setattr__(self, "remote_source", remote_source)

    def __setattr__(self, name: str, value: object) -> None:
        if hasattr(self, name):
            raise AttributeError("SyncConfig is immutable")
        object.__setattr__(self, name, value)

    @classmethod
    def from_environment(cls) -> "SyncConfig":
        profile = os.environ.get("SMALLVERSE_CAPTURE_PROFILE", "").strip()
        role = os.environ.get("SMALLVERSE_CAPTURE_ROLE", "user").strip().lower()
        if not profile:
            raise ValueError("SMALLVERSE_CAPTURE_PROFILE is required")
        if role not in {"user", "crawler"}:
            raise ValueError("SMALLVERSE_CAPTURE_ROLE must be user or crawler")
        return cls(
            profile=profile,
            role=role,
            ssh_host=os.environ.get("SMALLVERSE_REMOTE_HOST", "casa").strip() or "casa",
            remote_workspace=workspace_for_role(role),
            remote_python=os.environ.get(
                "SMALLVERSE_REMOTE_PYTHON",
                "/opt/smallverse-universal/.venv/bin/python",
            ).strip(),
            remote_source=os.environ.get(
                "SMALLVERSE_REMOTE_SOURCE",
                "/opt/smallverse-universal/current",
            ).strip(),
        )


def remote_import(config: SyncConfig, cookie: str) -> dict[str, Any]:
    # VPS renewal runs the importer on the same machine as the capture proxy.
    # Avoid an SSH hop there: service accounts intentionally have no SSH keys.
    if os.environ.get("SMALLVERSE_DIRECT_IMPORT", "").strip() == "1":
        descriptor, temporary_name = tempfile.mkstemp(prefix=".smallverse-cookie-")
        temporary = Path(temporary_name)
        try:
            os.fchmod(descriptor, 0o600)
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                handle.write(cookie + "\n")
            worker = pwd.getpwnam("smallverse-worker")
            os.chown(temporary, worker.pw_uid, worker.pw_gid)
            completed = subprocess.run(
                [
                    "sudo",
                    "-u",
                    "smallverse-worker",
                    "env",
                    f"PYTHONPATH={config.remote_source}",
                    config.remote_python,
                    "-m",
                    "smallverse_core.session_profile_cli",
                    "--workspace-root",
                    config.remote_workspace,
                    "import-cookie",
                    "--name",
                    config.profile,
                    "--role",
                    config.role,
                    "--cookie-file",
                    str(temporary),
                ],
                env=os.environ.copy(),
                text=True,
                capture_output=True,
                timeout=45,
                check=False,
            )
        finally:
            temporary.unlink(missing_ok=True)
        if completed.returncode != 0:
            detail = (completed.stderr or completed.stdout or "local session import failed").strip()
            raise RuntimeError(detail[-1200:])
        try:
            payload = json.loads(completed.stdout)
        except json.JSONDecodeError as exc:
            raise RuntimeError("local session import returned invalid JSON") from exc
        if not isinstance(payload, dict):
            raise RuntimeError("local session import returned invalid JSON")
        return payload

    remote_script = r'''
set -euo pipefail
umask 077
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
cat > "$tmp"
PYTHONPATH="$REMOTE_SOURCE" "$REMOTE_PYTHON" \
  -m smallverse_core.session_profile_cli \
  --workspace-root "$REMOTE_WORKSPACE" \
  import-cookie \
  --name "$PROFILE_NAME" \
  --role "$PROFILE_ROLE" \
  --cookie-file "$tmp"
'''
    environment_prefix = (
        f"PROFILE_NAME={shell_quote(config.profile)} "
        f"PROFILE_ROLE={shell_quote(config.role)} "
        f"REMOTE_WORKSPACE={shell_quote(config.remote_workspace)} "
        f"REMOTE_PYTHON={shell_quote(config.remote_python)} "
        f"REMOTE_SOURCE={shell_quote(config.remote_source)} "
    )
    remote_command = (
        environment_prefix
        + "bash -c "
        + shell_quote(remote_script)
    )
    completed = subprocess.run(
        [
            "ssh",
            "-o",
            "ClearAllForwardings=yes",
            config.ssh_host,
            remote_command,
        ],
        input=cookie,
        text=True,
        capture_output=True,
        timeout=45,
        check=False,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "remote session import failed").strip()
        raise RuntimeError(detail[-1200:])
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError("remote session import returned invalid JSON") from exc
    if not isinstance(payload, dict) or not payload.get("ok"):
        raise RuntimeError("remote session import did not report success")
    profile = payload.get("profile")
    if not isinstance(profile, dict):
        raise RuntimeError("remote session import omitted profile metadata")
    if str(profile.get("name") or "").casefold() != config.profile.casefold():
        raise RuntimeError("remote profile name verification failed")
    if str(profile.get("role") or "") != config.role:
        raise RuntimeError("remote profile role verification failed")
    if int(profile.get("session_generation") or 0) < 1:
        raise RuntimeError("remote session generation verification failed")
    if not str(profile.get("fingerprint") or ""):
        raise RuntimeError("remote session fingerprint verification failed")
    return payload


def write_local_profile(config: SyncConfig, cookie: str, remote_payload: dict[str, Any]) -> None:
    values = cookie_pairs(cookie)
    local_id = safe_profile_id(config.profile)
    root = local_session_root()
    profile_root = root / "profiles" / local_id
    profile = remote_payload["profile"]
    now = utc_now()
    metadata = {
        "profile_name": config.profile,
        "label": config.profile,
        "role": config.role,
        "captured_at": now,
        "updated_at": now,
        "fingerprint": secret_fingerprint(cookie),
        "remote_synced": True,
        "remote_profile_id": profile.get("profile_id"),
        "remote_session_generation": profile.get("session_generation"),
        "session_generation": profile.get("session_generation"),
        "remote_fingerprint": profile.get("fingerprint"),
        "remote_workspace": config.remote_workspace,
        "cookie_length": len(cookie),
        "has_jsessionid": True,
        "has_swsid": True,
    }
    atomic_write(profile_root / "cookie.txt", cookie + "\n")
    atomic_write(profile_root / "jsessionid.txt", values["JSESSIONID"] + "\n")
    atomic_write(profile_root / "svsid.txt", values["SWSID"] + "\n")
    atomic_write(profile_root / "metadata.json", json.dumps(metadata, indent=2, sort_keys=True) + "\n")

    if config.role == "user":
        atomic_write(root / "jsessionid.txt", values["JSESSIONID"] + "\n")
        atomic_write(root / "svsid.txt", values["SWSID"] + "\n")
        atomic_write(root / "session.json", json.dumps(metadata, indent=2, sort_keys=True) + "\n")
        atomic_write(root / "cookie.txt", cookie + "\n")


def sync_cookie(config: SyncConfig, cookie: str, *, source: str) -> bool:
    fingerprint = secret_fingerprint(cookie)
    if fingerprint in SUCCESSFUL_FINGERPRINTS:
        return False
    now = time.monotonic()
    previous_attempt = LAST_ATTEMPT_AT.get(fingerprint)
    if previous_attempt is not None and now - previous_attempt < RETRY_COOLDOWN_SECONDS:
        return False
    LAST_ATTEMPT_AT[fingerprint] = now
    append_public_event({
        "at": utc_now(),
        "event": "sync_attempt",
        "profile": config.profile,
        "role": config.role,
        "source": source,
        "fingerprint": fingerprint,
        "remote_workspace": config.remote_workspace,
    })
    try:
        payload = remote_import(config, cookie)
        write_local_profile(config, cookie, payload)
        SUCCESSFUL_FINGERPRINTS.add(fingerprint)
        profile = payload["profile"]
        append_public_event({
            "at": utc_now(),
            "event": "sync_succeeded",
            "profile": config.profile,
            "role": config.role,
            "source": source,
            "fingerprint": fingerprint,
            "remote_profile_id": profile.get("profile_id"),
            "remote_session_generation": profile.get("session_generation"),
            "remote_fingerprint": profile.get("fingerprint"),
            "remote_workspace": config.remote_workspace,
        })
        print(
            "[session] synced "
            f"profile={config.profile!r} role={config.role} "
            f"generation={profile.get('session_generation')} "
            f"workspace={config.remote_workspace}",
            flush=True,
        )
        return True
    except Exception as exc:
        append_public_event({
            "at": utc_now(),
            "event": "sync_failed",
            "profile": config.profile,
            "role": config.role,
            "source": source,
            "fingerprint": fingerprint,
            "remote_workspace": config.remote_workspace,
            "error_type": type(exc).__name__,
            "error": str(exc)[-1200:],
        })
        print(
            "[session] sync failed "
            f"profile={config.profile!r} role={config.role}: {type(exc).__name__}: {exc}",
            flush=True,
        )
        return False


def host_is_smallverse(host: str) -> bool:
    normalized = (host or "").split(":", 1)[0].strip().lower().rstrip(".")
    return normalized == "smallverse.app" or normalized.endswith(".smallverse.app")


def observe(values: dict[str, str], config: SyncConfig, *, source: str) -> None:
    for name in COOKIE_NAMES:
        value = str(values.get(name) or "").strip()
        if value:
            LAST_VALUES[name] = value
    cookie = canonical_cookie(LAST_VALUES)
    if cookie:
        sync_cookie(config, cookie, source=source)


class SessionCaptureAddon:
    def __init__(self) -> None:
        self.config: SyncConfig | None = None

    def load(self, loader: Any) -> None:  # pragma: no cover
        self.config = SyncConfig.from_environment()
        print(
            "[session] capture ready "
            f"profile={self.config.profile!r} role={self.config.role} "
            f"remote_workspace={self.config.remote_workspace}",
            flush=True,
        )

    def request(self, flow: Any) -> None:  # pragma: no cover
        if not self.config or not host_is_smallverse(str(flow.request.host or "")):
            return
        pairs = cookie_pairs(str(flow.request.headers.get("Cookie", "") or ""))
        if pairs:
            observe(pairs, self.config, source="request-cookie")

    def response(self, flow: Any) -> None:  # pragma: no cover
        if not self.config or not host_is_smallverse(str(flow.request.host or "")):
            return
        try:
            values = list(flow.response.headers.get_all("Set-Cookie"))
        except Exception:
            raw = flow.response.headers.get("Set-Cookie", "")
            values = [str(raw)] if raw else []
        pairs = set_cookie_pairs(values)
        if pairs:
            observe(pairs, self.config, source="response-set-cookie")


addons = [SessionCaptureAddon()]
