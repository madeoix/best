#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:-}"
HOST="${SMALLVERSE_CRAWLER_SSH_HOST:-casa}"
REMOTE_HELPER="${SMALLVERSE_CRAWLER_HUMAN_LOGIN_HELPER:-/opt/smallverse-crawler-client/vps-crawler-human-login.sh}"
REMOTE_TIMEOUT="${SMALLVERSE_HUMAN_LOGIN_TIMEOUT:-${SMALLVERSE_AUTO_LOGIN_TIMEOUT:-1800}}"

case "$PROFILE" in
  crawler-01) REMOTE_WEB_PORT=6081 ;;
  crawler-02) REMOTE_WEB_PORT=6082 ;;
  *)
    echo "ERROR: profile must be crawler-01 or crawler-02" >&2
    exit 2
    ;;
esac
if [[ ! "$REMOTE_HELPER" =~ ^/[A-Za-z0-9_./-]+$ ]]; then
  echo "ERROR: the configured VPS human-login helper path is invalid." >&2
  exit 2
fi
if [[ ! "$REMOTE_TIMEOUT" =~ ^[1-9][0-9]*$ ]]; then
  echo "ERROR: the VPS human-login timeout must be a positive number of seconds." >&2
  exit 2
fi

for binary in curl python3 ssh xdg-open; do
  command -v "$binary" >/dev/null 2>&1 || {
    echo "ERROR: $binary is required for the VPS login window." >&2
    exit 2
  }
done

free_port() {
  python3 - <<'PY'
import socket
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    print(sock.getsockname()[1])
PY
}

LOCAL_PORT="$(free_port)"
REMOTE_LOG="$(mktemp "${TMPDIR:-/tmp}/smallverse-${PROFILE}-remote-login.XXXXXX")"
METADATA_LOG="$(mktemp "${TMPDIR:-/tmp}/smallverse-${PROFILE}-metadata.XXXXXX")"
COLLECTOR_LOG="$(mktemp "${TMPDIR:-/tmp}/smallverse-${PROFILE}-collector.XXXXXX")"
chmod 600 "$REMOTE_LOG"
chmod 600 "$METADATA_LOG"
chmod 600 "$COLLECTOR_LOG"
REMOTE_PID=""
TUNNEL_PID=""

cleanup() {
  if [[ -n "$TUNNEL_PID" ]]; then
    kill "$TUNNEL_PID" >/dev/null 2>&1 || true
    wait "$TUNNEL_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$REMOTE_PID" ]]; then
    kill "$REMOTE_PID" >/dev/null 2>&1 || true
    wait "$REMOTE_PID" >/dev/null 2>&1 || true
  fi
  rm -f "$REMOTE_LOG" "$METADATA_LOG" "$COLLECTOR_LOG"
}
trap cleanup EXIT INT TERM HUP

ssh -o BatchMode=yes -o ClearAllForwardings=yes -o ConnectTimeout=12 \
  "$HOST" "sudo -n env SMALLVERSE_HUMAN_LOGIN_TIMEOUT=$REMOTE_TIMEOUT $REMOTE_HELPER $PROFILE" \
  >"$REMOTE_LOG" 2>&1 &
REMOTE_PID=$!

ssh -N \
  -o BatchMode=yes \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=20 \
  -o ServerAliveCountMax=3 \
  -L "127.0.0.1:$LOCAL_PORT:127.0.0.1:$REMOTE_WEB_PORT" \
  "$HOST" 2>/dev/null &
TUNNEL_PID=$!

ready=0
for _ in $(seq 1 200); do
  if curl -fsS "http://127.0.0.1:$LOCAL_PORT/vnc.html" >/dev/null 2>&1; then
    ready=1
    break
  fi
  if ! kill -0 "$REMOTE_PID" "$TUNNEL_PID" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

if [[ "$ready" != 1 ]]; then
  tail -20 "$REMOTE_LOG" >&2 || true
  echo "ERROR: the private VPS login window did not become ready." >&2
  exit 1
fi

URL="http://127.0.0.1:$LOCAL_PORT/vnc.html?autoconnect=true&resize=scale&path=websockify"
xdg-open "$URL" >/dev/null 2>&1 || {
  echo "ERROR: could not open the VPS login window in your browser." >&2
  exit 1
}
echo "[session] opened the VPS-hosted $PROFILE screen through a private SSH tunnel"
echo "[session] solve reCAPTCHA and click login; Smallverse remains on the VPS"

if wait "$REMOTE_PID"; then
  code=0
else
  code=$?
