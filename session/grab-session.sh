#!/usr/bin/env bash
set -u

PROFILE="${1:-}"
ROLE="${2:-user}"
REMOTE_HOST="${SMALLVERSE_REMOTE_HOST:-casa}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADDON="$HERE/auto_jsessionid.py"
AUTO_LOGIN="${SMALLVERSE_AUTO_LOGIN:-0}"
HUMAN_LOGIN="${SMALLVERSE_HUMAN_LOGIN:-0}"
ISOLATED_PROFILE="${SMALLVERSE_ISOLATED_PROFILE:-0}"
CLOSE_AFTER_SYNC="${SMALLVERSE_CLOSE_AFTER_SYNC:-0}"
AUTO_LOGIN_TIMEOUT="${SMALLVERSE_AUTO_LOGIN_TIMEOUT:-120}"

usage() {
  cat <<'USAGE'
Usage: grab-session.sh PROFILE [user|crawler]

Launches Smallverse through a private local mitmproxy instance. Every distinct
JSESSIONID+SWSID pair observed during the game session is saved locally and
synchronized privately to the matching remote session-profile store.

Optional automatic crawler renewal environment:
  SMALLVERSE_ISOLATED_PROFILE=1  separate Electron user-data directory
  SMALLVERSE_AUTO_LOGIN=1        retrieve crawler login from GNOME Keyring
  SMALLVERSE_HUMAN_LOGIN=1       fill login but wait for a human to submit
  SMALLVERSE_CLOSE_AFTER_SYNC=1  close only this isolated game after sync

Credentials are never accepted through command-line arguments or environment
variables. Automatic login reads them directly from Secret Service locally.
USAGE
}

if [[ -z "$PROFILE" ]]; then
  usage >&2
  exit 2
fi
if [[ "$ROLE" != "user" && "$ROLE" != "crawler" ]]; then
  echo "ERROR: role must be user or crawler" >&2
  exit 2
fi
if [[ "$AUTO_LOGIN" == 1 && "$ROLE" != crawler ]]; then
  echo "ERROR: automatic keyring login is available only for crawler profiles" >&2
  exit 2
fi
if [[ "$AUTO_LOGIN" == 1 && "$PROFILE" != crawler-01 && "$PROFILE" != crawler-02 ]]; then
  echo "ERROR: automatic keyring login supports crawler-01 and crawler-02 only" >&2
  exit 2
fi
if [[ "$HUMAN_LOGIN" == 1 && "$AUTO_LOGIN" != 1 ]]; then
  echo "ERROR: human login mode requires SMALLVERSE_AUTO_LOGIN=1" >&2
  exit 2
fi
if [[ ! -f "$ADDON" ]]; then
  echo "ERROR: missing capture addon: $ADDON" >&2
  exit 2
fi
for binary in mitmdump ssh python3; do
  if ! command -v "$binary" >/dev/null 2>&1; then
    echo "ERROR: $binary is not installed or is not on PATH." >&2
    exit 2
  fi
done
if [[ "$AUTO_LOGIN" == 1 ]]; then
  for binary in node secret-tool; do
    if ! command -v "$binary" >/dev/null 2>&1; then
      echo "ERROR: $binary is required for automatic crawler renewal." >&2
      exit 2
    fi
  done
  if [[ ! -f "$HERE/crawler_autologin.mjs" ]]; then
    echo "ERROR: missing automatic login helper." >&2
    exit 2
  fi
fi

# Fail before opening the game. This never prints session values.
if ! ssh -o ClearAllForwardings=yes -o ConnectTimeout=10 "$REMOTE_HOST" \
  'test -x /opt/smallverse-universal/.venv/bin/python && test -d /opt/smallverse-universal/current' >/dev/null 2>&1; then
  echo "ERROR: cannot reach the Smallverse session importer on $REMOTE_HOST." >&2
  exit 1
fi

free_port() {
  python3 - <<'PY'
import socket
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    print(sock.getsockname()[1])
PY
}

PORT="$(free_port)"
DEBUG_PORT=""
if [[ "$AUTO_LOGIN" == 1 ]]; then
  DEBUG_PORT="$(free_port)"
fi

export SMALLVERSE_CAPTURE_PROFILE="$PROFILE"
export SMALLVERSE_CAPTURE_ROLE="$ROLE"
export SMALLVERSE_REMOTE_HOST="$REMOTE_HOST"

MITM_LOG="$HERE/last-capture.log"
: > "$MITM_LOG"
chmod 600 "$MITM_LOG" 2>/dev/null || true

