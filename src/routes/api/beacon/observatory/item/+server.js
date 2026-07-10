import { json } from '@sveltejs/kit';
import { ssh, extractJson } from '$lib/server/beaconRemote.js';

export async function GET({ url }) {
  const sourceXml = (url.searchParams.get('source_xml') || '').trim();

  if (!sourceXml) {
    return json({
      ok: false,
      error: 'Missing source_xml'
    }, { status: 400 });
  }

  const script = `
python3 - <<'PY'
import json
from pathlib import Path

source_xml = ${JSON.stringify(sourceXml)}

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
        "checked_paths": [str(p) for p in candidate_paths]
    }))
    raise SystemExit(0)

try:
    data = json.loads(path.read_text(errors="replace"))
except Exception as exc:
    print(json.dumps({
        "ok": False,
        "error": f"failed to read observatory sync: {exc}",
        "path": str(path)
    }))
    raise SystemExit(0)

assets = data.get("assets") or []
observations = data.get("observations") or []
uid_events = data.get("uid_change_events") or []
variant_visuals = data.get("variant_visuals") or []

item = next(
    (
        x for x in assets
        if (x.get("source_xml") or x.get("xml") or "") == source_xml
    ),
    None
)

item_observations = [
    x for x in observations
    if (x.get("source_xml") or x.get("xml") or "") == source_xml
]

uids = sorted({
    str(x.get("uid"))
    for x in item_observations
    if x.get("uid")
})

owners = sorted({
    str(x.get("owner_id") or x.get("owner") or x.get("owner_name"))
    for x in item_observations
    if x.get("owner_id") or x.get("owner") or x.get("owner_name")
})

uid_set = set(uids)

events = [
    x for x in uid_events
    if str(x.get("uid") or "") in uid_set
]

visuals = [
    x for x in variant_visuals
    if (x.get("source_xml") or x.get("xml") or "") == source_xml
]

def event_time(row):
    return str(
        row.get("observed_at")
        or row.get("seen_at")
        or row.get("timestamp")
        or row.get("at")
        or ""
    )

item_observations.sort(key=event_time, reverse=True)
events.sort(key=event_time, reverse=True)
visuals.sort(key=event_time, reverse=True)

latest_seen = event_time(item_observations[0]) if item_observations else None

print(json.dumps({
    "ok": item is not None,
    "source": "observatory-sync.json",
    "path": str(path),
    "item": item,
    "summary": {
        "source_xml": source_xml,
        "observation_count": len(item_observations),
        "uid_count": len(uids),
        "owner_count": len(owners),
        "latest_seen": latest_seen,
    },
    "observations": item_observations[:100],
    "uid_history": events[:100],
    "variant_visuals": visuals[:50],
}))
PY
`;

  const result = await ssh(script, 30000);
  const payload = extractJson(result.stdout);

  if (!payload) {
    return json({
      ok: false,
      error: result.stderr || result.error || 'Failed to parse Observatory item response'
    }, { status: 500 });
  }

  return json(payload);
}
