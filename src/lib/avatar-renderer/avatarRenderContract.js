import { resolveSmallverseAssetPath } from './assetResolver.js';

export async function loadAvatarRenderContract(avatarId) {
  if (!avatarId) {
    throw new Error('Avatar ID is required');
  }

  const url =
    `/avatar-renders/${encodeURIComponent(avatarId)}` +
    `/render-contract.v4.json?ts=${Date.now()}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to load avatar render contract: ${response.status}`
    );
  }

  const contract = await response.json();

  if (
    contract?.contract !==
    'smallverse-avatar-render-contract/v4'
  ) {
    throw new Error(
      `Unsupported avatar render contract: ${contract?.contract}`
    );
  }

  if (!contract?.head?.morph_groups) {
    throw new Error(
      'Avatar render contract contains no head morph groups'
    );
  }

  return contract;
}

export function resolveContractAssetUrl(
  asset,
  avatarId
) {
  if (asset?.url) return asset.url;

  if (asset?.ref) {
    return resolveSmallverseAssetPath(
      asset.ref,
      avatarId
    );
  }

  throw new Error('Contract asset has no URL or ref');
}

export function getRigidMeshAssets(
  contract,
  avatarId
) {
  const unique = new Map();

  for (
    const asset of
    contract?.head?.rigid_meshes ?? []
  ) {
    const url = resolveContractAssetUrl(
      asset,
      avatarId
    );

    unique.set(url, {
      ...asset,
      url
    });
  }

  return [...unique.values()];
}