mitmdump \
  --listen-host 127.0.0.1 \
  --listen-port "$PORT" \
  --set block_global=false \
  --set connection_strategy=lazy \
  --quiet \
  -s "$ADDON" \
  > >(tee -a "$MITM_LOG") \
  2> >(tee -a "$MITM_LOG" >&2) &
MITM_PID=$!
GAME_PID=""
LOGIN_PID=""

cleanup() {
  if [[ -n "$LOGIN_PID" ]]; then
    kill "$LOGIN_PID" >/dev/null 2>&1 || true
    wait "$LOGIN_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$GAME_PID" ]]; then
    kill "$GAME_PID" >/dev/null 2>&1 || true
    wait "$GAME_PID" >/dev/null 2>&1 || true
  fi
  kill "$MITM_PID" >/dev/null 2>&1 || true
  wait "$MITM_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM HUP

MITM_READY=0
for _ in $(seq 1 50); do
  if ! kill -0 "$MITM_PID" >/dev/null 2>&1; then
    echo "ERROR: mitmdump exited before becoming ready." >&2
    tail -40 "$MITM_LOG" >&2 || true
    exit 1
  fi
  if python3 - "$PORT" <<'PY' >/dev/null 2>&1
import socket, sys
with socket.create_connection(("127.0.0.1", int(sys.argv[1])), timeout=0.2):
    pass
PY
  then
    MITM_READY=1
    break
  fi
  sleep 0.1
done

if [[ "$MITM_READY" != 1 ]]; then
  echo "ERROR: mitmdump stayed alive but never opened its local proxy port." >&2
  tail -40 "$MITM_LOG" >&2 || true
  exit 1
fi

proxy_flags=(
  "--proxy-server=http://127.0.0.1:${PORT}"
  "--ignore-certificate-errors"
)

find_desktop_exec() {
  local desktop exec_line
  desktop="$(find "$HOME/.local/share/applications" /usr/share/applications \
    -maxdepth 1 -type f -iname '*smallverse*.desktop' 2>/dev/null | head -1 || true)"
  [[ -n "$desktop" ]] || return 1
  exec_line="$(awk -F= '/^Exec=/{print substr($0,6); exit}' "$desktop")"
  exec_line="$(printf '%s' "$exec_line" | sed -E 's/[[:space:]]+%[fFuUdDnNickvm]//g')"
  [[ -n "$exec_line" ]] || return 1
  printf '%s' "$exec_line"
}

launch_command="${SMALLVERSE_LAUNCH_CMD:-}"
if [[ -z "$launch_command" ]] && command -v smallverse >/dev/null 2>&1; then
  launch_command="$(command -v smallverse)"
fi
if [[ -z "$launch_command" ]] && command -v Smallverse >/dev/null 2>&1; then
  launch_command="$(command -v Smallverse)"
fi
if [[ -z "$launch_command" ]]; then
  launch_command="$(find_desktop_exec || true)"
fi
if [[ -z "$launch_command" ]]; then
  appimage="$(find "$HOME/Downloads" "$HOME/Applications" -maxdepth 2 -type f \
    -iname '*smallverse*.AppImage' 2>/dev/null | head -1 || true)"
  if [[ -n "$appimage" ]]; then
    chmod +x "$appimage" 2>/dev/null || true
    printf -v launch_command '%q' "$appimage"
  fi
fi

if [[ -z "$launch_command" ]]; then
  echo "ERROR: could not locate the Smallverse executable." >&2
  echo "Set SMALLVERSE_LAUNCH_CMD to the command you normally use to launch it." >&2
  exit 1
fi

profile_flags=()
if [[ "$ISOLATED_PROFILE" == 1 ]]; then
  PROFILE_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/smallverse-beacon/crawlers/$PROFILE"
  mkdir -p "$PROFILE_ROOT"
  chmod 700 "${XDG_DATA_HOME:-$HOME/.local/share}/smallverse-beacon" \
    "${XDG_DATA_HOME:-$HOME/.local/share}/smallverse-beacon/crawlers" \
    "$PROFILE_ROOT" 2>/dev/null || true
  profile_flags+=("--user-data-dir=$PROFILE_ROOT")
  # This older Electron build's GPU child is killed by Linux seccomp while
  # creating renderer threads, after which the browser aborts with exit 133.
  # Keeping GPU work in the already-sandboxed browser process avoids that
  # broken child-process path while preserving rendering for the login/game.
  profile_flags+=(
    "--in-process-gpu"
    "--disable-gpu-sandbox"
    "--disable-dev-shm-usage"
  )
