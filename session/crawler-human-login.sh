#!/usr/bin/env bash
set -u

PROFILE="${1:-}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_HOST="${SMALLVERSE_REMOTE_HOST:-casa}"
TIMEOUT="${SMALLVERSE_AUTO_LOGIN_TIMEOUT:-600}"

if [[ "$PROFILE" != crawler-01 && "$PROFILE" != crawler-02 ]]; then
  echo "ERROR: profile must be crawler-01 or crawler-02" >&2
  exit 2
fi
for binary in node python3 secret-tool ssh; do
  if ! command -v "$binary" >/dev/null 2>&1; then
    echo "ERROR: $binary is required for interactive crawler login." >&2
    exit 2
  fi
done
if ! secret-tool lookup \
  application smallverse-beacon \
  kind crawler-login \
  profile "$PROFILE" >/dev/null 2>&1; then
  echo "ERROR: no encrypted login is stored for $PROFILE." >&2
  exit 2
fi
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

shell_join() {
  local output="" value quoted
  for value in "$@"; do
    printf -v quoted '%q' "$value"
    output+=" $quoted"
  done
  printf '%s' "$output"
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
  echo "ERROR: could not locate the Smallverse executable." >&2
  exit 1
fi

PROFILE_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/smallverse-beacon/crawlers/$PROFILE"
mkdir -p "$PROFILE_ROOT"
chmod 700 "$PROFILE_ROOT" 2>/dev/null || true

DEBUG_PORT="$(free_port)"
COOKIE_FILE="$(mktemp "${TMPDIR:-/tmp}/smallverse-${PROFILE}-cookie.XXXXXX")"
chmod 600 "$COOKIE_FILE"
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
  rm -f "$COOKIE_FILE"
}
trap cleanup EXIT INT TERM HUP

flags=(
  "--user-data-dir=$PROFILE_ROOT"
  "--in-process-gpu"
  "--disable-gpu-sandbox"
  "--disable-dev-shm-usage"
  "--remote-debugging-address=127.0.0.1"
  "--remote-debugging-port=$DEBUG_PORT"
)
launch_suffix="$(shell_join "${flags[@]}")"

export SMALLVERSE_CAPTURE_PROFILE="$PROFILE"
export SMALLVERSE_CAPTURE_ROLE=crawler
export SMALLVERSE_REMOTE_HOST="$REMOTE_HOST"

echo "[session] opening isolated $PROFILE login without the capture proxy"
echo "[session] credentials will be filled; solve reCAPTCHA and click login"
echo "[session] cookies and credentials are never printed"

env -u ELECTRON_RUN_AS_NODE \
  bash -lc "exec $launch_command$launch_suffix" &
GAME_PID=$!

node "$HERE/crawler_autologin.mjs" \
  --profile "$PROFILE" \
  --port "$DEBUG_PORT" \
  --timeout "$TIMEOUT" \
  --submit false \
  --cookie-file "$COOKIE_FILE" &
LOGIN_PID=$!

deadline=$((SECONDS + TIMEOUT))
SYNCED=0
while kill -0 "$GAME_PID" >/dev/null 2>&1; do
  if [[ -s "$COOKIE_FILE" ]]; then
    if python3 "$HERE/import-session-cookie.py" --cookie-file "$COOKIE_FILE"; then
      SYNCED=1
      echo "[session] fresh session synchronized for $PROFILE"
      kill "$GAME_PID" >/dev/null 2>&1 || true
      break
    fi
    : > "$COOKIE_FILE"
  fi
  if (( SECONDS >= deadline )); then
    echo "ERROR: timed out waiting for human verification for $PROFILE" >&2
    kill "$GAME_PID" >/dev/null 2>&1 || true
    break
  fi
  sleep 0.25
done

wait "$GAME_PID" 2>/dev/null
GAME_STATUS=$?
GAME_PID=""

if [[ "$SYNCED" == 1 ]]; then
  exit 0
fi
echo "ERROR: Smallverse closed before a fresh crawler session was synchronized (status=$GAME_STATUS)." >&2
exit 1
