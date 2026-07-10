import { json } from '@sveltejs/kit';
import { Buffer } from 'node:buffer';
import { ssh, extractJson } from '$lib/server/beaconRemote.js';

const cache = new Map();
const TTL_MS = 5 * 60_000;
const OWNER_IDENTITY = '/opt/smallverse/beacon_owner_identity_profile.py';

export async function GET({ url }) {
  const sourceXml = (url.searchParams.get('source_xml') || '').trim();

  if (!sourceXml) {
    return json({ ok: false, error: 'Missing source_xml' }, { status: 400 });
  }

  const cached = cache.get(sourceXml);

  if (cached && Date.now() - cached.at < TTL_MS) {
    return json({ ...cached.payload, cached: true });
  }

  const sourceB64 = Buffer.from(sourceXml, 'utf8').toString('base64');

  const script = `
set -euo pipefail
cd /opt/smallverse
timeout 15s python3 "${OWNER_IDENTITY}" --source-xml-b64 '${sourceB64}'
`;

  const result = await ssh(script, 18000);
  const payload = extractJson(result.stdout);

  if (!payload) {
    return json(
      {
        ok: false,
        error: result.stderr || result.error || 'Failed to parse item profile response',
        stdout: result.stdout?.slice?.(0, 1000) || ''
      },
      { status: 500 }
    );
  }

  cache.set(sourceXml, { at: Date.now(), payload });
  return json(payload);
}
