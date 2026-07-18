#!/usr/bin/env bash
# Slow, real-client Popular queue. One space at a time; no direct RTMP replay.
set -euo pipefail

PROFILE="${1:-crawler-01}"
LIMIT="${2:-3}"
case "$PROFILE" in crawler-01|crawler-02) ;; *) exit 2;; esac
[[ "$LIMIT" =~ ^[1-9][0-9]*$ ]] || exit 2

RUNNER=/opt/smallverse-crawler-client/vps_real_client_crawl.sh
POPULAR_FETCHER="${SMALLVERSE_POPULAR_FETCHER:-/opt/smallverse/fetch_popular_spaces_via_cdp.py}"
POPULAR_SELECTOR="${SMALLVERSE_POPULAR_SELECTOR:-/opt/smallverse/select_fresh_popular_spaces.py}"
RECEIPT_WRITER="${SMALLVERSE_CAPTURE_RECEIPT_WRITER:-/opt/smallverse/write_capture_generation_receipt.py}"
POPULAR_MANIFEST="/var/lib/smallverse-real-crawler/popular-spaces-${PROFILE}.v2.json"
RECRAWL_AFTER_SECONDS="${SMALLVERSE_POPULAR_RECRAWL_AFTER_SECONDS:-21600}"
MISSING_COOLDOWN_SECONDS="${SMALLVERSE_POPULAR_MISSING_COOLDOWN_SECONDS:-21600}"
ERROR_COOLDOWN_SECONDS="${SMALLVERSE_POPULAR_ERROR_COOLDOWN_SECONDS:-1800}"
STATE="/var/lib/smallverse-real-crawler/popular-avatar-collector-${PROFILE}.json"
LOCK="/var/lib/smallverse-real-crawler/popular-avatar-collector-${PROFILE}.lock"
PROFILE_DIR="/var/lib/smallverse-crawler-renewal/profiles/$PROFILE"
CLIENT=/opt/smallverse-crawler-client/SmallVerse/smallverse
RECEIPT_DIR="/var/lib/smallverse-real-crawler/capture-generations"
LATEST_RECEIPT="/var/lib/smallverse-real-crawler/latest-capture-generation-${PROFILE}.json"
STARTED_AT="$(date --utc +%Y-%m-%dT%H:%M:%SZ)"
GENERATION_ID="${PROFILE}:$(date --utc +%Y%m%dT%H%M%SZ):$(python3 -c 'import uuid; print(uuid.uuid4().hex)')"
RECEIPT_WRITTEN=0
POPULAR_CAPTURED=0
client_pid=""
owned_client=0
spaces=()
completed_ids=()
missing_avatar_ids=()
failed_ids=()
avatar_configs_captured=0
item_uids_observed=0
protocol_events=0

mkdir -p "$(dirname "$STATE")"
if ! mkdir "$LOCK" 2>/dev/null; then
  echo 'collector already running' >&2
  exit 0
fi
candidate_file="$(mktemp)"
cleanup() {
  status=$?
  if [[ "$RECEIPT_WRITTEN" -eq 0 && -f "$RECEIPT_WRITER" ]]; then
    completed_at="$(date --utc +%Y-%m-%dT%H:%M:%SZ)"
    failure_message="collector exited before completing its bounded generation (status $status)"
    receipt_args=(
      --directory "$RECEIPT_DIR"
      --latest "$LATEST_RECEIPT"
      --generation-id "$GENERATION_ID"
      --crawler-id "$PROFILE"
      --outcome failed
      --started-at "$STARTED_AT"
      --completed-at "$completed_at"
      --failure-code "collector-exit-$status"
      --failure-message "$failure_message"
    )
    [[ "$POPULAR_CAPTURED" -eq 1 ]] && receipt_args+=(--popular-manifest "$POPULAR_MANIFEST")
    for sid in "${spaces[@]}"; do receipt_args+=(--selected-space "$sid"); done
    for sid in "${completed_ids[@]}"; do receipt_args+=(--completed-space "$sid"); done
    for sid in "${missing_avatar_ids[@]}"; do receipt_args+=(--missing-space "$sid"); done
    for sid in "${failed_ids[@]}"; do receipt_args+=(--failed-space "$sid"); done
    python3 "$RECEIPT_WRITER" "${receipt_args[@]}" >&2 || true
  fi
  rm -f "$candidate_file"
  if [[ "$owned_client" -eq 1 ]]; then
    pkill -TERM -f -- "--user-data-dir=$PROFILE_DIR" >/dev/null 2>&1 || true
    [[ -z "$client_pid" ]] || wait "$client_pid" >/dev/null 2>&1 || true
  fi
  rmdir "$LOCK" 2>/dev/null || true
  return "$status"
}
trap cleanup EXIT

