const SMALLVERSE_ASSET_BASE = 'https://content.smallverse.app/assets';

export function smallverseIconUrl(path) {
  if (!path) return '';

  const value = String(path).trim();
  if (!value) return '';

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  const clean = value.replace(/^\/+/, '');

  return `${SMALLVERSE_ASSET_BASE}/${clean}`;
}

export function bestItemIconPath(item) {
  if (!item) return '';

  // Prefer the real Smallverse CDN icon.
  // Variant icons are local/generated cache paths and should not be used here.
  return item.icon || '';
}
