import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Find Friends and getUsersAvatars build a source-correct owner graph', () => {
  const script = String.raw`
import hashlib
import sqlite3
import struct
import sys
sys.path.insert(0, 'tools')

from beacon_owner_avatar_identity_graph import (
    build_read_model,
    ensure_schema,
    ingest_friend_manifest,
    ingest_owner_avatar_manifest,
)
from smallverse_amf import decode_remoting_envelope
from smallverse_friend_search_protocol import (
    avatar_rows,
    build_owner_avatars_request,
    make_owner_avatars_auth_context,
    owner_avatar_rows,
)

def utf(value):
    raw = value.encode()
    return len(raw).to_bytes(2, 'big') + raw

def string(value):
    return b'\x02' + utf(value)

def boolean(value):
    return b'\x01' + (b'\x01' if value else b'\x00')

def number(value):
    return b'\x00' + struct.pack('>d', float(value))

def typed(class_name, values):
    output = bytearray(b'\x10' + utf(class_name))
    for key, value in values.items():
        output += utf(key) + value
    output += b'\x00\x00\x09'
    return bytes(output)

def response(rows):
    result = typed('com.smallworlds.service.result.ListResult', {
        'success': boolean(True),
        'list': b'\x0a' + len(rows).to_bytes(4, 'big') + b''.join(rows),
    })
    return (
        b'\x00\x00\x00\x00\x00\x01' +
        utf('/1/onResult') + utf('') + len(result).to_bytes(4, 'big') + result
    )

owner = 'aaaaaaaaaaaaaaaaaaaaaaaa'
avatars = [
    '111111111111111111111111',
    '222222222222222222222222',
    '333333333333333333333333',
]
thumb = (
    'https://content.smallverse.app/uploads/avatars/' +
    avatars[0] + 'opaque-current-thumb_thumb.png'
)
person = typed('com.smallworlds.service.person.data.Person', {
    'user': typed('com.smallworlds.service.person.data.identity.UserIdentity', {
        'id': string(owner),
        'firstName': string('Account'),
        'lastName': string('Owner'),
    }),
    'avatar': typed('com.smallworlds.service.avatar.data.AvatarIdentity', {
        'id': string(avatars[0]),
        'firstName': string('Visible'),
        'lastName': string('Avatar'),
        'thumbUrl': string(thumb),
    }),
})
friend_rows = avatar_rows(response([person]), query='ab')
assert len(friend_rows) == 1
assert friend_rows[0]['owner_id'] == owner
assert friend_rows[0]['avatar_id'] == avatars[0]
assert friend_rows[0]['display_name'] == 'Visible Avatar'
assert friend_rows[0]['thumb_url'] == thumb
assert friend_rows[0]['default_state'] is None

timer = 1586786
context = make_owner_avatars_auth_context(owner, timer)
expected = hashlib.md5(('caXBGo4b' + str(timer) + owner).encode()).hexdigest() + ',' + str(timer)
assert context == expected
message = decode_remoting_envelope(
    build_owner_avatars_request(owner, call_id=19, timer_ms=timer)
)[0]
assert message.target == 'avatarcore.getUsersAvatars'
assert message.response == '/19'
assert message.body == [context, owner]

user_avatar_payload = response([
    typed('com.smallworlds.service.avatar.data.UserAvatar', {
        'id': string(avatars[0]), 'type': number(1),
        'fName': string('Visible'), 'lName': string('Avatar'),
        'isDefault': boolean(False), 'active': boolean(True),
        'thumbUrl': string(thumb),
        'avatarConfig': string('<avatar gender="male"><body/></avatar>'),
    }),
    typed('com.smallworlds.service.avatar.data.UserAvatar', {
        'id': string(avatars[1]), 'type': number(1),
        'fName': string('Main'), 'lName': string('Avatar'),
        'isDefault': boolean(True), 'active': boolean(True),
    }),
    typed('com.smallworlds.service.avatar.data.UserAvatar', {
        'id': string(avatars[2]), 'type': number(1),
        'fName': string('Third'), 'lName': string('Avatar'),
        'isDefault': boolean(False), 'active': boolean(False),
    }),
    typed('com.smallworlds.service.avatar.data.UserAvatar', {
        'id': string('444444444444444444444444'), 'type': number(2),
        'fName': string('Not'), 'lName': string('A User Avatar'),
    }),
])
account_rows = owner_avatar_rows(user_avatar_payload, owner)
assert [row['avatar_id'] for row in account_rows] == avatars
assert account_rows[1]['display_name'] == 'Main Avatar'
assert account_rows[1]['is_default'] is True
assert account_rows[0]['selected_state'] is None
assert account_rows[0]['config_xml'] == '<avatar gender="male"><body/></avatar>'
assert account_rows[0]['config_sha256'] == hashlib.sha256(account_rows[0]['config_xml'].encode()).hexdigest()
assert account_rows[1]['config_xml'] == ''

connection = sqlite3.connect(':memory:')
connection.row_factory = sqlite3.Row
ensure_schema(connection)
friend_manifest = {
    'contract': 'beacon-crawler-friend-search/v3',
    'generated_at': '2026-07-15T12:00:00+00:00',
    'query': 'ab',
    'avatars': friend_rows,
}
first = ingest_friend_manifest(connection, friend_manifest, 'friend-fixture.json')
assert first['relationships_added'] == 1
assert ingest_friend_manifest(
    connection, friend_manifest, 'friend-fixture.json'
)['relationships_added'] == 0

before = build_read_model(connection)
account = before['by_owner_id'][owner]
assert account['primary_avatar'] is None
assert account['selected_avatar_id'] is None
assert account['display_avatar_id'] == avatars[0]
assert account['display_avatar_selection']['proves_primary'] is False

owner_manifest = {
    'contract': 'beacon-owner-avatar-list/v1',
    'generated_at': '2026-07-15T12:05:00+00:00',
    'owner_accounts': [{
        'owner_id': owner,
        'source_method': 'avatarcore.getUsersAvatars',
        'avatars': account_rows,
    }],
}
result = ingest_owner_avatar_manifest(connection, owner_manifest, 'owner-fixture.json')
assert result['explicit_defaults'] == 1
index = {'by_avatar_id': {
    avatars[0]: {'thumb_url': '/avatar-thumbnails/' + avatars[0] + '/thumb.png'}
}}
after = build_read_model(connection, index)
account = after['by_owner_id'][owner]
assert account['avatar_ids'] == [avatars[1], avatars[0], avatars[2]]
assert account['overflow_avatar_ids'] == []
assert account['selected_avatar_id'] is None
assert account['primary_avatar'] == {
    'avatar_id': avatars[1],
    'basis': 'default-endpoint',
    'evidence_source': 'avatarcore.getUsersAvatars:isDefault',
    'confidence': 100,
    'selected_at': '2026-07-15T12:05:00+00:00',
}
assert after['by_avatar_id'][avatars[0]]['name'] == 'Visible Avatar'
assets = after['by_avatar_id'][avatars[0]]['portrait_assets']
assert assets['thumb_source_url'] == thumb
assert assets['thumb_local_url'] == '/avatar-thumbnails/' + avatars[0] + '/thumb.png'
`;

  const result = spawnSync('python3', ['-c', script], {
    cwd: root,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('identity graph tools compile without third-party modules', () => {
  const result = spawnSync('python3', [
    '-m', 'py_compile',
    'tools/smallverse_friend_search_protocol.py',
    'tools/search_avatar_portraits_via_cdp.py',
    'tools/beacon_owner_avatar_identity_graph.py'
  ], {
    cwd: root,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('legacy owner cards never promote the first observed avatar to primary', () => {
  const script = String.raw`
import sys
sys.path.insert(0, 'tools')
from beacon_owner_identity_profile import project_identity_candidates

projection = project_identity_candidates([
    {
        'avatar_id': '111111111111111111111111',
        'avatar_name': 'Observed Avatar',
        'confidence': 95,
        'avatar_portrait_thumb_url': '/avatar-thumbnails/111/thumb.png',
    },
    {
        'avatar_id': '222222222222222222222222',
        'avatar_name': 'Another Avatar',
        'confidence': 80,
    },
])
assert projection['primary_avatar_id'] == ''
assert projection['primary_avatar_name'] == ''
assert projection['primary_avatar_status'] == 'unknown'
assert projection['selected_avatar_id'] is None
assert projection['display_avatar_id'] == '111111111111111111111111'
assert projection['display_avatar_selection']['proves_primary'] is False
`;

  const result = spawnSync('python3', ['-c', script], {
    cwd: root,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
