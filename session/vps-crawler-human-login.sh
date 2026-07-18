#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:-}"
TIMEOUT="${SMALLVERSE_HUMAN_LOGIN_TIMEOUT:-1800}"
ROOT=/var/lib/smallverse-crawler-renewal
CLIENT=/opt/smallverse-crawler-client/SmallVerse/smallverse
HELPER=/opt/smallverse-crawler-client/crawler_autologin.mjs
IMPORTER=/opt/smallverse-crawler-client/import-session-cookie.py
CREDS=/etc/smallverse/crawler-credentials.json
PROJECT=/opt/smallverse-staging-dual
WORKSPACE=/opt/smallverse-staging-dual/workspace

case "$PROFILE" in
  crawler-01)
    VNC_PORT=5901
    WEB_PORT=6081
    ;;
  crawler-02)
    VNC_PORT=5902
    WEB_PORT=6082
    ;;
  *)
    echo "ERROR: profile must be crawler-01 or crawler-02" >&2
    exit 2
    ;;
esac

for path in "$CLIENT" "$HELPER" "$IMPORTER" "$CREDS"; do
  [[ -r "$path" ]] || {
    echo "ERROR: VPS crawler human login is not fully provisioned." >&2
    exit 1
  }
done
for binary in curl flock node python3 websockify x11vnc; do
  command -v "$binary" >/dev/null 2>&1 || {
    echo "ERROR: $binary is required for VPS crawler human login." >&2
    exit 1
  }
done

mkdir -p "$ROOT/human-login"
chmod 700 "$ROOT/human-login"
exec 9>"$ROOT/human-login/$PROFILE.lock"
if ! flock -n 9; then
  echo "ERROR: a human login window is already open for $PROFILE." >&2
  exit 1
fi

PROFILE_DIR="$ROOT/profiles/$PROFILE"
client_line="$(
  ps -eo pid=,args= | awk -v marker="--user-data-dir=$PROFILE_DIR" \
    'index($0, marker) && $0 !~ /--type=/ {print; exit}'
)"
CLIENT_PID="$(awk '{print $1}' <<<"$client_line")"
DEBUG_PORT="$(sed -n 's/.*--remote-debugging-port=\([0-9][0-9]*\).*/\1/p' <<<"$client_line")"

if [[ -z "$CLIENT_PID" || -z "$DEBUG_PORT" || ! -r "/proc/$CLIENT_PID/environ" ]]; then
  echo "ERROR: the VPS $PROFILE Smallverse client is not running." >&2
  exit 1
fi
if ! curl -fsS "http://127.0.0.1:$DEBUG_PORT/json/list" >/dev/null; then
  echo "ERROR: the VPS $PROFILE Smallverse control endpoint is unavailable." >&2
  exit 1
fi

DISPLAY_VALUE="$(tr '\0' '\n' <"/proc/$CLIENT_PID/environ" | sed -n 's/^DISPLAY=//p' | head -1)"
XAUTHORITY_VALUE="$(tr '\0' '\n' <"/proc/$CLIENT_PID/environ" | sed -n 's/^XAUTHORITY=//p' | head -1)"
if [[ -z "$DISPLAY_VALUE" || -z "$XAUTHORITY_VALUE" || ! -r "$XAUTHORITY_VALUE" ]]; then
  echo "ERROR: the VPS $PROFILE display cannot be attached securely." >&2
  exit 1
fi

COOKIE_FILE="$(mktemp "$ROOT/human-login/$PROFILE.cookie.XXXXXX")"
VNC_LOG="$ROOT/human-login/$PROFILE.vnc.log"
WEB_LOG="$ROOT/human-login/$PROFILE.web.log"
LOGIN_LOG="$ROOT/human-login/$PROFILE.login.log"
: >"$VNC_LOG"
: >"$WEB_LOG"
: >"$LOGIN_LOG"
chmod 600 "$COOKIE_FILE" "$VNC_LOG" "$WEB_LOG" "$LOGIN_LOG"
VNC_PID=""
WEB_PID=""
LOGIN_PID=""

cleanup() {
  for pid in "$LOGIN_PID" "$WEB_PID" "$VNC_PID"; do
    [[ -n "$pid" ]] || continue
    kill "$pid" >/dev/null 2>&1 || true
    wait "$pid" >/dev/null 2>&1 || true
  done
  rm -f "$COOKIE_FILE"
}
trap cleanup EXIT INT TERM HUP

x11vnc \
  -display "$DISPLAY_VALUE" \
  -auth "$XAUTHORITY_VALUE" \
  -rfbport "$VNC_PORT" \
  -listen 127.0.0.1 \
  -forever -shared -nopw -quiet \
  -o "$VNC_LOG" &
VNC_PID=$!

websockify \
  --web=/usr/share/novnc \
  "127.0.0.1:$WEB_PORT" \
  "127.0.0.1:$VNC_PORT" \
  >"$WEB_LOG" 2>&1 &
WEB_PID=$!

for _ in $(seq 1 50); do
  if curl -fsS "http://127.0.0.1:$WEB_PORT/vnc.html" >/dev/null 2>&1; then
    break
  fi
  kill -0 "$VNC_PID" "$WEB_PID" >/dev/null 2>&1 || {
    echo "ERROR: the private VPS screen bridge did not start." >&2
    exit 1
  }
  sleep 0.1
done
curl -fsS "http://127.0.0.1:$WEB_PORT/vnc.html" >/dev/null || {
  echo "ERROR: the private VPS screen bridge is unavailable." >&2
  exit 1
}

node "$HELPER" \
  --profile "$PROFILE" \
  --port "$DEBUG_PORT" \
  --timeout "$TIMEOUT" \
  --credentials-file "$CREDS" \
  --cookie-file "$COOKIE_FILE" \
  --submit false \
  >"$LOGIN_LOG" 2>&1 &
LOGIN_PID=$!

echo "READY profile=$PROFILE web_port=$WEB_PORT"
deadline=$((SECONDS + TIMEOUT))
while kill -0 "$CLIENT_PID" >/dev/null 2>&1; do
  if [[ -s "$COOKIE_FILE" ]]; then
    if SMALLVERSE_CAPTURE_PROFILE="$PROFILE" \
      SMALLVERSE_CAPTURE_ROLE=crawler \
      SMALLVERSE_DIRECT_IMPORT=1 \
      SMALLVERSE_CRAWLER_REMOTE_WORKSPACE="$WORKSPACE" \
      SMALLVERSE_REMOTE_PYTHON=/opt/smallverse-universal/.venv/bin/python \
      SMALLVERSE_REMOTE_SOURCE="$PROJECT" \
      python3 "$IMPORTER" --cookie-file "$COOKIE_FILE"; then
      echo "SYNCED profile=$PROFILE"
      exit 0
    fi
    : >"$COOKIE_FILE"
  fi
  if (( SECONDS >= deadline )); then
    echo "ERROR: timed out waiting for human verification for $PROFILE." >&2
    exit 1
  fi
  kill -0 "$VNC_PID" "$WEB_PID" >/dev/null 2>&1 || {
    echo "ERROR: the private VPS screen bridge stopped unexpectedly." >&2
    exit 1
  }
  sleep 0.25
done

echo "ERROR: the VPS $PROFILE Smallverse client closed before login completed." >&2
exit 1
