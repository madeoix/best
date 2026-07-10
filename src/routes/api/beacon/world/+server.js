import { json } from '@sveltejs/kit';
import { ssh, extractJson } from '$lib/server/beaconRemote.js';

const WORLD_PATH = '/opt/smallverse/workspace/beacon-world-index.json';

let cache = {
  at: 0,
  payload: null
};

const TTL_MS = 60_000;

export async function GET() {
  if (cache.payload && Date.now() - cache.at < TTL_MS) {
    return json({ ...cache.payload, cached: true });
  }

  const remote = await ssh(
    `
set -euo pipefail
test -f ${WORLD_PATH}
cat ${WORLD_PATH}
`,
    15000
  );

  const payload = extractJson(remote.stdout);

  if (!payload?.ok) {
    return json(
      {
        ok: false,
        error: 'Beacon world index unavailable',
        path: WORLD_PATH,
        stderr: remote.stderr || ''
      },
      { status: 502 }
    );
  }

  cache = {
    at: Date.now(),
    payload
  };

  return json(payload);
}
