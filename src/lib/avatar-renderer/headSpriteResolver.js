import { resolveSmallverseAssetPath } from './assetResolver.js';
import { fetchJsonMaybe } from './designManifest.js';

function numberish(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function spriteTransform(sprite) {
  const attrs = sprite.attrs ?? {};

  return {
    x: numberish(attrs.tx ?? attrs.x, 0),
    y: numberish(attrs.ty ?? attrs.y, 0),
    scaleX: numberish(attrs.sx ?? attrs.scaleX, 1),
    scaleY: numberish(attrs.sy ?? attrs.scaleY, 1),
    alpha: numberish(attrs.a ?? attrs.alpha, 1),
    blend: attrs.m ?? attrs.blend ?? 'normal'
  };
}

export async function resolveHeadSprites(avatarId) {
  const manifest = await fetchJsonMaybe(`/avatar-renders/${avatarId}/head-design-sprites.json`);
  const sprites = Array.isArray(manifest?.sprites) ? manifest.sprites : [];

  return sprites
    .map((sprite, index) => {
      const raw = sprite.url || sprite.ref || sprite.attrs?.s || null;
      const src = raw?.startsWith('/avatar-assets/')
        ? raw
        : resolveSmallverseAssetPath(raw, avatarId);

      return {
        index,
        optionId: sprite.option_id,
        selectedId: sprite.selected_id,
        label: sprite.id || sprite.name || sprite.cId || src?.split('/').pop() || `sprite_${index}`,
        raw,
        src,
        attrs: sprite.attrs ?? {},
        transform: spriteTransform(sprite)
      };
    })
    .filter((sprite) => sprite.src && /\.(png|jpg|jpeg)$/i.test(sprite.src));
}

export function isFaceFeatureSprite(sprite) {
  const key = `${sprite.optionId ?? ''} ${sprite.selectedId ?? ''} ${sprite.label ?? ''} ${sprite.src ?? ''}`.toLowerCase();

  // Do not put hair/glasses here: those are already represented by O3D meshes.
  if (key.includes('/hair/')) return false;
  if (key.includes('/props/')) return false;
  if (key.includes('glasses')) return false;
  if (key.includes('gl_')) return false;

  return (
    key.includes('/eyes/') ||
    key.includes('/brow/') ||
    key.includes('/mouth/') ||
    key.includes('/skin/mu_') ||
    key.includes('blusher') ||
    key.includes('makeup') ||
    key.includes('mouth') ||
    key.includes('brow') ||
    key.includes('eye')
  );
}
