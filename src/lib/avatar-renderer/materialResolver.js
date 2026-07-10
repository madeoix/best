import * as THREE from 'three';
import {
  getMaterialChannel
} from './avatarMaterialContext.js';

const texturePromiseCache = new Map();

function resolveDeclaredTextureCandidates(
  sourceUrl,
  textureSource
) {
  if (!textureSource) return [];

  try {
    const source = new URL(
      sourceUrl,
      window.location.origin
    );

    const sameDirectory = new URL(
      textureSource,
      source
    ).pathname;

    const candidates = [
      sameDirectory
    ];

    const unisexDirectory =
      sameDirectory.replace(
        /\/avatars\/(head|body)\/base\/(?:male|female)\//,
        '/avatars/$1/base/unisex/'
      );

    if (unisexDirectory !== sameDirectory) {
      candidates.push(unisexDirectory);
    }

    return [...new Set(candidates)];
  } catch {
    return [];
  }
}

function configureTexture(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;

  // o3dParser converts V using 1-v, so ordinary bitmap textures
  // must not also be flipped during upload.
  texture.flipY = false;

  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return texture;
}

export function loadSmallverseTexture(path) {
  if (!path) {
    return Promise.reject(
      new Error('Texture path is required')
    );
  }

  if (!texturePromiseCache.has(path)) {
    texturePromiseCache.set(
      path,
      (async () => {
        const response = await fetch(path);

        if (!response.ok) {
          throw new Error(
            `Texture unavailable: ${path} ` +
            `(${response.status})`
          );
        }

        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);
        const texture = new THREE.Texture(bitmap);

        texture.name = path;

        return configureTexture(texture);
      })()
    );
  }

  return texturePromiseCache.get(path);
}

function channelColor(channel) {
  return new THREE.Color(
    channel?.color ?? 0xb8c0cc
  );
}

function configureLaneMaterial(material, lane) {
  switch (lane) {
    case 'glasses':
      material.transparent = true;
      material.alphaTest = 0.001;
      material.roughness = 0.24;
      material.metalness = 0.12;
      break;

    case 'hair':
      material.transparent = true;
      material.alphaTest = 0.001;
      material.roughness = 0.72;
      material.metalness = 0;
      break;

    case 'skin':
      material.transparent = false;
      material.roughness = 0.82;
      material.metalness = 0;
      break;

    default:
      material.transparent = false;
      material.roughness = 0.78;
      material.metalness = 0;
      break;
  }
}

export function createSmallverseMaterial({
  meshName,
  sourceUrl,
  o3dMaterial,
  materialContext
}) {
  const materialName =
    o3dMaterial?.name ??
    `material_${o3dMaterial?.id ?? '0'}`;

  const {
    lane,
    sourceId,
    channel,
    filters,
    ambiguous
  } = getMaterialChannel(
    materialContext,
    materialName
  );

  const textureCandidates =
    resolveDeclaredTextureCandidates(
      sourceUrl,
      o3dMaterial?.texture
    );

  const material = new THREE.MeshStandardMaterial({
    color: channelColor(channel),
    side: THREE.DoubleSide
  });

  configureLaneMaterial(material, lane);

  material.name =
    `${materialName}:${sourceId ?? 'unbound'}`;

  material.userData = {
    strategy:
      'o3d-relative-texture-plus-sid-channel',
    meshName,
    sourceUrl,
    materialId:
      o3dMaterial?.id ?? null,
    materialName,
    lane,
    sourceId,
    filterStackCount:
      filters.length,
    ambiguousFilterStack:
      ambiguous,
    declaredTexture:
      o3dMaterial?.texture ?? null,
    textureCandidates,
    resolvedTexture: null,
    colorTransform: channel
      ? {
          color: channel.color,
          alpha: channel.alpha,
          brightness: channel.brightness,
          contrast: channel.contrast,
          optionId: channel.optionId,
          selectedId: channel.selectedId
        }
      : null
  };

  if (textureCandidates.length) {
    (async () => {
      const errors = [];

      for (const texturePath of textureCandidates) {
        try {
          const texture =
            await loadSmallverseTexture(
              texturePath
            );

          material.map = texture;
          material.needsUpdate = true;

          material.userData.textureLoaded =
            true;

          material.userData.resolvedTexture =
            texturePath;

          return;
        } catch (error) {
          errors.push(
            String(error?.message ?? error)
          );
        }
      }

      // Some SmallVerse texture slots are procedural placeholders.
      // Preserve the selected color channel when no bitmap exists.
      material.map = null;
      material.needsUpdate = true;

      material.userData.textureLoaded =
        false;

      material.userData.textureErrors =
        errors;
    })();
  }


  return material;
}
