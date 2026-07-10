#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

manifest="deploy/vps-source-paths.txt"
failed=0

printf '%-28s %-10s %-10s\n' \
  "PATH" \
  "EXISTS" \
  "TRACKED"

while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  [[ "$path" == \#* ]] && continue

  exists=no
  tracked=no

  [[ -e "$path" ]] && exists=yes

  if git ls-files -- "$path" "$path/**" |
    grep -q .
  then
    tracked=yes
  fi

  printf '%-28s %-10s %-10s\n' \
    "$path" \
    "$exists" \
    "$tracked"

  if [[ "$exists" != yes || "$tracked" != yes ]]; then
    failed=1
  fi
done < "$manifest"

exit "$failed"
