const HEX_OBJECT_ID = /^[0-9a-f]{24}$/i;

const EXPLICIT_RELATIONSHIPS = new Map([
  ['equipped', 'equipped'],
  ['avatar.equipped', 'equipped'],
  ['avatar-equipped', 'equipped'],
  ['avatar_wearing_uid', 'equipped'],
  ['avatar.wearing', 'equipped'],
  ['placed', 'placed'],
  ['item.placed', 'placed'],
  ['space.item.placed', 'placed'],
  ['space_item_placed', 'placed'],
  ['listed-for-sale', 'listed-for-sale'],
  ['item.listed-for-sale', 'listed-for-sale'],
  ['item.listed_for_sale', 'listed-for-sale']
]);

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function rows(value) {
  return Array.isArray(value) ? value.map(record) : [];
}

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function firstText(...values) {
  return values.map(text).find(Boolean) || '';
}

function sourceXml(value) {
  const row = record(value);
  return firstText(row.source_xml, row.item_definition_source_xml, row.itemDefinitionSourceXml, row.xml, row.source);
}

function itemUid(value) {
  const row = record(value);
  return firstText(row.item_instance_uid, row.itemInstanceUid, row.uid);
}

function observedAt(value) {
  const row = record(value);
  return firstText(row.observed_at, row.observedAt, row.seen_at, row.timestamp, row.at, row.updated_at);
}

function explicitRelationship(value) {
  const row = record(value);
  const relationship = text(row.relationship).toLocaleLowerCase();
  if (EXPLICIT_RELATIONSHIPS.has(relationship)) {
    return EXPLICIT_RELATIONSHIPS.get(relationship);
  }

  const eventType = text(row.event_type).toLocaleLowerCase();
  return EXPLICIT_RELATIONSHIPS.get(eventType) || '';
}

function isResolvedName(value, avatarId) {
  const candidate = text(value);
  return Boolean(
    candidate &&
    candidate !== text(avatarId) &&
    !HEX_OBJECT_ID.test(candidate)
  );
}

function normalizedItem(definition, evidence = null) {
  const item = record(definition);
  const event = record(evidence);
  const source = sourceXml(event) || sourceXml(item);

  return {
    name: firstText(
      item.item_name,
      item.display_name,
      item.name,
      event.item_name,
      event.itemDisplayName,
      event.display_name,
      event.name,
      source ? source.split('/').at(-1)?.replace(/(?:_item)?\.xml$/i, '').replaceAll('_', ' ') : '',
      'Unknown item'
    ),
    sourceXml: source,
    uid: itemUid(event),
    rarity: firstText(item.rarity, item.rarity_label),
    slot: firstText(event.slot, event.equipment_slot),
    spaceId: firstText(event.space_id, event.spaceId, event.world_id),
    observedAt: observedAt(event),
    evidenceCount: Number(item.evidence_count || 0) || 0
  };
}

function relationshipRows(profileItems, evidence) {
  const definitions = new Map(
    rows(profileItems)
      .map((item) => [sourceXml(item), item])
      .filter(([source]) => Boolean(source))
  );
  const grouped = {
    equipped: [],
    placed: [],
    listedForSale: []
  };
  const seen = new Set();
  const unclassifiedSources = new Set();

  for (const event of rows(evidence)) {
    const source = sourceXml(event);
    const relationship = explicitRelationship(event);

    if (!relationship) {
      if (source) unclassifiedSources.add(source);
      continue;
    }

    const item = normalizedItem(definitions.get(source), event);
    const key = [
      relationship,
      item.sourceXml,
      item.uid,
      item.slot,
      item.spaceId
    ].join(':');
    if (seen.has(key)) continue;
    seen.add(key);

    if (relationship === 'equipped') grouped.equipped.push(item);
    if (relationship === 'placed') grouped.placed.push(item);
    if (relationship === 'listed-for-sale') grouped.listedForSale.push(item);
  }

  const classifiedSources = new Set(
    [...grouped.equipped, ...grouped.placed, ...grouped.listedForSale]
      .map((item) => item.sourceXml)
      .filter(Boolean)
  );

  const unclassified = rows(profileItems)
    .filter((item) => {
      const source = sourceXml(item);
      return source && (unclassifiedSources.has(source) || !classifiedSources.has(source));
    })
    .map((item) => normalizedItem(item));

  return { ...grouped, unclassified };
}

