#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOL="$ROOT/tools/capture_avatar_calibration.py"

PYTHON="${SMALLVERSE_CAPTURE_PYTHON:-$(command -v python3)}"
if [[ -z "$PYTHON" || ! -x "$PYTHON" ]]; then
  echo "python3 was not found" >&2
  exit 2
fi

STATES="${1:-1}"

exec "$PYTHON" "$TOOL" \
  --gender male \
  --states "$STATES" \
  --timeout 900 \
  --settle-seconds 20 \
  --output-dir "$HOME/Downloads"
