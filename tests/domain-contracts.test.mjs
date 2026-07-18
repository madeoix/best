import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BEACON_DOMAIN_CONTRACT_VERSION,
  CAPTURE_GENERATION_CONTRACT_VERSION,
  isPublicCatalogEligible,
  evaluateAvatarPublication,
  evaluateItemPublication,
  evaluateSpacePublication,
  validateAvatar,
  validateAvatarConfigSnapshot,
  validateItemDefinition,
  validateItemInstance,
  validateOwnerAccount,
  validateOwnerAvatarRelationship,
  validatePublicCatalogItemDefinition,
  validateSpace,
  validateTemporalObservation,
  validateCaptureGeneration
} from '../packages/contracts/dist/index.js';

const firstObservedAt = '2026-07-15T10:00:00Z';
const lastObservedAt = '2026-07-15T11:00:00Z';
const avatarId = 'avatar-01';
const ownerId = 'owner-01';
const snapshotId = 'snapshot-01';
const commonSourceXml = 'avatars/tops/plain_tshirt.xml';
const rareSourceXml = 'items/shoes/rock_high_tops.xml';

const provenance = {
  sourceKey: 'crawler-02-rtmp',
  captureId: 'capture-01',
  crawlerId: 'crawler-02',
  evidenceSha256: 'a'.repeat(64)
};

const observationBase = {
  observationId: 'observation-01',
  observedAt: lastObservedAt,
  validFrom: lastObservedAt,
  validTo: null,
  confidence: 100,
  provenance
};

test('domain contract is explicitly versioned', () => {
  assert.equal(BEACON_DOMAIN_CONTRACT_VERSION, '1.0.0');
  assert.equal(CAPTURE_GENERATION_CONTRACT_VERSION, '1.0.0');
});

test('capture generations prove work with immutable request/response receipts', () => {
  const generation = validateCaptureGeneration({
    generationId: 'crawler-02:2026-07-16T12:00:00Z',
    crawlerId: 'crawler-02',
    outcome: 'succeeded',
    startedAt: '2026-07-16T12:00:00Z',
    completedAt: '2026-07-16T12:02:00Z',
    popularRequestMethod: 'catalog_entry.getSpacesForCategory',
    popularRequestSha256: '1'.repeat(64),
    popularResponseSha256: '2'.repeat(64),
    evidenceManifestSha256: '3'.repeat(64),
    counts: {
      popularRows: 68,
      selectedSpaces: 2,
      joinedSpaces: 2,
      avatarsObserved: 7,
      avatarConfigsCaptured: 6,
      itemUidsObserved: 125,
      itemConfigsCaptured: 31,
      protocolEvents: 950,
      assetsVerified: 12
    },
    failureCode: null,
    failureMessage: null
  });
  assert.equal(generation.ok, true);

  const falseSuccess = validateCaptureGeneration({
    ...generation.value,
    popularRequestMethod: null,
    popularRequestSha256: null,
    popularResponseSha256: null,
    counts: { ...generation.value.counts, popularRows: 0 }
  });
  assert.equal(falseSuccess.ok, false);
});

test('observation frequency cannot become primary-avatar authority', () => {
  const result = validateOwnerAccount({
    ownerId,
    displayName: null,
    avatarIds: [avatarId],
    selectedAvatarId: null,
    primaryAvatar: {
      avatarId,
      basis: 'observation-frequency',
      confidence: 75,
      selectedAt: lastObservedAt
    },
    firstObservedAt,
    lastObservedAt
  });
  assert.equal(result.ok, false);
});

test('owner accounts retain up to three avatars and selected/primary identity', () => {
  const valid = validateOwnerAccount({
    ownerId,
    displayName: null,
    avatarIds: [avatarId, 'avatar-02', 'avatar-03'],
    selectedAvatarId: avatarId,
    primaryAvatar: {
      avatarId,
      basis: 'selected-endpoint',
      confidence: 100,
      selectedAt: lastObservedAt
    },
    firstObservedAt,
    lastObservedAt
  });

  assert.equal(valid.ok, true);

  const missingMembership = validateOwnerAccount({
    ownerId,
    displayName: null,
    avatarIds: [avatarId],
    selectedAvatarId: 'different-avatar',
    primaryAvatar: null,
    firstObservedAt,
    lastObservedAt
  });
  assert.equal(missingMembership.ok, false);
  assert.equal(missingMembership.issues[0].path, '/selectedAvatarId');

  const fourAvatars = validateOwnerAccount({
    ownerId,
    displayName: null,
    avatarIds: ['a', 'b', 'c', 'd'],
    selectedAvatarId: null,
    primaryAvatar: null,
    firstObservedAt,
    lastObservedAt
  });
  assert.equal(fourAvatars.ok, false);
});

