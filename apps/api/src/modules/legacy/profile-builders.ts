type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as AnyRecord
    : null;
}

function records(value: unknown): AnyRecord[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((item): item is AnyRecord => item !== null)
    : [];
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function eventTime(row: AnyRecord): string {
  return text(
    row.observed_at ??
    row.seen_at ??
    row.timestamp ??
    row.at ??
    row.updated_at
  );
}

function sourceXml(row: AnyRecord): string {
  return text(row.source_xml ?? row.xml ?? row.source);
}

function ownerId(row: AnyRecord): string {
  return text(row.owner_id ?? row.owner ?? row.user_id);
}

function avatarId(row: AnyRecord): string {
  return text(row.avatar_id ?? row.avatarId);
}

function spaceId(row: AnyRecord): string {
  return text(row.space_id ?? row.spaceId ?? row.world_id);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function itemName(row: AnyRecord | null, source: string): string {
  if (row) {
    const explicit = text(
      row.name ??
      row.display_name ??
      row.item_name ??
      row.title
    );

    if (explicit) return explicit;
  }

  return source
    .split('/')
    .at(-1)
    ?.replace(/_item\.xml$/i, '')
    .replace(/\.xml$/i, '')
    .replaceAll('_', ' ') || source;
}

function worldSpaces(world: AnyRecord): AnyRecord[] {
  const direct = records(world.spaces);

  if (direct.length) return direct;

  const sections = asRecord(world.sections);
  if (!sections) return [];

  return Object.values(sections).flatMap(records);
}

function worldAvatars(world: AnyRecord): AnyRecord[] {
  return records(world.avatars);
}

function allEvidence(observatory: AnyRecord): AnyRecord[] {
  return [
    ...records(observatory.observations),
    ...records(observatory.protocol_events),
    ...records(observatory.avatar_wearing_events),
    ...records(observatory.dirty_snapshot_events)
  ];
}

function assetBySource(observatory: AnyRecord): Map<string, AnyRecord> {
  const out = new Map<string, AnyRecord>();

  for (const asset of records(observatory.assets)) {
    const source = sourceXml(asset);
    if (source && !out.has(source)) out.set(source, asset);
  }

  return out;
}

function avatarById(
  world: AnyRecord,
  avatarIndex: AnyRecord | null
): Map<string, AnyRecord> {
  const out = new Map<string, AnyRecord>();

  for (const avatar of worldAvatars(world)) {
    const id = avatarId(avatar);
    if (id) out.set(id, clone(avatar));
  }

  const indexed = asRecord(avatarIndex?.by_avatar_id);
  if (indexed) {
    for (const [id, value] of Object.entries(indexed)) {
      const record = asRecord(value);
      if (!record) continue;
      out.set(id, {
        ...(out.get(id) ?? {}),
        ...clone(record),
        avatar_id: id
      });
    }
  }

  return out;
}

function portraitFields(avatar: AnyRecord | undefined) {
  const head = text(avatar?.head_url);
  const thumb = text(avatar?.thumb_url);
  const snapshot = text(avatar?.snapshot_url);

  return {
    avatar_portrait_url: head,
    avatar_portrait_thumb_url: thumb,
    avatar_portrait_snapshot_url: snapshot,
    avatar_portrait_source:
      head || thumb || snapshot
        ? 'beacon-world-index'
        : 'none',
    avatar_portrait_status:
      head || thumb || snapshot
        ? 'verified'
        : 'missing'
  };
}

function sourceAliases(source: string): string[] {
  const aliases = [source];

  if (source.endsWith('.xml') && !source.endsWith('_item.xml')) {
    aliases.push(source.slice(0, -4) + '_item.xml');
  }

  if (source.includes('_icon_')) {
    const base = source.split('_icon_', 1)[0] ?? source;
    aliases.push(`${base}_item.xml`, `${base}.xml`);
  }

  return [...new Set(aliases)];
}

function buildOwnerRows(
  evidence: AnyRecord[],
  avatars: Map<string, AnyRecord>
): AnyRecord[] {
  const grouped = new Map<string, {
    count: number;
    firstSeen: string;
    latestSeen: string;
    avatarIds: Set<string>;
    avatarName: string;
  }>();

  for (const row of evidence) {
    const id = ownerId(row);
    if (!id) continue;

    const current = grouped.get(id) ?? {
      count: 0,
      firstSeen: '',
      latestSeen: '',
      avatarIds: new Set<string>(),
      avatarName: ''
    };

    current.count += 1;

    const at = eventTime(row);
    if (at && (!current.firstSeen || at < current.firstSeen)) {
      current.firstSeen = at;
    }
    if (at > current.latestSeen) current.latestSeen = at;

    const aid = avatarId(row);
    if (aid) current.avatarIds.add(aid);

    const candidateName = text(
      row.avatar_name ??
      row.owner_name ??
      row.display_name
    );
    if (!current.avatarName && candidateName) {
      current.avatarName = candidateName;
    }

    grouped.set(id, current);
  }

  return [...grouped.entries()]
    .map(([id, value]) => {
      const primaryAvatarId = [...value.avatarIds][0] ?? '';
      const avatar = avatars.get(primaryAvatarId);
      const displayName =
        text(
          avatar?.avatar_name ??
          avatar?.display_name ??
          avatar?.username
        ) ||
        value.avatarName ||
        id;

      return {
        owner_id: id,
        display_name: displayName,
        avatar_id: primaryAvatarId,
        avatar_name: displayName,
        primary_avatar_id: primaryAvatarId,
        primary_avatar_name: displayName,
        display_avatar_id: primaryAvatarId,
        display_avatar_name: displayName,
        evidence_count: value.count,
        first_seen: value.firstSeen || null,
        latest_seen: value.latestSeen || null,
        confidence: primaryAvatarId ? 70 : 40,
        identity_reason: primaryAvatarId
          ? 'Observed owner/avatar association'
          : 'Owner identifier observed without resolved avatar',
        identity_source: primaryAvatarId
          ? 'preserved-observatory-export'
          : 'none',
        ...portraitFields(avatar)
      };
    })
    .sort((left, right) =>
      Number(right.evidence_count) - Number(left.evidence_count) ||
      text(right.latest_seen).localeCompare(text(left.latest_seen))
    );
}

function buildSpaceRows(
  evidence: AnyRecord[],
  world: AnyRecord
): AnyRecord[] {
  const spaces = worldSpaces(world);
  const byId = new Map(
    spaces
      .map((space) => [spaceId(space), space] as const)
      .filter(([id]) => Boolean(id))
  );
  const grouped = new Map<string, {
    count: number;
    latestSeen: string;
  }>();

  for (const row of evidence) {
    const id = spaceId(row);
    if (!id) continue;

    const current = grouped.get(id) ?? {
      count: 0,
      latestSeen: ''
    };

    current.count += 1;
    const at = eventTime(row);
    if (at > current.latestSeen) current.latestSeen = at;
    grouped.set(id, current);
  }

  return [...grouped.entries()]
    .map(([id, value]) => {
      const space = byId.get(id) ?? {};

      return {
        ...clone(space),
        space_id: id,
        space_name:
          text(space.space_name ?? space.display_name ?? space.name) ||
          id,
        observation_count: value.count,
        latest_seen: value.latestSeen || null
      };
    })
    .sort((left, right) =>
      Number(right.observation_count) -
      Number(left.observation_count)
    );
}

function itemFromEvidence(
  asset: AnyRecord | null,
  evidence: AnyRecord[],
  source: string
): AnyRecord {
  const sample = evidence[0] ?? {};
  const base = asset ?? {};

  return {
    ...clone(base),
    source_xml: source,
    name: itemName(asset ?? sample, source),
    description:
      base.description ??
      sample.description ??
      null,
    category:
      base.category ??
      base.type ??
      sample.category ??
      null,
    tags:
      base.tags ??
      sample.tags ??
      null,
    icon:
      base.variant_icon ??
      base.icon ??
      base.rendered_icon ??
      sample.icon ??
      null,
    is_rare: Boolean(base.is_rare ?? sample.is_rare),
    currency:
      base.currency ??
      base.catalog_currency ??
      sample.currency ??
      null,
    xml_price:
      base.xml_price ??
      base.price ??
      base.catalog_price ??
      sample.catalog_price ??
      null
  };
}

export function buildObservatoryItem(
  observatory: AnyRecord,
  requestedSource: string
): AnyRecord {
  const aliases = new Set(sourceAliases(requestedSource));
  const assets = records(observatory.assets);
  const observations = records(observatory.observations)
    .filter((row) => aliases.has(sourceXml(row)));
  const item = assets.find((row) => aliases.has(sourceXml(row))) ?? null;
  const resolvedSource = item ? sourceXml(item) : requestedSource;
  const uids = new Set(
    observations.map((row) => text(row.uid)).filter(Boolean)
  );
  const owners = new Set(
    observations.map(ownerId).filter(Boolean)
  );

  const uidHistory = records(observatory.uid_change_events)
    .filter((row) => uids.has(text(row.uid)))
    .sort((left, right) =>
      eventTime(right).localeCompare(eventTime(left))
    );

  const variantVisuals = records(observatory.variant_visuals)
    .filter((row) => aliases.has(sourceXml(row)))
    .sort((left, right) =>
      eventTime(right).localeCompare(eventTime(left))
    );

  observations.sort((left, right) =>
    eventTime(right).localeCompare(eventTime(left))
  );

  const resolvedItem =
    item ??
    (observations.length
      ? itemFromEvidence(null, observations, resolvedSource)
      : null);

  return {
    ok: resolvedItem !== null,
    source: 'observatory-sync.json',
    item: resolvedItem,
    summary: {
      source_xml: resolvedSource,
      observation_count: observations.length,
      uid_count: uids.size,
      owner_count: owners.size,
      latest_seen:
        observations.length > 0
          ? eventTime(observations[0] ?? {})
          : null
    },
    observations: observations.slice(0, 100),
    uid_history: uidHistory.slice(0, 100),
    variant_visuals: variantVisuals.slice(0, 50)
  };
}

export function buildItemProfile(
  observatory: AnyRecord,
  world: AnyRecord,
  avatarIndex: AnyRecord | null,
  requestedSource: string
): AnyRecord {
  const aliases = new Set(sourceAliases(requestedSource));
  const assets = assetBySource(observatory);
  const asset =
    [...aliases]
      .map((source) => assets.get(source))
      .find((value): value is AnyRecord => Boolean(value)) ??
    null;
  const evidence = allEvidence(observatory)
    .filter((row) => aliases.has(sourceXml(row)))
    .sort((left, right) =>
      eventTime(right).localeCompare(eventTime(left))
    );
  const resolvedSource = asset
    ? sourceXml(asset)
    : sourceXml(evidence[0] ?? {}) || requestedSource;

  if (!asset && evidence.length === 0) {
    return {
      ok: false,
      error: 'profile not found',
      source_xml: requestedSource,
      tried: [...aliases]
    };
  }

  const avatars = avatarById(world, avatarIndex);
  const owners = buildOwnerRows(evidence, avatars);
  const spaces = buildSpaceRows(evidence, world);
  const uniqueUids = new Set(
    evidence.map((row) => text(row.uid)).filter(Boolean)
  );
  const asks = evidence
    .map((row) => finiteNumber(row.ask ?? row.ask_price))
    .filter((value): value is number => value !== null);

  return {
    ok: true,
    contract: 'smallverse-beacon-item-profile/v2',
    source: 'preserved-read-model',
    item: itemFromEvidence(asset, evidence, resolvedSource),
    stats: {
      observations: evidence.length,
      known_copies: uniqueUids.size,
      observed_owners: owners.length,
      observed_spaces: spaces.length,
      minimum_ask: asks.length ? Math.min(...asks) : null,
      maximum_ask: asks.length ? Math.max(...asks) : null
    },
    owners,
    spaces,
    avatars: owners
      .filter((owner) => text(owner.avatar_id))
      .map((owner) => ({
        avatar_id: owner.avatar_id,
        owner_id: owner.owner_id,
        avatar_name: owner.avatar_name,
        avatar_portrait_url: owner.avatar_portrait_url,
        avatar_portrait_thumb_url:
          owner.avatar_portrait_thumb_url,
        avatar_portrait_snapshot_url:
          owner.avatar_portrait_snapshot_url,
        avatar_portrait_source:
          owner.avatar_portrait_source
      })),
    latest: evidence.slice(0, 100),
    technical: {
      profile_builder: 'smallverse-public-api/v2',
      evidence_source: 'observatory-sync.json',
      world_source: 'beacon-world-index.json',
      requested_source_xml: requestedSource,
      resolved_source_xml: resolvedSource
    }
  };
}

export function mergeCachedItemProfile(
  cached: AnyRecord,
  cacheRoot: AnyRecord
): AnyRecord {
  const output = clone(cached);

  return {
    ...output,
    ok: output.ok !== false,
    cache_generated_at:
      output.cache_generated_at ??
      cacheRoot.generated_at ??
      null,
    cache_counts:
      output.cache_counts ??
      cacheRoot.counts ??
      null
  };
}

export function findCachedItemProfile(
  cacheRoot: AnyRecord,
  requestedSource: string
): AnyRecord | null {
  const profiles = asRecord(cacheRoot.profiles);
  if (!profiles) return null;

  for (const source of sourceAliases(requestedSource)) {
    const profile = asRecord(profiles[source]);
    if (profile) return mergeCachedItemProfile(profile, cacheRoot);
  }

  return null;
}

export function buildAvatarProfile(
  observatory: AnyRecord,
  world: AnyRecord,
  avatarIndex: AnyRecord | null,
  requestedAvatarId: string
): AnyRecord {
  const avatars = avatarById(world, avatarIndex);
  const indexed = avatars.get(requestedAvatarId) ?? null;
  const evidence = allEvidence(observatory)
    .filter((row) => avatarId(row) === requestedAvatarId)
    .sort((left, right) =>
      eventTime(right).localeCompare(eventTime(left))
    );

  const spacesFromWorld = worldSpaces(world).filter((space) =>
    Array.isArray(space.avatar_ids) &&
    space.avatar_ids.map(text).includes(requestedAvatarId)
  );
  const evidenceSpaces = buildSpaceRows(evidence, world);
  const spaceMap = new Map<string, AnyRecord>();

  for (const space of [...spacesFromWorld, ...evidenceSpaces]) {
    const id = spaceId(space);
    if (id) spaceMap.set(id, clone(space));
  }

  const ownerRows = buildOwnerRows(evidence, avatars);
  const assets = assetBySource(observatory);
  const itemRows = new Map<string, AnyRecord>();

  for (const row of evidence) {
    const source = sourceXml(row);
    if (!source) continue;

    const current = itemRows.get(source) ?? {
      ...itemFromEvidence(assets.get(source) ?? null, [row], source),
      evidence_count: 0,
      owner_count: 0,
      _owners: new Set<string>()
    };

    current.evidence_count =
      Number(current.evidence_count ?? 0) + 1;

    const owner = ownerId(row);
    const ownerSet = current._owners instanceof Set
      ? current._owners as Set<string>
      : new Set<string>();

    if (owner) ownerSet.add(owner);
    current._owners = ownerSet;
    current.owner_count = ownerSet.size;
    itemRows.set(source, current);
  }

  const items = [...itemRows.values()]
    .map((row) => {
      const output = { ...row };
      delete output._owners;
      return output;
    })
    .sort((left, right) =>
      Number(right.evidence_count) -
      Number(left.evidence_count)
    );

  const displayName =
    text(
      indexed?.display_name ??
      indexed?.avatar_name ??
      indexed?.username
    ) ||
    [
      text(indexed?.first_name),
      text(indexed?.last_name)
    ].filter(Boolean).join(' ') ||
    requestedAvatarId;

  const avatar = {
    ...(indexed ? clone(indexed) : {}),
    avatar_id: requestedAvatarId,
    display_name: displayName,
    avatar_name:
      text(indexed?.avatar_name) || displayName,
    head_url: text(indexed?.head_url) || null,
    thumb_url: text(indexed?.thumb_url) || null,
    snapshot_url: text(indexed?.snapshot_url) || null
  };

  const assetCount = [
    avatar.head_url,
    avatar.thumb_url,
    avatar.snapshot_url
  ].filter(Boolean).length;

  if (!indexed && evidence.length === 0) {
    return {
      ok: false,
      error: 'avatar profile not found',
      avatar_id: requestedAvatarId
    };
  }

  const renderBase = `/avatar-renders/${requestedAvatarId}`;

  return {
    ok: true,
    contract: 'smallverse-beacon-avatar-profile/v2',
    source: 'preserved-read-model',
    avatar,
    owners: ownerRows,
    spaces: [...spaceMap.values()],
    items,
    evidence: evidence.slice(0, 100),
    stats: {
      owner_count: ownerRows.length,
      associated_item_count: items.length,
      associated_space_count: spaceMap.size,
      asset_count: assetCount,
      evidence_count: evidence.length
    },
    render_packet: {
      full_body_url: `${renderBase}/saveAvatar-carved-1.png`,
      preview_url: `${renderBase}/saveAvatar-carved-0.png`,
      thumb_url: `${renderBase}/saveAvatar-carved-2.png`,
      manifest_url: `${renderBase}/render-packet.json`,
      source: 'flash_saveAvatar_capture'
    },
    technical: {
      profile_builder: 'smallverse-public-api/v2',
      evidence_source: 'observatory-sync.json',
      world_source: 'beacon-world-index.json'
    }
  };
}

function isPromotedItem(item: AnyRecord): boolean {
  if (Boolean(item.is_rare) || Boolean(item.is_legendary)) {
    return true;
  }

  const tokens = [
    item.tags,
    item.category,
    item.rarity,
    item.rarity_label
  ]
    .map((value) => text(value).toLocaleLowerCase())
    .join(' ');

  return (
    tokens.includes('rare') ||
    tokens.includes('legendary') ||
    finiteNumber(item.ask_min) !== null ||
    finiteNumber(item.ask_max) !== null
  );
}

function promotionReasons(item: AnyRecord): string[] {
  const reasons: string[] = [];

  if (Boolean(item.is_rare)) reasons.push('is_rare');
  if (Boolean(item.is_legendary)) reasons.push('legendary');

  const tokens = [
    item.tags,
    item.category,
    item.rarity,
    item.rarity_label
  ]
    .map((value) => text(value).toLocaleLowerCase())
    .join(' ');

  if (tokens.includes('rare') && !reasons.includes('is_rare')) {
    reasons.push('rare');
  }
  if (tokens.includes('legendary') && !reasons.includes('legendary')) {
    reasons.push('legendary');
  }
  if (
    finiteNumber(item.ask_min) !== null ||
    finiteNumber(item.ask_max) !== null
  ) {
    reasons.push('price evidence');
  }

  return reasons.length ? reasons : ['promoted'];
}

export function buildSpaceProfile(
  observatory: AnyRecord,
  world: AnyRecord,
  avatarIndex: AnyRecord | null,
  requestedSpaceId: string
): AnyRecord {
  const space = worldSpaces(world)
    .find((candidate) => spaceId(candidate) === requestedSpaceId) ??
    null;

  if (!space) {
    return {
      ok: false,
      error: 'space profile not found',
      space_id: requestedSpaceId
    };
  }

  const evidence = allEvidence(observatory)
    .filter((row) => spaceId(row) === requestedSpaceId)
    .sort((left, right) =>
      eventTime(right).localeCompare(eventTime(left))
    );
  const assets = assetBySource(observatory);
  const itemSources = new Set<string>();

  for (const source of Array.isArray(space.item_source_xmls)
    ? space.item_source_xmls.map(text)
    : []) {
    if (source) itemSources.add(source);
  }

  for (const row of evidence) {
    const source = sourceXml(row);
    if (source) itemSources.add(source);
  }

  const itemRows: AnyRecord[] = [];

  for (const source of itemSources) {
    const rows = evidence.filter((row) => sourceXml(row) === source);
    const owners = new Set(rows.map(ownerId).filter(Boolean));
    const uids = new Set(rows.map((row) => text(row.uid)).filter(Boolean));
    const asks = rows
      .map((row) => finiteNumber(row.ask ?? row.ask_price))
      .filter((value): value is number => value !== null);
    const item = {
      ...itemFromEvidence(assets.get(source) ?? null, rows, source),
      observation_count: rows.length,
      uid_count: uids.size,
      owner_count: owners.size,
      ask_min: asks.length ? Math.min(...asks) : null,
      ask_max: asks.length ? Math.max(...asks) : null,
      latest_seen:
        rows.length > 0
          ? eventTime(rows[0] ?? {})
          : null
    };

    itemRows.push(item);
  }

  const usefulItems = itemRows
    .filter(isPromotedItem)
    .map<AnyRecord>((item) => ({
      ...item,
      signal_reasons: promotionReasons(item)
    }))
    .sort((left, right) =>
      Number(right.observation_count) -
      Number(left.observation_count)
    );

  const filteredItems = itemRows
    .filter((item) => !isPromotedItem(item))
    .sort((left, right) =>
      Number(right.observation_count) -
      Number(left.observation_count)
    );

  const avatars = avatarById(world, avatarIndex);
  const owners = buildOwnerRows(evidence, avatars);
  const resolvedAvatars = owners
    .filter((owner) => text(owner.avatar_id))
    .map((owner) => ({
      avatar_id: owner.avatar_id,
      owner_id: owner.owner_id,
      avatar_name: owner.avatar_name,
      avatar_portrait_url: owner.avatar_portrait_url,
      avatar_portrait_thumb_url:
        owner.avatar_portrait_thumb_url,
      avatar_portrait_snapshot_url:
        owner.avatar_portrait_snapshot_url,
      avatar_portrait_source:
        owner.avatar_portrait_source,
      confidence: owner.confidence,
      identity_reason: owner.identity_reason
    }));

  const imageUrls = [
    space.snapshot_url,
    space.thumb_url,
    ...(Array.isArray(space.image_urls) ? space.image_urls : [])
  ].map(text).filter(Boolean);

  const images = [...new Set(imageUrls)]
    .map((url) => ({
      url,
      kind: 'space-image'
    }));

  return {
    ok: true,
    contract: 'smallverse-beacon-space-profile/v2',
    generated_at: new Date().toISOString(),
    profile: {
      space: {
        ...clone(space),
        space_id: requestedSpaceId,
        display_name:
          text(space.display_name ?? space.space_name ?? space.name) ||
          requestedSpaceId
      },
      useful_items: usefulItems,
      owners,
      avatars: resolvedAvatars,
      evidence: evidence.slice(0, 300),
      images,
      filtered_noise: {
        count: filteredItems.length,
        examples: filteredItems.slice(0, 40).map((item) => ({
          source_xml: item.source_xml,
          name: item.name,
          observation_count: item.observation_count,
          reason: 'not rare/legendary/promoted'
        }))
      },
      technical: {
        space_id: requestedSpaceId,
        source_db: 'preserved Observatory export',
        source_world: 'beacon-world-index.json',
        raw_item_signals: itemRows.length,
        useful_item_signals: usefulItems.length,
        promotion_rule: 'smallverse-public-api.isPromotedItem',
        note:
          'Only rare, legendary, price-backed, or otherwise promoted rows are returned as useful_items.'
      }
    }
  };
}

export function extractSpinPrices(value: unknown): Array<{
  spins: number;
  price: number;
}> {
  const found: Array<{ spins: number; price: number }> = [];
  const seen = new Set<string>();

  const visit = (current: unknown) => {
    if (Array.isArray(current)) {
      for (const item of current) visit(item);
      return;
    }

    const record = asRecord(current);
    if (!record) return;

    if (
      Object.hasOwn(record, 'spins') &&
      Object.hasOwn(record, 'price')
    ) {
      const spins = finiteNumber(record.spins);
      const price = finiteNumber(record.price);

      if (spins !== null && price !== null) {
        const key = `${spins}:${price}`;
        if (!seen.has(key)) {
          seen.add(key);
          found.push({ spins, price });
        }
      }
    }

    for (const nested of Object.values(record)) {
      visit(nested);
    }
  };

  visit(value);

  return found.sort((left, right) => left.spins - right.spins);
}

export function record(value: unknown): AnyRecord | null {
  return asRecord(value);
}
