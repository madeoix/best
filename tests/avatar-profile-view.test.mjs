import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAvatarProfileView,
  shortBeaconId
} from '../src/lib/beacon/avatarProfileView.js';

test('an identifier fallback is not presented as an avatar name', () => {
  const avatarId = '67ce286ab39b3643fcf8a123';
  const view = buildAvatarProfileView({
    avatar: { avatar_id: avatarId, display_name: avatarId }
  }, avatarId);

  assert.equal(view.name, 'Unresolved avatar name');
  assert.equal(view.nameStatus, 'unresolved');
  assert.equal(view.avatarId, avatarId);
});

test('account links and explicitly exposed sibling avatars remain separate', () => {
  const view = buildAvatarProfileView({
    avatar: { avatar_id: 'avatar-1', avatar_name: 'Primary Name' },
    owners: [{
      owner_id: 'owner-1',
      avatar_ids: ['avatar-1', 'avatar-2'],
      avatar_names: { 'avatar-2': 'Second Name' },
      evidence_count: 4
    }]
  });

  assert.deepEqual(view.accounts, [{
    ownerId: 'owner-1',
    evidenceCount: 4,
    firstObservedAt: '',
    lastObservedAt: '',
    avatarCount: 2
  }]);
  assert.deepEqual(view.siblingAvatars, [{
    avatarId: 'avatar-2',
    ownerId: 'owner-1',
    name: 'Second Name'
  }]);
});

test('item evidence is separated only by an explicit relationship', () => {
  const source = 'items/base/example_item.xml';
  const view = buildAvatarProfileView({
    avatar: { avatar_id: 'avatar-1', avatar_name: 'Known Avatar' },
    items: [{ source_xml: source, name: 'Example', evidence_count: 3 }],
    evidence: [
      { relationship: 'equipped', source_xml: source, uid: 'uid-equipped', slot: 'shirt' },
      { event_type: 'item.listed_for_sale', source_xml: source, uid: 'uid-listed' },
      // A room and price are not enough to invent placed/listed semantics.
      { source_xml: source, uid: 'uid-unknown', space_id: 'room-1', ask_price: 50 }
    ]
  });

  assert.deepEqual(view.relationships.equipped.map((item) => item.uid), ['uid-equipped']);
  assert.deepEqual(view.relationships.listedForSale.map((item) => item.uid), ['uid-listed']);
  assert.equal(view.relationships.placed.length, 0);
  assert.deepEqual(view.relationships.unclassified.map((item) => item.sourceXml), [source]);
});

test('space observations are not converted into ownership', () => {
  const view = buildAvatarProfileView({
    avatar: { avatar_id: 'avatar-1', avatar_name: 'Known Avatar' },
    spaces: [{
      space_id: 'space-1',
      space_name: 'Popular Room',
      observation_count: 2
    }]
  });

  assert.equal(view.accounts.length, 0);
  assert.deepEqual(view.spaces, [{
    spaceId: 'space-1',
    name: 'Popular Room',
    observationCount: 2,
    lastObservedAt: ''
  }]);
});

test('canonical relationship groups are retained by the public avatar view', () => {
  const view = buildAvatarProfileView({
    avatar: { avatarId: 'avatar-1', name: 'Known Avatar' },
    relationships: {
      equipped: [{
        relationship: 'equipped',
        itemDefinitionSourceXml: 'items/base/shirt.xml',
        itemDisplayName: 'Observed Shirt',
        itemInstanceUid: 'uid-shirt',
        slot: 'shirt'
      }],
      placed: [{
        relationship: 'placed',
        itemDefinitionSourceXml: 'items/base/chair.xml',
        itemDisplayName: 'Observed Chair',
        itemInstanceUid: 'uid-chair'
      }],
      listedForSale: []
    }
  });

  assert.deepEqual(view.relationships.equipped.map((item) => item.name), ['Observed Shirt']);
  assert.deepEqual(view.relationships.placed.map((item) => item.name), ['Observed Chair']);
});

test('long opaque IDs are shortened only for display', () => {
  assert.equal(shortBeaconId('1234567890abcdefghijkl'), '12345678…ghijkl');
});
