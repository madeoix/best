export function resolveSmallverseAssetPath(raw, avatarId = null) {
  if (!raw) return null;

  let s = String(raw).trim();
  s = s.split('?')[0].split('#')[0];

  s = s.replace('$hu/', 'avatars/head/base/unisex/');
  s = s.replace('$hf/', 'avatars/head/base/female/');
  s = s.replace('$hm/', 'avatars/head/base/male/');
  s = s.replace('$bu/', 'avatars/body/base/unisex/');
  s = s.replace('$bf/', 'avatars/body/base/female/');
  s = s.replace('$bm/', 'avatars/body/base/male/');

  if (s.startsWith('/')) return s;
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  if (s.startsWith('avatars/')) return `/avatar-assets/${s}`;

  if (avatarId) return `/avatar-renders/${avatarId}/${s}`;
  return s;
}

export function assetBasename(path) {
  return String(path ?? '').split('/').pop()?.toLowerCase() ?? '';
}
