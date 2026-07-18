#!/usr/bin/env bash
set -euo pipefail

PROFILE="${1:-}"
case "$PROFILE" in crawler-01|crawler-02) ;; *) echo "profile must be crawler-01 or crawler-02" >&2; exit 2;; esac

CREDS=/etc/smallverse/crawler-credentials.json
CLIENT=/opt/smallverse-crawler-client/SmallVerse/smallverse
ROOT=/var/lib/smallverse-crawler-renewal
WORKSPACE=/opt/smallverse-staging-dual/workspace
PROJECT=/opt/smallverse-staging-dual
HELPER=/opt/smallverse-crawler-client/crawler_autologin.mjs
ADDON=/opt/smallverse-crawler-client/auto_jsessionid.py
MITMDUMP=/opt/smallverse-crawler-client/venv/bin/mitmdump

[[ -r "$CREDS" && -x "$CLIENT" && -f "$HELPER" && -f "$ADDON" && -x "$MITMDUMP" ]] || {
  echo "VPS crawler renewal is not fully provisioned." >&2; exit 1;
}

umask 077
mkdir -p "$ROOT/profiles/$PROFILE"
debug_port="$(python3 - <<'PY'
import socket
with socket.socket() as s:
    s.bind(('127.0.0.1', 0))
    print(s.getsockname()[1])
PY
)"
proxy_port="$(python3 - <<'PY'
import socket
with socket.socket() as s:
    s.bind(('127.0.0.1', 0))
    print(s.getsockname()[1])
PY
)"

capture_log="$ROOT/${PROFILE}.capture.log"
: > "$capture_log"
chmod 600 "$capture_log"
SMALLVERSE_CAPTURE_PROFILE="$PROFILE" \
SMALLVERSE_CAPTURE_ROLE=crawler \
SMALLVERSE_DIRECT_IMPORT=1 \
SMALLVERSE_CRAWLER_REMOTE_WORKSPACE="$WORKSPACE" \
SMALLVERSE_REMOTE_PYTHON=/opt/smallverse-universal/.venv/bin/python \
SMALLVERSE_REMOTE_SOURCE="$PROJECT" \
  "$MITMDUMP" --listen-host 127.0.0.1 --listen-port "$proxy_port" \
    --set block_global=false --set connection_strategy=lazy --quiet -s "$ADDON" \
    >>"$capture_log" 2>&1 &
proxy_pid=$!

env -u ELECTRON_RUN_AS_NODE \
  timeout 180s xvfb-run -a -s '-screen 0 1280x720x24' "$CLIENT" \
    --no-sandbox --disable-gpu --disable-software-rasterizer \
    "--proxy-server=http://127.0.0.1:${proxy_port}" --ignore-certificate-errors \
    "--user-data-dir=$ROOT/profiles/$PROFILE" \
    --remote-debugging-address=127.0.0.1 \
    "--remote-debugging-port=$debug_port" >/dev/null 2>&1 &
client_pid=$!
login_pid=""
trap 'kill "$login_pid" "$client_pid" "$proxy_pid" 2>/dev/null || true; wait "$login_pid" "$client_pid" "$proxy_pid" 2>/dev/null || true' EXIT

node "$HELPER" --profile "$PROFILE" --port "$debug_port" --timeout 150 \
  --credentials-file "$CREDS" >>"$capture_log" 2>&1 &
login_pid=$!

for _ in $(seq 1 150); do
  if grep -q "\[session\] synced.*profile='$PROFILE'" "$capture_log"; then
    echo "renewed $PROFILE"
    exit 0
  fi
  sleep 1
done
tail -20 "$capture_log" >&2 || true
echo "No refreshed crawler game session was captured." >&2
exit 1
