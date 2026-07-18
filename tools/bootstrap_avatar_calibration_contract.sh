#!/usr/bin/env bash
set -euo pipefail

ROOT="${SMALLVERSE_LAB_ROOT:-$HOME/smallverse-lab}"
AVATAR_ID="${1:-}"

if [[ -z "$AVATAR_ID" ]]; then
  echo "usage: $0 <avatar-id> [state-index]" >&2
  exit 64
fi

STATE_INDEX="${2:-0}"

cd "$ROOT"
exec python3 tools/bootstrap_avatar_calibration_contract.py \
  --avatar-id "$AVATAR_ID" \
  --state-index "$STATE_INDEX" \
  --lab-root "$ROOT"
