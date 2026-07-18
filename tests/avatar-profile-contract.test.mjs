import assert from 'node:assert/strict';
import test from 'node:test';

import { Value } from '@sinclair/typebox/value';
import {
  AvatarProfileReadModelV4Schema
} from '../packages/contracts/dist/index.js';

test('avatar profile v4 accepts explicit unknown primary and relationship buckets', () => {
  const profile = {
    ok: true,
    contract: 'smallverse-beacon-avatar-profile/v4',
    source: 'preserved-read-model',
    avatar: {
      avatar_id: 'avatar-one',
      owner_id: 'owner-one',
      owner_status: 'observed',
      sibling_avatar_ids: []
    },
    accounts: [{
      ownerId: 'owner-one',
      displayName: null,
      avatarIds: ['avatar-one'],
      selectedAvatarId: null,
      primaryAvatar: null,
      primaryAvatarStatus: 'unknown',
      firstObservedAt: null,
      lastObservedAt: null,
      evidenceCount: 1
    }],
    siblingAvatars: [],
    relationships: {
      equipped: [],
      placed: [],
      listedForSale: [],
      unknown: [{
        relationship: 'unknown',
        itemDefinitionSourceXml: 'items/base/example.xml',
        itemInstanceUid: 'uid-one',
        name: 'Example',
        rarity: null,
        slot: null,
        spaceId: 'space-one',
        sellerOwnerId: null,
        listingId: null,
        price: { amount: 50 },
        observedAt: '2026-07-10T00:00:00Z',
        evidenceType: 'item.observed',
        itemConfigSha256: null,
        avatarConfigSnapshotId: null
      }]
    },
    configSnapshots: [],
    owners: [],
    spaces: [],
    items: [],
    evidence: [],
    stats: {},
    render_packet: {}
  };

  assert.equal(Value.Check(AvatarProfileReadModelV4Schema, profile), true);
});

test('avatar profile v4 rejects an asserted primary without selection evidence metadata', () => {
  const incompletePrimary = {
    ownerId: 'owner-one',
    displayName: null,
    avatarIds: ['avatar-one'],
    selectedAvatarId: null,
    primaryAvatar: { avatarId: 'avatar-one' },
    primaryAvatarStatus: 'known',
    firstObservedAt: null,
    lastObservedAt: null,
    evidenceCount: 1
  };

  const accountsSchema = AvatarProfileReadModelV4Schema.properties.accounts;
  assert.equal(Value.Check(accountsSchema, [incompletePrimary]), false);
});