# Refresh Popular through the production API inside the crawler's current
# signed-in browser before selecting any room. This deliberately has no saved
# fallback: unavailable auth, malformed JSON, or a stale manifest fails closed
# instead of navigating an old room list.
debug_port="$(ps -eo args= | sed -n "\|--user-data-dir=$PROFILE_DIR|{s/.*--remote-debugging-port=\([0-9][0-9]*\).*/\1/p;q}")"
if [[ -z "$debug_port" ]] || ! curl -fsS "http://127.0.0.1:$debug_port/json/list" >/dev/null 2>&1; then
  [[ -x "$CLIENT" ]] || { echo 'Smallverse client is not provisioned' >&2; exit 1; }
  debug_port="$(python3 - <<'PY'
import socket
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    print(sock.getsockname()[1])
PY
)"
  env -u ELECTRON_RUN_AS_NODE xvfb-run -a -s '-screen 0 1280x720x24' "$CLIENT" \
    --no-sandbox --disable-gpu --disable-software-rasterizer \
    "--user-data-dir=$PROFILE_DIR" \
    --remote-debugging-address=127.0.0.1 "--remote-debugging-port=$debug_port" \
    >/dev/null 2>&1 &
  client_pid=$!
  owned_client=1
  for _ in $(seq 1 45); do
    curl -fsS "http://127.0.0.1:$debug_port/json/list" >/dev/null 2>&1 && break
    kill -0 "$client_pid" >/dev/null 2>&1 || break
    sleep 1
  done
fi
curl -fsS "http://127.0.0.1:$debug_port/json/list" >/dev/null 2>&1 || {
  echo "no live signed-in Smallverse browser is available for $PROFILE; refusing stale Popular fallback" >&2
  exit 1
}
[[ -f "$POPULAR_FETCHER" && -f "$POPULAR_SELECTOR" && -f "$RECEIPT_WRITER" ]] || {
  echo 'fresh Popular tools are not provisioned; refusing stale Popular fallback' >&2
  exit 1
}
for duration in "$RECRAWL_AFTER_SECONDS" "$MISSING_COOLDOWN_SECONDS" "$ERROR_COOLDOWN_SECONDS"; do
  [[ "$duration" =~ ^[1-9][0-9]*$ ]] || {
    echo 'Popular collector cooldowns must be positive integer seconds' >&2
    exit 2
  }
done
popular_ready=0
for _ in $(seq 1 45); do
  if python3 "$POPULAR_FETCHER" \
    --manifest "$POPULAR_MANIFEST" \
    --cdp-port "$debug_port" \
    --fresh-for-seconds 300
  then
    popular_ready=1
    break
  fi
  sleep 1
done
[[ "$popular_ready" -eq 1 ]] || {
  echo 'signed-in Smallverse page never became ready for a fresh Popular request' >&2
  exit 1
}
POPULAR_CAPTURED=1
python3 "$POPULAR_SELECTOR" \
  --manifest "$POPULAR_MANIFEST" \
  --state "$STATE" \
  --profile "$PROFILE" \
  --limit "$LIMIT" \
  --max-age-seconds 300 \
  --recrawl-after-seconds "$RECRAWL_AFTER_SECONDS" \
  --missing-cooldown-seconds "$MISSING_COOLDOWN_SECONDS" \
  --error-cooldown-seconds "$ERROR_COOLDOWN_SECONDS" >"$candidate_file"
mapfile -t spaces <"$candidate_file"

completed=0
for space_id in "${spaces[@]}"; do
  # Exit 75 means the real client entered the room but it did not send an
  # Avatar shared object.  It is an expected per-room miss, not a failed
  # collector run.  Do not add the room to the completed set; it will be
  # retried after the bounded cooldown above.
  runner_output=""
  if runner_output="$("$RUNNER" "$PROFILE" "$space_id")"; then
    printf '%s\n' "$runner_output"
    read -r run_configs run_uids run_events < <(
      python3 -c 'import json,sys
values={}
for line in sys.stdin:
    try:
        row=json.loads(line)
    except Exception:
        continue
    if isinstance(row,dict) and row.get("ok") is True:
        values=row
print(*(int(values.get(key) or 0) for key in ("avatar_configs", "uids", "events")))' <<<"$runner_output"
    )
    avatar_configs_captured=$((avatar_configs_captured + run_configs))
    item_uids_observed=$((item_uids_observed + run_uids))
    protocol_events=$((protocol_events + run_events))
    completed=$((completed + 1))
    completed_ids+=("$space_id")
  else
    status=$?
    if [[ "$status" -eq 75 ]]; then
      echo "Popular room $space_id had no Avatar shared-object records; skipping for now" >&2
      missing_avatar_ids+=("$space_id")
    else
      echo "Popular room $space_id failed with status $status" >&2
      failed_ids+=("$space_id")
    fi
  fi
  # A paced queue avoids opening several game rooms or render jobs at once.
  sleep 20
done

