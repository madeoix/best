/**
 * Public catalog taxonomy is derived only from canonical XML path/category
 * fields.  It intentionally never guesses from an item display name.
 */
export function itemTaxonomy(item = {}) {
  const category = String(item.category || '').toLowerCase().trim();
  const source = String(item.source_xml || item.sourceXml || '').toLowerCase();

  const seasonal = {
    xmas: 'Winter / Christmas',
    valentine: 'Valentine',
    mothersday: "Mother's Day"
  };
  if (seasonal[category]) return { id: category, label: seasonal[category], family: 'seasonal' };

  if (/(?:^|\/)wear(?:\/|$)|\/clothing\//.test(source) || category === 'clothing') {
    return { id: 'wearables', label: 'Wearables', family: 'avatar' };
  }
  if (/(?:^|\/)head(?:\/|$)|\/hat\//.test(source) || category === 'head') {
    return { id: 'heads', label: 'Heads & accessories', family: 'avatar' };
  }
  if (/(?:^|\/)back(?:\/|$)/.test(source) || category === 'back') {
    return { id: 'back', label: 'Back items', family: 'avatar' };
  }
  if (/(?:^|\/)feet(?:\/|$)|\/shoes?\//.test(source)) {
    return { id: 'feet', label: 'Shoes & feet', family: 'avatar' };
  }
  if (/(?:^|\/)furniture(?:\/|$)|\/chair\//.test(source)) {
    return { id: 'furniture', label: 'Furniture', family: 'space' };
  }
  if (/(?:^|\/)wall(?:\/|$)/.test(source) || category === 'wall') {
    return { id: 'wall', label: 'Wall & decor', family: 'space' };
  }
  if (/(?:^|\/)plant(?:\/|$)/.test(source) || category === 'plant') {
    return { id: 'plants', label: 'Plants', family: 'space' };
  }
  if (/(?:^|\/)consumable(?:\/|$)/.test(source) || category === 'consumable' || category === 'usable') {
    return { id: 'consumables', label: 'Consumables', family: 'collectible' };
  }
  return { id: 'collectibles', label: 'Collectibles & curios', family: 'collectible' };
}
