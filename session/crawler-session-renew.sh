#!/usr/bin/env bash
set -u

PROFILE="${1:-}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SESSION_ROOT="${SMALLVERSE_LOCAL_SESSION_ROOT:-$HOME/SmallverseLab/session}"
STATUS_ROOT="$SESSION_ROOT/crawler-renewals"
STATUS_PATH="$STATUS_ROOT/${PROFILE}.json"
LOCK_PATH="$STATUS_ROOT/${PROFILE}.lock"
LOG_PATH="$STATUS_ROOT/${PROFILE}.log"

if [[ "$PROFILE" != "crawler-01" && "$PROFILE" != "crawler-02" ]]; then
  echo "ERROR: profile must be crawler-01 or crawler-02" >&2
  exit 2
fi

mkdir -p "$STATUS_ROOT"
chmod 700 "$STATUS_ROOT" 2>/dev/null || true

write_status() {
  local state="$1"
  local message="$2"
  local code="${3:-null}"
  python3 - "$STATUS_PATH" "$PROFILE" "$state" "$message" "$code" <<'PY'
import json, os, sys, tempfile
from datetime import datetime, timezone
from pathlib import Path
path = Path(sys.argv[1])
payload = {
    "schema": "smallverse-crawler-renewal/v1",
    "profile": sys.argv[2],
    "state": sys.argv[3],
    "message": sys.argv[4],
    "exit_code": None if sys.argv[5] == "null" else int(sys.argv[5]),
    "updated_at": datetime.now(timezone.utc).isoformat(),
}
path.parent.mkdir(parents=True, exist_ok=True)
fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
try:
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")
    os.replace(temporary, path)
finally:
    try:
        os.unlink(temporary)
    except FileNotFoundError:
        pass
PY
}

if ! mkdir "$LOCK_PATH" 2>/dev/null; then
  write_status "running" "A renewal is already running for $PROFILE."
  exit 0
fi
cleanup() {
  rmdir "$LOCK_PATH" 2>/dev/null || true
}
trap cleanup EXIT INT TERM HUP

if ! command -v secret-tool >/dev/null 2>&1; then
  write_status "failed" "GNOME Keyring helper secret-tool is not installed." 2
  exit 2
fi
if ! secret-tool lookup \
  application smallverse-beacon \
  kind crawler-login \
  profile "$PROFILE" >/dev/null 2>&1; then
  write_status "failed" "No encrypted login is stored for $PROFILE." 2
  exit 2
fi

: > "$LOG_PATH"
chmod 600 "$LOG_PATH" 2>/dev/null || true
write_status "starting" "Starting isolated Smallverse session renewal for $PROFILE."

export SMALLVERSE_ISOLATED_PROFILE=1
export SMALLVERSE_AUTO_LOGIN=1
export SMALLVERSE_HUMAN_LOGIN="${SMALLVERSE_HUMAN_LOGIN:-0}"
export SMALLVERSE_CLOSE_AFTER_SYNC=1
export SMALLVERSE_AUTO_LOGIN_TIMEOUT="${SMALLVERSE_AUTO_LOGIN_TIMEOUT:-120}"

if [[ "$SMALLVERSE_HUMAN_LOGIN" == 1 ]]; then
  "$HERE/crawler-vps-human-login.sh" "$PROFILE" >>"$LOG_PATH" 2>&1
else
  "$HERE/grab-session.sh" "$PROFILE" crawler >>"$LOG_PATH" 2>&1
fi
code=$?
if [[ "$code" -eq 0 ]]; then
  write_status "synced" "Fresh crawler cookies were captured and synchronized for $PROFILE." 0
else
  tail_message="$(tail -1 "$LOG_PATH" 2>/dev/null | sed -E 's/(JSESSIONID|SWSID)=[^;[:space:]]+/\1=<redacted>/g' | cut -c1-300)"
  [[ -n "$tail_message" ]] || tail_message="Session renewal ended before a fresh cookie pair was synchronized."
  write_status "failed" "$tail_message" "$code"
fi
exit "$code"
