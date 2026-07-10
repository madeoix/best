import { json } from '@sveltejs/kit';
import { ssh, extractJson } from '$lib/server/beaconRemote.js';

const cache = new Map();
const TTL_MS = 5 * 60_000;

export async function GET({ url }) {
  const sourceXmls = url.searchParams
    .getAll('source_xml')
    .map((x) => String(x || '').trim())
    .filter(Boolean);

  if (sourceXmls.length === 0) {
    return json({ ok: false, error: 'Missing source_xml' }, { status: 400 });
  }

  const key = sourceXmls.join('\n');
  const cached = cache.get(key);

  if (cached && Date.now() - cached.at < TTL_MS) {
    return json({ ...cached.payload, cached: true });
  }

  const sourceJson = JSON.stringify(sourceXmls);

  const script = `
python3 - <<'PY'
import json
from pathlib import Path

source_xmls = ${sourceJson}
path = Path("/opt/smallverse/workspace/beacon-item-profiles.json")

def out(payload):
    print(json.dumps(payload, default=str))
    raise SystemExit(0)

if not path.exists():
    out({
        "ok": False,
        "error": "beacon-item-profiles.json not found",
        "path": str(path),
    })

data = json.loads(path.read_text(errors="replace"))
profiles = data.get("profiles") or {}

out({
    "ok": True,
    "source": "item-profile.batch-cache-file.v1",
    "cache_generated_at": data.get("generated_at"),
    "cache_counts": data.get("counts"),
    "profiles": {
        source: profiles.get(source)
        for source in source_xmls
        if profiles.get(source)
    }
})
PY
`;

  try {
    const result = await ssh(script, 8000);
    const payload = extractJson(result.stdout);

    if (!payload) {
      return json(
        {
          ok: false,
          error: result.stderr || result.error || 'Failed to parse batch profile response',
          stdout: result.stdout?.slice?.(0, 1000) || ''
        },
        { status: 500 }
      );
    }

    cache.set(key, { at: Date.now(), payload });
    return json(payload);
  } catch (err) {
    return json(
      {
        ok: false,
        error: err?.message || 'Failed to load batch profiles'
      },
      { status: 500 }
    );
  }
}
