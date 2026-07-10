#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ ! -d build ]]; then
  echo "build/ does not exist. Run npm run build first." >&2
  exit 1
fi

commit="$(
  git rev-parse HEAD 2>/dev/null ||
  printf '%s' 'uncommitted'
)"

echo "# Smallverse Lab VPS file inventory"
echo "# Git commit: $commit"
echo

printf '%s\n' \
  package.json \
  package-lock.json

find build deploy \
  -type f \
  -print \
  | sort
