import { resolveSmallverseAssetPath, assetBasename } from './assetResolver.js';

function walkStrings(value, out = []) {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) walkStrings(v, out);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) walkStrings(v, out);
  }
  return out;
}

export async function fetchJsonMaybe(url) {
  try {
    const res = await fetch(`${url}?ts=${Date.now()}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function discoverAvatarO3DAssets(avatarId) {
  const base = `/avatar-renders/${avatarId}`;

  const manifests = [
    await fetchJsonMaybe(`${base}/head-design-sprites.json`),
    await fetchJsonMaybe(`${base}/render-bundle.v3.json`),
    await fetchJsonMaybe(`${base}/render-bundle.v2.json`)
  ].filter(Boolean);

  const refs = new Map();

  for (const manifest of manifests) {
    for (const raw of walkStrings(manifest)) {
      if (!String(raw).includes('.o3d')) continue;
      const resolved = resolveSmallverseAssetPath(raw, avatarId);
      refs.set(assetBasename(resolved), resolved);
    }
  }

  return [...refs.values()];
}

export function defaultVisibleMeshFilter(url) {
  const key = String(url).toLowerCase();

  if (key.includes('f_anime.o3d')) return false;
  if (key.includes('f_f_06_thin.o3d')) return false;
  if (key.includes('nose_04_straight.o3d')) return false;

  return key.endsWith('.o3d');
}