function ownerAndSiblingRows(owners, currentAvatarId) {
  const accounts = [];
  const siblingAvatars = [];
  const seenAccounts = new Set();
  const seenSiblings = new Set();

  for (const value of rows(owners)) {
    const owner = record(value);
    const ownerId = firstText(owner.owner_id, owner.owner, owner.user_id);
    if (!ownerId || seenAccounts.has(ownerId)) continue;
    seenAccounts.add(ownerId);

    const avatarIds = Array.isArray(owner.avatar_ids)
      ? [...new Set(owner.avatar_ids.map(text).filter(Boolean))]
      : [];
    const avatarNames = record(owner.avatar_names);

    accounts.push({
      ownerId,
      evidenceCount: Number(owner.evidence_count || 0) || 0,
      firstObservedAt: firstText(owner.first_seen, owner.first_observed_at),
      lastObservedAt: firstText(owner.latest_seen, owner.last_observed_at),
      avatarCount: avatarIds.length
    });

    for (const siblingId of avatarIds) {
      if (!siblingId || siblingId === currentAvatarId) continue;
      const key = `${ownerId}:${siblingId}`;
      if (seenSiblings.has(key)) continue;
      seenSiblings.add(key);

      const candidateName = text(avatarNames[siblingId]);
      siblingAvatars.push({
        avatarId: siblingId,
        ownerId,
        name: isResolvedName(candidateName, siblingId)
          ? candidateName
          : 'Unresolved avatar name'
      });
    }
  }

  return { accounts, siblingAvatars };
}

function normalizedSpaces(spaces) {
  return rows(spaces)
    .map((space) => {
      const image = firstText(space.snapshot_url, space.thumb_url, space.image_url);
      return {
        spaceId: firstText(space.space_id, space.spaceId, space.world_id),
        name: firstText(space.space_name, space.display_name, space.displayName, space.name),
        ...(image ? { image } : {}),
        observationCount: Number(space.observation_count || 0) || 0,
        lastObservedAt: firstText(space.latest_seen, space.last_observed_at)
      };
    })
    // This pure view model preserves a factual room observation even when an
    // old fixture has no preview. Public route admission is stricter and will
    // never publish that incomplete row; dropping it here would incorrectly
    // turn "seen in a room" into "never seen".
    .filter((space) => space.spaceId && space.name);
}

export function buildAvatarProfileView(profile, requestedAvatarId = '') {
  const response = record(profile);
  const avatar = record(response.avatar);
  const avatarId = firstText(avatar.avatar_id, avatar.avatarId, requestedAvatarId);
  const candidateName = firstText(avatar.avatar_name, avatar.display_name, avatar.name);
  const nameResolved = isResolvedName(candidateName, avatarId);
  const canonicalAccount = record(response.account);
  const legacyOwners = rows(response.owners);
  const { accounts, siblingAvatars } = ownerAndSiblingRows(legacyOwners, avatarId);
  if (canonicalAccount.ownerId) {
    accounts.push({
      ownerId: canonicalAccount.ownerId,
      evidenceCount: 0,
      firstObservedAt: firstText(canonicalAccount.firstObservedAt),
      lastObservedAt: firstText(canonicalAccount.lastObservedAt),
      avatarCount: rows(response.siblings).length + 1
    });
  }
  for (const sibling of rows(response.siblings)) {
    const siblingId = firstText(sibling.avatarId);
    const siblingName = firstText(sibling.name);
    if (!siblingId || siblingId === avatarId) continue;
    siblingAvatars.push({
      avatarId: siblingId,
      ownerId: firstText(canonicalAccount.ownerId),
      name: isResolvedName(siblingName, siblingId) ? siblingName : 'Unresolved avatar name'
    });
  }
  const canonicalRelationships = record(response.relationships);
  const canonicalEvidence = [
    ...rows(canonicalRelationships.equipped).map((row) => ({ ...row, relationship: 'equipped' })),
    ...rows(canonicalRelationships.placed).map((row) => ({ ...row, relationship: 'placed' })),
    ...rows(canonicalRelationships.listedForSale).map((row) => ({ ...row, relationship: 'listed-for-sale' }))
  ];
  const relationshipEvidence = rows(response.evidence).length
    ? rows(response.evidence)
    : canonicalEvidence.length
      ? canonicalEvidence
      : rows(response.relationships);
  const canonicalItems = relationshipEvidence.map((row) => ({
    source_xml: sourceXml(row),
    display_name: firstText(row.itemDisplayName, row.display_name, row.name),
    rarity: firstText(row.xmlRarity, row.rarity),
    icon_asset_id: firstText(row.iconAssetId, row.icon_asset_id)
  }));
  const relationships = relationshipRows(
    rows(response.items).length ? response.items : canonicalItems,
    relationshipEvidence
  );
  const spaces = normalizedSpaces(rows(response.spaces).map((space) => ({
    ...space,
    space_id: firstText(space.space_id, space.spaceId),
    space_name: firstText(space.space_name, space.displayName),
    snapshot_url: firstText(space.snapshot_url, space.snapshotStorageKey),
    latest_seen: firstText(space.latest_seen, space.observedAt)
  })));

  return {
    avatarId,
    name: nameResolved ? candidateName : 'Unresolved avatar name',
    nameStatus: nameResolved ? 'resolved' : 'unresolved',
    bodyType: firstText(avatar.gender, avatar.body_type),
    accounts,
    siblingAvatars: siblingAvatars.filter((sibling) => sibling.name !== 'Unresolved avatar name'),
    spaces,
    relationships,
    evidenceCount: Number(response.stats?.evidence_count || 0) || rows(response.evidence).length,
    assetCount: Number(response.stats?.asset_count || 0) || 0
  };
}

export function shortBeaconId(value) {
  const id = text(value);
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}
