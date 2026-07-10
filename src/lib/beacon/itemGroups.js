function words(item) {
  return `${item?.name || ''} ${item?.category || ''} ${item?.tags || ''}`.toLowerCase();
}

function isWearable(item) {
  const text = words(item);

  return (
    text.includes('wear') ||
    text.includes('wearable') ||
    text.includes('clothing') ||
    text.includes('jacket') ||
    text.includes('sneaker') ||
    text.includes('shoe') ||
    text.includes('pants') ||
    text.includes('cardigan') ||
    text.includes('shirt') ||
    text.includes('top') ||
    text.includes('dress') ||
    text.includes('outfit')
  );
}

function isHeadwear(item) {
  const text = words(item);

  return (
    text.includes('hat') ||
    text.includes('cap') ||
    text.includes('helmet') ||
    text.includes('head') ||
    text.includes('hair') ||
    text.includes('mask') ||
    text.includes('antlers')
  );
}

function isCreature(item) {
  const text = words(item);

  return (
    text.includes('elephant') ||
    text.includes('dolphin') ||
    text.includes('panda') ||
    text.includes('cow') ||
    text.includes('bird') ||
    text.includes('tiger') ||
    text.includes('dragon') ||
    text.includes('ghost') ||
    text.includes('pet') ||
    text.includes('animal') ||
    text.includes('baby')
  );
}

function isFurniture(item) {
  const text = words(item);

  return (
    text.includes('chair') ||
    text.includes('couch') ||
    text.includes('counter') ||
    text.includes('table') ||
    text.includes('furniture') ||
    text.includes('seat') ||
    text.includes('room')
  );
}

function isProp(item) {
  const text = words(item);

  return (
    text.includes('staff') ||
    text.includes('bottle') ||
    text.includes('skull') ||
    text.includes('board') ||
    text.includes('potion') ||
    text.includes('tool') ||
    text.includes('prop') ||
    text.includes('communicator') ||
    text.includes('bubblegum') ||
    text.includes('drink') ||
    text.includes('cappuccino') ||
    text.includes('sack') ||
    text.includes('necklace')
  );
}

function uniqueBySource(items) {
  const seen = new Set();
  const out = [];

  for (const item of items || []) {
    const key = item?.source_xml || item?.name;
    if (!key || seen.has(key)) continue;

    seen.add(key);
    out.push(item);
  }

  return out;
}

function byCopies(a, b) {
  return Number(b?.uid_count || 0) - Number(a?.uid_count || 0);
}

function byOwnersThenCopies(a, b) {
  const ownerDelta = Number(b?.owner_count || 0) - Number(a?.owner_count || 0);
  if (ownerDelta) return ownerDelta;
  return byCopies(a, b);
}

function byLatest(a, b) {
  return String(b?.latest_seen || '').localeCompare(String(a?.latest_seen || ''));
}

function takeFresh(items, used, limit) {
  const out = [];

  for (const item of items) {
    const key = item?.source_xml || item?.name;
    if (!key || used.has(key)) continue;

    used.add(key);
    out.push(item);

    if (out.length >= limit) break;
  }

  return out;
}

export function makeItemGroups(items = [], options = {}) {
  const {
    dedupeAcrossGroups = true,
    limit = 10
  } = options;

  const source = uniqueBySource(items);
  const used = new Set();

  const take = (list, size = limit) => {
    const sorted = uniqueBySource(list);

    if (!dedupeAcrossGroups) {
      return sorted.slice(0, size);
    }

    return takeFresh(sorted, used, size);
  };

  const featured = take(
    [...source]
      .filter((item) => Number(item?.owner_count || 0) > 0 || Number(item?.uid_count || 0) > 0)
      .sort(byOwnersThenCopies),
    limit
  );

  const wearables = take(
    source
      .filter((item) => isWearable(item) && !isHeadwear(item))
      .sort(byCopies),
    limit
  );

  const headwear = take(
    source
      .filter(isHeadwear)
      .sort(byCopies),
    limit
  );

  const creatures = take(
    source
      .filter(isCreature)
      .sort(byCopies),
    limit
  );

  const furniture = take(
    source
      .filter(isFurniture)
      .sort(byCopies),
    limit
  );

  const props = take(
    source
      .filter((item) => isProp(item) && !isWearable(item) && !isCreature(item) && !isFurniture(item))
      .sort(byCopies),
    limit
  );

  const recent = take(
    source
      .filter((item) => item?.latest_seen)
      .sort(byLatest),
    limit
  );

  return [
    {
      id: 'featured',
      label: 'Featured records',
      description: 'Items with the clearest copy and owner signal.',
      items: featured
    },
    {
      id: 'wearables',
      label: 'Wearables',
      description: 'Clothing, outfits, shoes, and wearable items.',
      items: wearables
    },
    {
      id: 'headwear',
      label: 'Heads & accessories',
      description: 'Hats, helmets, head items, and wearable accessories.',
      items: headwear
    },
    {
      id: 'creatures',
      label: 'Creatures & companions',
      description: 'Animals, pets, companions, and character-like objects.',
      items: creatures
    },
    {
      id: 'furniture',
      label: 'Furniture & rooms',
      description: 'Chairs, couches, counters, seats, and room objects.',
      items: furniture
    },
    {
      id: 'props',
      label: 'Props & curios',
      description: 'Objects, tools, collectibles, consumables, and oddities.',
      items: props
    },
    {
      id: 'recent',
      label: 'Recently observed',
      description: 'Latest items seen by the current Observatory snapshot.',
      items: recent
    }
  ].filter((group) => group.items.length);
}