fi
REMOTE_PID=""
if [[ "$code" -ne 0 ]]; then
  tail -20 "$REMOTE_LOG" >&2 || true
  exit "$code"
fi

# Mirror only non-secret profile metadata so the local Beacon panel can show
# the VPS session generation and readiness. The cookie itself never leaves the
# VPS and the remote CLI explicitly reports that no secrets were exposed.
ssh -o BatchMode=yes -o ClearAllForwardings=yes -o ConnectTimeout=12 \
  "$HOST" \
  "sudo -u smallverse-worker env PYTHONPATH=/opt/smallverse-staging-dual /opt/smallverse-universal/.venv/bin/python -m smallverse_core.session_profile_cli --workspace-root /opt/smallverse-staging-dual/workspace list" \
  >"$METADATA_LOG"

# A valid login and an active collector are separate states. Once the human
# login succeeds, enable the slow profile collector and shared config harvest,
# then mirror only their non-secret systemd state for Observatory.
ssh -o BatchMode=yes -o ClearAllForwardings=yes -o ConnectTimeout=12 "$HOST" \
  "sudo -n systemctl enable --now smallverse-popular-avatar-collector@${PROFILE}.timer smallverse-avatar-harvest.timer >/dev/null 2>&1 || true; sudo -n python3 - '${PROFILE}'" \
  >"$COLLECTOR_LOG" <<'PYREMOTE'
import json, subprocess, sys
profile = sys.argv[1]
unit = f"smallverse-popular-avatar-collector@{profile}.timer"
def state(action, name):
    result = subprocess.run(["systemctl", action, name], text=True, capture_output=True)
    return (result.stdout or result.stderr).strip() or "unknown"
print(json.dumps({
    "collector_unit": unit,
    "collector_active": state("is-active", unit),
    "collector_enabled": state("is-enabled", unit),
    "harvest_active": state("is-active", "smallverse-avatar-harvest.timer"),
    "harvest_enabled": state("is-enabled", "smallverse-avatar-harvest.timer"),
}))
PYREMOTE

python3 - "$METADATA_LOG" "$COLLECTOR_LOG" "$PROFILE" "${SMALLVERSE_LOCAL_SESSION_ROOT:-$HOME/SmallverseLab/session}" <<'PY'
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

source = Path(sys.argv[1])
collector_source = Path(sys.argv[2])
profile_name = sys.argv[3]
session_root = Path(sys.argv[4]).expanduser()
document = json.loads(source.read_text(encoding="utf-8"))
if document.get("secrets_exposed") is not False:
    raise SystemExit("remote metadata response was not secret-safe")
profile = next(
    (row for row in document.get("profiles", []) if row.get("name") == profile_name),
    None,
)
if not profile or profile.get("role") != "crawler":
    raise SystemExit("remote crawler profile metadata was not found")
generation = int(profile.get("session_generation") or 0)
fingerprint = str(profile.get("fingerprint") or "")
if generation < 1 or not fingerprint or not profile.get("has_cookie"):
    raise SystemExit("remote crawler profile metadata is incomplete")
now = datetime.now(timezone.utc).isoformat()
try:
    collector = json.loads(collector_source.read_text(encoding="utf-8"))
except Exception:
    collector = {}
metadata = {
    "profile_name": profile_name,
    "label": profile_name,
    "role": "crawler",
    "captured_at": profile.get("updated_at") or now,
    "updated_at": now,
    "fingerprint": fingerprint,
    "remote_synced": True,
    "remote_profile_id": profile.get("profile_id"),
    "remote_session_generation": generation,
    "session_generation": generation,
    "remote_fingerprint": fingerprint,
    "remote_workspace": "/opt/smallverse-staging-dual/workspace",
    "has_jsessionid": True,
    "has_swsid": bool(profile.get("has_svsid", True)),
    "metadata_only": True,
    "collector_unit": collector.get("collector_unit"),
    "collector_active": collector.get("collector_active", "unknown"),
    "collector_enabled": collector.get("collector_enabled", "unknown"),
    "harvest_active": collector.get("harvest_active", "unknown"),
    "harvest_enabled": collector.get("harvest_enabled", "unknown"),
}
target = session_root / "profiles" / profile_name / "metadata.json"
target.parent.mkdir(parents=True, exist_ok=True)
target.parent.chmod(0o700)
descriptor, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
try:
    os.fchmod(descriptor, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2, sort_keys=True)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary_name, target)
finally:
    try:
        os.unlink(temporary_name)
    except FileNotFoundError:
        pass
PY

echo "[session] mirrored secret-free VPS metadata for $PROFILE"
exit 0