test('avatar IDs are never accepted as unresolved display names', () => {
  const unresolved = validateAvatar({
    avatarId,
    ownerId,
    name: null,
    nameStatus: 'unresolved',
    thumbnailAssetId: null,
    firstObservedAt,
    lastObservedAt
  });
  assert.equal(unresolved.ok, true);

  const fakeName = validateAvatar({
    avatarId,
    ownerId,
    name: avatarId,
    nameStatus: 'unresolved',
    thumbnailAssetId: null,
    firstObservedAt,
    lastObservedAt
  });
  assert.equal(fakeName.ok, false);
  assert.equal(fakeName.issues[0].path, '/name');
});

test('config snapshots may include common outfit pieces without catalog promotion', () => {
  const snapshot = validateAvatarConfigSnapshot({
    snapshotId,
    avatarId,
    capturedAt: lastObservedAt,
    configSha256: 'b'.repeat(64),
    sourceCaptureId: 'capture-01',
    rawConfig: { gender: 'female' },
    equippedItems: [{
      slot: 'top',
      itemDefinitionSourceXml: commonSourceXml,
      itemInstanceUid: null,
      variantKey: 'green'
    }]
  });
  assert.equal(snapshot.ok, true);

  const common = validateItemDefinition({
    sourceXml: commonSourceXml,
    displayName: 'Plain T-Shirt',
    category: 'top',
    xmlRarity: 'common',
    iconAssetId: null
  });
  assert.equal(common.ok, true);
  assert.equal(isPublicCatalogEligible(common.value), false);

  const rare = validateItemDefinition({
    sourceXml: rareSourceXml,
    displayName: 'Rock High-Top Sneakers',
    category: 'shoes',
    xmlRarity: 'rare',
    iconAssetId: 'asset-rock-high-tops'
  });
  assert.equal(rare.ok, true);
  assert.equal(isPublicCatalogEligible(rare.value), true);
  assert.equal(validatePublicCatalogItemDefinition(rare.value).ok, true);
  assert.equal(validatePublicCatalogItemDefinition(common.value).ok, false);
});

test('public eligibility explains missing enrichment instead of publishing blanks', () => {
  const avatar = validateAvatar({
    avatarId,
    ownerId,
    name: null,
    nameStatus: 'unresolved',
    thumbnailAssetId: null,
    firstObservedAt,
    lastObservedAt
  });
  assert.equal(avatar.ok, true);
  assert.deepEqual(evaluateAvatarPublication(avatar.value).reasons, [
    'AVATAR_NAME_UNRESOLVED',
    'AVATAR_PORTRAIT_MISSING'
  ]);

  const item = validateItemDefinition({
    sourceXml: rareSourceXml,
    displayName: 'Rock High-Top Sneakers',
    category: 'shoes',
    xmlRarity: 'rare',
    iconAssetId: null
  });
  assert.equal(item.ok, true);
  assert.deepEqual(evaluateItemPublication(item.value).reasons, [
    'ITEM_ICON_MISSING'
  ]);

  const space = validateSpace({
    spaceId: 'space-01', ownerId: null, displayName: null,
    snapshotAssetId: null, firstObservedAt, lastObservedAt
  });
  assert.equal(space.ok, true);
  assert.deepEqual(evaluateSpacePublication(space.value).reasons, [
    'SPACE_NAME_UNRESOLVED',
    'SPACE_SNAPSHOT_MISSING'
  ]);
});

test('owner/avatar joins require an exact evidence kind', () => {
  const exact = validateOwnerAvatarRelationship({
    ownerId,
    avatarId,
    relationship: 'account-avatar',
    evidenceKind: 'get-users-avatars',
    observedAt: lastObservedAt,
    provenance
  });
  assert.equal(exact.ok, true);

  const guessed = validateOwnerAvatarRelationship({
    ...exact.value,
    evidenceKind: 'co-presence'
  });
  assert.equal(guessed.ok, false);
});

