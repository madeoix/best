#!/usr/bin/env bash
# Captures one real VPS Smallverse client room visit. No cookies or credentials
# are printed; the existing isolated crawler profile supplies the login.
set -euo pipefail

PROFILE="${1:-}"
# This is the 32-character internal id returned by the live
# catalog_entry.getSpacesForCategory (Popular) RTMP/gateway response.  It is
# deliberately not a human-facing space name/slug.
SPACE_ID="${2:-}"
case "$PROFILE" in crawler-01|crawler-02) ;; *) echo "profile must be crawler-01 or crawler-02" >&2; exit 2;; esac
[[ "$SPACE_ID" =~ ^[A-Fa-f0-9]{32}$ ]] || { echo "space id must be the 32-hex Popular gateway id" >&2; exit 2; }

CLIENT=/opt/smallverse-crawler-client/SmallVerse/smallverse
IMPORTER=/opt/smallverse-staging-dual/scripts/import_vps_live_capture.py
PROJECT=/opt/smallverse-staging-dual
CRAWLER_WORKSPACE=/opt/smallverse-staging-dual/workspace
OBSERVATORY_WORKSPACE=/opt/smallverse/workspace
ROOT=/var/lib/smallverse-real-crawler
CAPTURE_INTERFACE="${SMALLVERSE_CAPTURE_INTERFACE:-ens6}"

[[ -x "$CLIENT" && -f "$IMPORTER" ]] || { echo "real-client crawler is not provisioned" >&2; exit 1; }
mkdir -p "$ROOT"
umask 077
stamp="$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM"
pcap="$ROOT/${PROFILE}-${SPACE_ID}-${stamp}.pcapng"
out="$CRAWLER_WORKSPACE/live-captures/${PROFILE}-${SPACE_ID}-${stamp}"
PROFILE_DIR="/var/lib/smallverse-crawler-renewal/profiles/$PROFILE"
# A crawler client is intentionally kept alive for its authenticated session.
# Starting a second Electron process with the same profile only forwards the
# request to the first process and exits, which used to create empty captures.
debug_port="$(ps -eo args= | sed -n "\\|--user-data-dir=$PROFILE_DIR|{s/.*--remote-debugging-port=\\([0-9][0-9]*\\).*/\\1/p;q}")"
client_pid=""
if [[ -z "$debug_port" ]] || ! curl -fsS "http://127.0.0.1:$debug_port/json/list" >/dev/null 2>&1; then
  debug_port="$(python3 - <<'PY'
import socket
with socket.socket() as s:
 s.bind(('127.0.0.1', 0)); print(s.getsockname()[1])
PY
)"
  env -u ELECTRON_RUN_AS_NODE xvfb-run -a -s '-screen 0 1280x720x24' "$CLIENT" \
    --no-sandbox --disable-gpu --disable-software-rasterizer \
    "--user-data-dir=$PROFILE_DIR" \
    --remote-debugging-address=127.0.0.1 "--remote-debugging-port=$debug_port" >/dev/null 2>&1 &
  client_pid=$!
fi

capture_pid=""
cleanup() { kill "$capture_pid" 2>/dev/null || true; [[ -z "$client_pid" ]] || kill "$client_pid" 2>/dev/null || true; wait "$capture_pid" 2>/dev/null || true; [[ -z "$client_pid" ]] || wait "$client_pid" 2>/dev/null || true; }
trap cleanup EXIT

for _ in $(seq 1 30); do curl -fsS "http://127.0.0.1:$debug_port/json/list" >/dev/null 2>&1 && break; sleep 1; done
curl -fsS "http://127.0.0.1:$debug_port/json/list" >/dev/null || { echo "crawler client debugger did not start" >&2; exit 1; }

# ``any`` writes Linux cooked packets, which loses the Ethernet framing used
# by the established RTMP reassembler. Capture the VPS egress interface.
tcpdump -i "$CAPTURE_INTERFACE" -U -w "$pcap" 'tcp port 1935' >/dev/null 2>&1 &
capture_pid=$!
# Preserve the established internal-id route used by the old automation
# bridge.  Popular selection comes from the gateway capture; never substitute
# a title/slug from Beacon's exported index.
DEBUG_PORT="$debug_port" SPACE_ID="$SPACE_ID" node - <<'JS'
const http = require('http');
const port = process.env.DEBUG_PORT;
const target = `https://www.smallverse.app/space/${process.env.SPACE_ID}`;
http.get(`http://127.0.0.1:${port}/json/list`, (response) => {
  let body = '';
  response.on('data', (chunk) => { body += chunk; });
  response.on('end', () => {
    const page = JSON.parse(body).find((row) => row.type === 'page' && !String(row.url).startsWith('file:'));
    if (!page) process.exitCode = 2;
    else {
      const socket = new WebSocket(page.webSocketDebuggerUrl);
      socket.onopen = () => socket.send(JSON.stringify({id: 1, method: 'Page.navigate', params: {url: target}}));
      // Chromium closes the inspector socket after navigation on some old
      // Electron builds.  The navigation reply is sufficient; do not treat
      // that expected close as a failed crawl.
      socket.onmessage = () => { socket.close(); process.exit(0); };
      socket.onerror = () => { process.exit(0); };
    }
  });
}).on('error', () => { process.exitCode = 4; });
JS
sleep 30
# Give the real client time to receive room shared objects. RTMP shared-object
# names and payloads are not reliably visible to `strings`; compressed/chunked
# packets previously caused valid avatar captures to be discarded here.
sleep 35
kill "$capture_pid" 2>/dev/null || true
wait "$capture_pid" 2>/dev/null || true
capture_pid=""
[[ -s "$pcap" ]] || { echo "no RTMP packets captured" >&2; exit 1; }
import_result="$(sudo env PYTHONPATH="$PROJECT" /opt/smallverse-universal/.venv/bin/python "$IMPORTER" \
  --pcap "$pcap" --session "${PROFILE}-${SPACE_ID}-${stamp}" --out "$out" --workspace "$OBSERVATORY_WORKSPACE")"
printf '%s\n' "$import_result"
avatar_configs="$(python3 -c 'import json,sys; print(int(json.load(sys.stdin).get("avatar_configs", 0)))' <<<"$import_result")"
if (( avatar_configs < 1 )); then
  echo "room capture parsed successfully but contained no Avatar config records; retrying later" >&2
  exit 75
fi