fi
if [[ "$AUTO_LOGIN" == 1 ]]; then
  profile_flags+=(
    "--remote-debugging-address=127.0.0.1"
    "--remote-debugging-port=$DEBUG_PORT"
  )
fi

shell_join() {
  local output="" value quoted
  for value in "$@"; do
    printf -v quoted '%q' "$value"
    output+=" $quoted"
  done
  printf '%s' "$output"
}

STARTED_AT="$(python3 - <<'PY'
from datetime import datetime, timezone
print(datetime.now(timezone.utc).isoformat())
PY
)"
EVENTS_PATH="${SMALLVERSE_LOCAL_SESSION_ROOT:-$HOME/SmallverseLab/session}/session-sync-events.jsonl"

sync_seen_since_start() {
  python3 - "$EVENTS_PATH" "$PROFILE" "$STARTED_AT" <<'PY'
import json, sys
from datetime import datetime
from pathlib import Path
path = Path(sys.argv[1])
profile = sys.argv[2]
started = datetime.fromisoformat(sys.argv[3].replace("Z", "+00:00"))
if not path.is_file():
    raise SystemExit(1)
for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
    try:
        row = json.loads(line)
        at = datetime.fromisoformat(str(row.get("at") or "").replace("Z", "+00:00"))
    except Exception:
        continue
    if at < started:
        continue
    if row.get("event") == "sync_succeeded" and row.get("profile") == profile and row.get("role") == "crawler":
        raise SystemExit(0)
raise SystemExit(1)
PY
}

echo "[session] watching Smallverse for profile='$PROFILE' role=$ROLE"
echo "[session] remote target: $REMOTE_HOST ($(if [[ "$ROLE" == crawler ]]; then echo /opt/smallverse-staging-dual/workspace; else echo /opt/smallverse/workspace; fi))"
if [[ "$ISOLATED_PROFILE" == 1 ]]; then
  echo "[session] isolated application profile enabled for $PROFILE"
fi
echo "[session] cookies and credentials are never printed"

all_flags=("${proxy_flags[@]}" "${profile_flags[@]}")
launch_suffix="$(shell_join "${all_flags[@]}")"
# VS Code/Codex desktop terminals may export ELECTRON_RUN_AS_NODE=1 for their
# own Electron helpers. Smallverse must never inherit it or its Electron binary
# behaves like Node and rejects Chromium flags such as --proxy-server.
env -u ELECTRON_RUN_AS_NODE \
  bash -lc "exec $launch_command$launch_suffix" &
GAME_PID=$!

if [[ "$AUTO_LOGIN" == 1 ]]; then
  login_submit=true
  if [[ "$HUMAN_LOGIN" == 1 ]]; then
    login_submit=false
  fi
  node "$HERE/crawler_autologin.mjs" \
    --profile "$PROFILE" \
    --port "$DEBUG_PORT" \
    --timeout "$AUTO_LOGIN_TIMEOUT" \
    --submit "$login_submit" \
    >>"$MITM_LOG" 2>&1 &
  LOGIN_PID=$!
fi

SYNCED=0
GAME_STATUS=0
if [[ "$CLOSE_AFTER_SYNC" == 1 ]]; then
  deadline=$((SECONDS + AUTO_LOGIN_TIMEOUT + 60))
  while kill -0 "$GAME_PID" >/dev/null 2>&1; do
    if sync_seen_since_start; then
      SYNCED=1
      echo "[session] fresh session synchronized for $PROFILE"
      sleep 2
      kill "$GAME_PID" >/dev/null 2>&1 || true
      break
    fi
    if (( SECONDS >= deadline )); then
      echo "ERROR: timed out before a fresh session was synchronized for $PROFILE" >&2
      kill "$GAME_PID" >/dev/null 2>&1 || true
      break
    fi
    sleep 1
  done
fi

wait "$GAME_PID" 2>/dev/null
GAME_STATUS=$?
GAME_PID=""

# Allow final Set-Cookie responses to flush before stopping the proxy.
sleep 2
if [[ "$SYNCED" != 1 ]] && sync_seen_since_start; then
  SYNCED=1
fi

echo "[session] Smallverse exited (status=$GAME_STATUS)."
echo "[session] public sync log: $EVENTS_PATH"

if [[ "$CLOSE_AFTER_SYNC" == 1 ]]; then
  if [[ "$SYNCED" == 1 ]]; then
    exit 0
  fi
  exit 1
fi
exit "$GAME_STATUS"
