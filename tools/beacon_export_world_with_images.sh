#!/usr/bin/env bash
set -euo pipefail

cd /opt/smallverse

python3 beacon_export.py --profile-limit 0
python3 beacon_world_resolve_images.py

jq '{
  counts,
  image_resolver,
  market: (.sections.market | map({
    name: .display_name,
    snapshot: ((.snapshot_url // "") != ""),
    thumb: ((.thumb_url // "") != ""),
    image_source,
    image_match,
    missing: .image_missing_reason
  }))
}' /opt/smallverse/workspace/beacon-world-index.json
