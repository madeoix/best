import { json } from '@sveltejs/kit';
import { ssh, extractJson } from '$lib/server/beaconRemote.js';

const AVATAR_PROFILE = '/opt/smallverse/beacon_avatar_profile.py';


function attachRenderPacket(profile, avatarId) {
  if (!profile || typeof profile !== 'object') return profile;

  const resolvedAvatarId =
    profile?.avatar?.avatar_id ||
    profile?.avatar_id ||
    avatarId;

  if (!resolvedAvatarId) return profile;

  const base = `/avatar-renders/${resolvedAvatarId}`;

  profile.render_packet = {
    full_body_url: `${base}/saveAvatar-carved-1.png`,
    preview_url: `${base}/saveAvatar-carved-0.png`,
    thumb_url: `${base}/saveAvatar-carved-2.png`,
    manifest_url: `${base}/render-packet.json`,
    source: 'flash_saveAvatar_capture'
  };

  if (profile.avatar && !profile.avatar.render_url) {
    profile.avatar.render_url = profile.render_packet.full_body_url;
  }

  return profile;
}

export async function GET({ url }) {
  const avatarId = (url.searchParams.get('avatar_id') || '').trim();

  if (!avatarId) {
    return json({ ok: false, error: 'Missing avatar_id' }, { status: 400 });
  }

  if (!/^[a-zA-Z0-9]+$/.test(avatarId)) {
    return json({ ok: false, error: 'Invalid avatar_id' }, { status: 400 });
  }

  const script = `
set -euo pipefail
cd /opt/smallverse
timeout 20s python3 "${AVATAR_PROFILE}" --avatar-id '${avatarId}'
`;

  const result = await ssh(script, 25000);
  const payload = extractJson(result.stdout);

  if (!payload) {
    return json(
      {
        ok: false,
        error: result.stderr || result.error || 'Failed to parse avatar profile response',
        stdout: result.stdout?.slice?.(0, 1000) || ''
      },
      { status: 500 }
    );
  }

  return json(attachRenderPacket(payload, avatarId));
}