python3 - "$STATE" "$PROFILE" "$completed" \
  "${#missing_avatar_ids[@]}" "${#failed_ids[@]}" \
  "${completed_ids[@]}" -- "${missing_avatar_ids[@]}" -- "${failed_ids[@]}" <<'PY'
import json, os, sys, tempfile
from datetime import datetime, timezone
from pathlib import Path
path, profile, completed, missing_count, failed_count, *values = sys.argv[1:]
sections=[[]]
for value in values:
    if value == '--':
        sections.append([])
    else:
        sections[-1].append(value)
completed_ids, missing_avatar_ids, failed_ids = (sections + [[], [], []])[:3]
try:
    previous=json.load(open(path))
except Exception:
    previous={}
now = datetime.now(timezone.utc).isoformat()
legacy_epoch = (
    previous.get('legacy_seen_migrated_at')
    or previous.get('updated_at')
    or now
)
successful = dict(previous.get('successful_space_visits', {}) or {})
for sid in previous.get('seen_space_ids', []):
    successful.setdefault(str(sid), legacy_epoch)
for sid in completed_ids:
    successful[sid] = now
missing = dict(previous.get('missing_avatar_spaces', {}) or {})
failed = dict(previous.get('failed_space_attempts', {}) or {})
for sid in completed_ids:
    missing.pop(sid, None)
    failed.pop(sid, None)
for sid in missing_avatar_ids:
    missing[sid] = now
    failed.pop(sid, None)
for sid in failed_ids:
    failed[sid] = now
# Keep every temporal history bounded; the selector can revisit an evicted room
# instead of allowing an unbounded state file to become another permanent set.
successful = dict(list(successful.items())[-500:])
missing = dict(list(missing.items())[-500:])
failed = dict(list(failed.items())[-500:])
seen = list(successful)[-500:]
payload = {
    'contract': 'smallverse-popular-collector-state/v2',
    'updated_at': now,
    'profile': profile,
    'spaces_completed': int(completed),
    'legacy_seen_migrated_at': legacy_epoch,
    'successful_space_visits': successful,
    # Retained during the v1 -> v2 transition for old observability tools;
    # selection treats it as timestamped at the fixed migration epoch.
    'seen_space_ids': seen,
    'missing_avatar_spaces': missing,
    'failed_space_attempts': failed,
    'last_run': {
        'completed': completed_ids,
        'missing_avatar': missing_avatar_ids,
        'failed': failed_ids,
        'missing_avatar_count': int(missing_count),
        'failed_count': int(failed_count),
    },
}
target = Path(path)
descriptor, temporary_name = tempfile.mkstemp(prefix=f'.{target.name}.', dir=target.parent)
try:
    os.fchmod(descriptor, 0o600)
    with os.fdopen(descriptor, 'w', encoding='utf-8') as handle:
        json.dump(payload, handle)
        handle.write('\n')
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary_name, target)
finally:
    try:
        os.unlink(temporary_name)
    except FileNotFoundError:
        pass
PY

completed_at="$(date --utc +%Y-%m-%dT%H:%M:%SZ)"
outcome=succeeded
failure_args=()
if (( ${#failed_ids[@]} > 0 )); then
  outcome=partial
  if (( ${#completed_ids[@]} == 0 && ${#missing_avatar_ids[@]} == 0 )); then
    outcome=failed
  fi
  failure_args=(--failure-code runner-failures --failure-message "one or more selected Popular rooms failed in the real client")
elif (( ${#missing_avatar_ids[@]} > 0 )); then
  outcome=partial
  failure_args=(--failure-code avatar-shared-object-missing --failure-message "one or more entered Popular rooms emitted no Avatar shared-object records")
fi
receipt_args=(
  --directory "$RECEIPT_DIR"
  --latest "$LATEST_RECEIPT"
  --generation-id "$GENERATION_ID"
  --crawler-id "$PROFILE"
  --outcome "$outcome"
  --started-at "$STARTED_AT"
  --completed-at "$completed_at"
  --popular-manifest "$POPULAR_MANIFEST"
  --avatar-configs-captured "$avatar_configs_captured"
  --item-uids-observed "$item_uids_observed"
  --protocol-events "$protocol_events"
)
for sid in "${spaces[@]}"; do receipt_args+=(--selected-space "$sid"); done
for sid in "${completed_ids[@]}"; do receipt_args+=(--completed-space "$sid"); done
for sid in "${missing_avatar_ids[@]}"; do receipt_args+=(--missing-space "$sid"); done
for sid in "${failed_ids[@]}"; do receipt_args+=(--failed-space "$sid"); done
python3 "$RECEIPT_WRITER" "${receipt_args[@]}" "${failure_args[@]}"
RECEIPT_WRITTEN=1

# A run made entirely of rooms without Avatar shared objects is still healthy:
# the client, capture and parser all ran, but those rooms had no useful avatar
# state.  Only surface a true runner failure as a failed service execution.
if (( ${#failed_ids[@]} > 0 )); then
  exit 1
fi
