import { json } from '@sveltejs/kit';
import { ssh, extractJson } from '$lib/server/beaconRemote.js';

const PROFILE_DIR = '/opt/smallverse/workspace';
const PROFILE_SCRIPT = '/opt/smallverse/beacon_space_profile_v2.py';

function cleanSpaceId(value) {
  const id = String(value || '').trim();
  return /^[a-zA-Z0-9_-]{8,80}$/.test(id) ? id : '';
}

export async function GET({ url }) {
  const spaceId = cleanSpaceId(url.searchParams.get('space_id'));

  if (!spaceId) {
    return json({ ok: false, error: 'Missing or invalid space_id' }, { status: 400 });
  }

  const profilePath = `${PROFILE_DIR}/beacon-space-profile-${spaceId}.json`;

  const remote = await ssh(
    `
set -euo pipefail
cd /opt/smallverse
timeout 25s python3 "${PROFILE_SCRIPT}" --space-id "${spaceId}" >/tmp/beacon-space-profile-${spaceId}.log
timeout 15s python3 /opt/smallverse/beacon_space_profile_identity_resolver.py --space-id "${spaceId}" >>/tmp/beacon-space-profile-${spaceId}.log
cat "${profilePath}"
`,
    35000
  );

  const payload = extractJson(remote.stdout);

  if (!payload?.ok || payload.contract !== 'smallverse-beacon-space-profile/v2') {
    return json(
      {
        ok: false,
        error: 'Beacon space profile v2 unavailable',
        space_id: spaceId,
        stderr: remote.stderr || '',
        stdout: remote.stdout || ''
      },
      { status: 502 }
    );
  }

  return json(payload);
}
