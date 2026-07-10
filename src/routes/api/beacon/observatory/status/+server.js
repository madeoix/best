import { json } from '@sveltejs/kit';
import { ssh, extractJson } from '$lib/server/beaconRemote.js';

export async function GET() {
  const script = `
python3 - <<'PY'
import json
from pathlib import Path

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
    stat = path.stat()
    data = json.loads(path.read_text(errors="replace"))
except Exception as exc:
    print(json.dumps({
        "ok": False,
        "error": str(exc),
        "path": str(path)
    }))
    raise SystemExit(0)

assets = data.get("assets") or []
observations = data.get("observations") or []
uid_events = data.get("uid_change_events") or []
variant_visuals = data.get("variant_visuals") or []

print(json.dumps({
    "ok": True,
    "source": "observatory-sync.json",
    "path": str(path),
    "generated_at": data.get("generated_at") or data.get("updated_at"),
    "file_modified_unix": stat.st_mtime,
    "counts": {
        "assets": len(assets),
        "observations": len(observations),
        "uid_change_events": len(uid_events),
        "variant_visuals": len(variant_visuals)
    }
}))
PY
`;

  const result = await ssh(script, 30000);
  const payload = extractJson(result.stdout);

  return json(payload || {
    ok: false,
    error: result.stderr || result.error || 'Failed to read Observatory status'
  });
}