test('catalog eligibility cannot be injected independently of XML rarity', () => {
  const result = validateItemDefinition({
    sourceXml: commonSourceXml,
    displayName: 'Plain T-Shirt',
    category: 'top',
    xmlRarity: 'common',
    iconAssetId: null,
    publicCatalogEligible: true
  });

  assert.equal(result.ok, false);
});

test('item instances and spaces carry identity, not timeless ownership', () => {
  const instance = validateItemInstance({
    uid: 'uid-01',
    itemDefinitionSourceXml: rareSourceXml,
    firstObservedAt,
    lastObservedAt
  });
  assert.equal(instance.ok, true);

  const timelessOwner = validateItemInstance({
    uid: 'uid-01',
    itemDefinitionSourceXml: rareSourceXml,
    ownerId,
    firstObservedAt,
    lastObservedAt
  });
  assert.equal(timelessOwner.ok, false);

  const space = validateSpace({
    spaceId: 'space-01',
    ownerId,
    displayName: 'New World Flea Market',
    snapshotAssetId: null,
    firstObservedAt,
    lastObservedAt
  });
  assert.equal(space.ok, true);
});

test('equipped, placed, and listed-for-sale are distinct observations', () => {
  const equipped = validateTemporalObservation({
    ...observationBase,
    relationship: 'equipped',
    avatarId,
    itemDefinitionSourceXml: commonSourceXml,
    itemInstanceUid: null,
    avatarConfigSnapshotId: snapshotId,
    slot: 'top'
  });
  assert.equal(equipped.ok, true);
  assert.equal(equipped.value.relationship, 'equipped');

  const placed = validateTemporalObservation({
    ...observationBase,
    observationId: 'observation-02',
    relationship: 'placed',
    spaceId: 'space-01',
    itemDefinitionSourceXml: rareSourceXml,
    itemInstanceUid: 'uid-01'
  });
  assert.equal(placed.ok, true);
  assert.equal(placed.value.relationship, 'placed');

  const listed = validateTemporalObservation({
    ...observationBase,
    observationId: 'observation-03',
    relationship: 'listed-for-sale',
    spaceId: 'space-01',
    sellerOwnerId: ownerId,
    itemDefinitionSourceXml: rareSourceXml,
    itemInstanceUid: 'uid-01',
    listingId: 'listing-01',
    price: { amountMinorUnits: '1250', currency: 'gold' }
  });
  assert.equal(listed.ok, true);
  assert.equal(listed.value.relationship, 'listed-for-sale');
});

test('a wearing event remains valid without inventing a config-snapshot or slot join', () => {
  const wearingOnly = validateTemporalObservation({
    ...observationBase,
    observationId: 'observation-wearing-only',
    relationship: 'equipped',
    avatarId,
    itemDefinitionSourceXml: commonSourceXml,
    itemInstanceUid: 'uid-wearing-only',
    avatarConfigSnapshotId: null,
    slot: null
  });

  assert.equal(wearingOnly.ok, true);
  assert.equal(wearingOnly.value.avatarConfigSnapshotId, null);
  assert.equal(wearingOnly.value.slot, null);
});

test('temporal observations reject backwards or zero-length intervals', () => {
  const result = validateTemporalObservation({
    ...observationBase,
    relationship: 'placed',
    validFrom: '2026-07-15T11:00:00Z',
    validTo: '2026-07-15T10:00:00Z',
    spaceId: 'space-01',
    itemDefinitionSourceXml: rareSourceXml,
    itemInstanceUid: 'uid-01'
  });

  assert.equal(result.ok, false);
  assert.equal(result.issues[0].path, '/validTo');
});

test('semantic time validation rejects impossible calendar dates', () => {
  const result = validateSpace({
    spaceId: 'space-01',
    ownerId: null,
    displayName: null,
    snapshotAssetId: null,
    firstObservedAt: '2026-02-31T10:00:00Z',
    lastObservedAt: '2026-03-01T10:00:00Z'
  });

  assert.equal(result.ok, false);
  assert.equal(result.issues[0].path, '/firstObservedAt');
});
