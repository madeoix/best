import { json } from '@sveltejs/kit';
import { ssh, extractJson } from '$lib/server/beaconRemote.js';

export async function GET({ url }) {
  const q = (url.searchParams.get('q') || '').trim();
  const limitRaw = Number(url.searchParams.get('limit') || 40);
  const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? limitRaw : 40, 100));

  const script = `
python3 - <<'PY'
import json
from pathlib import Path

query = ${JSON.stringify(q)}.lower().strip()
limit = int(${JSON.stringify(limit)})

candidate_paths = [
    Path("/opt/smallverse/workspace/observatory-sync.json"),
    Path("/opt/smallverse/automation-workspace/observatory-sync.json"),
    Path("/opt/smallverse/observatory-sync.json"),
]

path = next((p for p in candidate_paths if p.exists()), None)

if path is None:
    print(json.dumps({
        "ok": False,
        "error": "observatory-sync.json not found",
        "checked_paths": [str(p) for p in candidate_paths],
        "items": []
    }))
    raise SystemExit(0)

try:
    data = json.loads(path.read_text(errors="replace"))
except Exception as exc:
    print(json.dumps({
        "ok": False,
        "error": f"failed to read observatory sync: {exc}",
        "path": str(path),
        "items": []
    }))
    raise SystemExit(0)

assets = data.get("assets") or []
observations = data.get("observations") or []
variant_visuals = data.get("variant_visuals") or []

obs_by_source = {}
uids_by_source = {}
owners_by_source = {}
latest_by_source = {}
icons_by_source = {}

for visual in variant_visuals:
    source = visual.get("source_xml") or visual.get("xml") or ""
    icon = (
        visual.get("variant_icon")
        or visual.get("icon")
        or visual.get("rendered_icon")
        or visual.get("png")
    )
    if source and icon and source not in icons_by_source:
        icons_by_source[source] = icon

for obs in observations:
    source = obs.get("source_xml") or obs.get("xml") or ""
    if not source:
        continue

    obs_by_source[source] = obs_by_source.get(source, 0) + 1

    uid = obs.get("uid")
    if uid:
        uids_by_source.setdefault(source, set()).add(str(uid))

    owner = obs.get("owner_id") or obs.get("owner") or obs.get("owner_name")
    if owner:
        owners_by_source.setdefault(source, set()).add(str(owner))

    observed_at = (
        obs.get("observed_at")
        or obs.get("seen_at")
        or obs.get("timestamp")
        or obs.get("at")
    )

    if observed_at:
        current = latest_by_source.get(source)
        if current is None or str(observed_at) > str(current):
            latest_by_source[source] = observed_at

items = []

for asset in assets:
    source = asset.get("source_xml") or asset.get("xml") or ""

    name = (
        asset.get("name")
        or asset.get("display_name")
        or asset.get("title")
        or source.split("/")[-1]
        or source
    )

    haystack_parts = [
        name,
        source,
        asset.get("description"),
        asset.get("category"),
        asset.get("type"),
        asset.get("tags"),
    ]

    haystack = " ".join(str(x or "") for x in haystack_parts).lower()

    if query and query not in haystack:
        continue

    icon = (
        asset.get("variant_icon")
        or asset.get("icon")
        or asset.get("rendered_icon")
        or icons_by_source.get(source)
    )

    items.append({
        "source_xml": source,
        "name": name,
        "description": asset.get("description"),
        "category": asset.get("category") or asset.get("type"),
        "tags": asset.get("tags"),
        "icon": icon,
        "variant_icon": asset.get("variant_icon") or icons_by_source.get(source),
        "variant_render_status": asset.get("variant_render_status"),
        "observed_count": asset.get("observed_count") or obs_by_source.get(source, 0),
        "uid_count": len(uids_by_source.get(source, set())),
        "owner_count": len(owners_by_source.get(source, set())),
        "latest_seen": latest_by_source.get(source),
        "is_rare": bool(asset.get("is_rare")),
        "currency": asset.get("currency"),
        "xml_price": asset.get("xml_price") or asset.get("price"),
    })

items.sort(
    key=lambda x: (
        x.get("observed_count") or 0,
        x.get("uid_count") or 0,
        x.get("owner_count") or 0,
        str(x.get("latest_seen") or "")
    ),
    reverse=True
)

print(json.dumps({
    "ok": True,
    "source": "observatory-sync.json",
    "path": str(path),
    "query": query,
    "count": len(items),
    "items": items[:limit],
    "generated_at": data.get("generated_at") or data.get("updated_at"),
}))
PY
`;

  const result = await ssh(script, 30000);
  const payload = extractJson(result.stdout);

  if (!payload) {
    return json({
      ok: false,
      error: result.stderr || result.error || 'Failed to parse Observatory search response',
      items: []
    }, { status: 500 });
  }

  return json(payload);
}
