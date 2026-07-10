#!/usr/bin/env bash
set -euo pipefail

REMOTE="${SMALLVERSE_SYNC_REMOTE:-casa}"
REMOTE_ROOT="${SMALLVERSE_SYNC_REMOTE_ROOT:-/opt/smallverse}"
LOCAL_ROOT="${SMALLVERSE_SYNC_LOCAL_ROOT:-$PWD/.local-data}"
WORKSPACE="$LOCAL_ROOT/workspace"
AUTOMATION="$LOCAL_ROOT/automation"
MANIFEST="$LOCAL_ROOT/SHA256SUMS"
ACTIVE_TEMPORARY=""

cleanup_active() {
  if [ -n "${ACTIVE_TEMPORARY:-}" ]; then
    rm -f -- "$ACTIVE_TEMPORARY"
  fi
}

trap cleanup_active EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

mkdir -p "$WORKSPACE" "$AUTOMATION"

copy_if_present() {
  local remote_path="$1"
  local local_path="$2"
  local temporary="${local_path}.partial"

  rm -f -- "$temporary"

  if ! ssh \
    -o BatchMode=yes \
    -o ClearAllForwardings=yes \
    -o ConnectTimeout=15 \
    "$REMOTE" \
    "test -s '$remote_path'"
  then
    printf 'missing %s\n' "$remote_path"
    return 1
  fi

  mkdir -p "$(dirname "$local_path")"
  ACTIVE_TEMPORARY="$temporary"

  printf 'syncing %s -> %s\n' "$remote_path" "$local_path"

  if ! scp \
    -o BatchMode=yes \
    -o ClearAllForwardings=yes \
    -o ConnectTimeout=15 \
    "$REMOTE:$remote_path" \
    "$temporary"
  then
    printf 'failed to copy %s\n' "$remote_path" >&2
    rm -f -- "$temporary"
    ACTIVE_TEMPORARY=""
    return 1
  fi

  if ! node -e '
    const fs = require("node:fs");
    JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  ' "$temporary"
  then
    printf 'invalid JSON from %s\n' "$remote_path" >&2
    rm -f -- "$temporary"
    ACTIVE_TEMPORARY=""
    return 1
  fi

  if ! mv -- "$temporary" "$local_path"
  then
    printf 'failed to publish %s\n' "$local_path" >&2
    rm -f -- "$temporary"
    ACTIVE_TEMPORARY=""
    return 1
  fi

  ACTIVE_TEMPORARY=""
  printf 'synced %s -> %s\n' "$remote_path" "$local_path"
  return 0
}

copy_first_present() {
  local local_path="$1"
  shift

  local candidate
  for candidate in "$@"
  do
    if copy_if_present "$candidate" "$local_path"
    then
      return 0
    fi
  done

  return 1
}

copy_if_present \
  "$REMOTE_ROOT/workspace/beacon-world-index.json" \
  "$WORKSPACE/beacon-world-index.json"

copy_first_present \
  "$WORKSPACE/observatory-sync.json" \
  "/var/www/smallverse/observatory-sync-lite.json" \
  "/var/www/smallverse/observatory-sync.json" \
  "$REMOTE_ROOT/workspace/observatory-sync.json" \
  "$REMOTE_ROOT/automation-workspace/observatory-sync.json"

for filename in \
  beacon-item-profiles.json \
  avatar-url-index.json \
  beacon-spin-prices.json \
  spin-prices.json \
  spintowin-prices.json
do
  copy_if_present \
    "$REMOTE_ROOT/workspace/$filename" \
    "$WORKSPACE/$filename" || true
done

for relative in \
  spintowin-actions/last-spin-prices.json \
  spintowin-actions/spin-prices.json
do
  copy_if_present \
    "$REMOTE_ROOT/workspace/$relative" \
    "$WORKSPACE/$relative" || true
done

find "$WORKSPACE" "$AUTOMATION" \
  -type f \
  -name '*.json' \
  -print0 |
  sort -z |
  xargs -0 -r sha256sum > "$MANIFEST"

printf '\nPreserved read-model exports are under %s\n' "$LOCAL_ROOT"
printf 'Checksum manifest: %s\n' "$MANIFEST"
printf 'No SQLite databases, cookies, tokens, captures, or session files were copied.\n'
