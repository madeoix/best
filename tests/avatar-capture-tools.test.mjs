import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    ...options
  });
}

test('avatar capture Python tools compile without third-party modules', () => {
  const result = run('python3', [
    '-m',
    'py_compile',
    'tools/smallverse_amf.py',
    'tools/capture_avatar_calibration.py',
    'tools/import_avatar_calibration_pack.py',
    'tools/cache_avatar_thumbnails_via_cdp.py',
    'tools/export_avatar_live_manifest.py',
    'tools/smallverse_friend_search_protocol.py',
    'tools/beacon_friend_search_bridge.py',
    'tools/next_smallverse_friend_query.py',
    'tools/beacon_avatar_wearing_sidecar.py',
    'tools/export_live_avatar_configs.py',
    'session/export-beacon-observatory-lite.py',
    'session/smallverse_core_compat.py',
    'session/import_vps_live_capture.py'
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('male avatar capture wrapper is valid shell', () => {
  const result = run('bash', ['-n', 'tools/capture_avatar_calibration.sh']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('dependency-free AMF decoder reads a remoting envelope', () => {
  const script = String.raw`
import sys
sys.path.insert(0, 'tools')
from smallverse_amf import decode_remoting_envelope
payload = bytes.fromhex(
    '000300000001001f636f6e766572736174696f6e2e6765744d79436f6e766572736174696f6e7300032f3138000000050a00000000'
)
messages = decode_remoting_envelope(payload)
assert len(messages) == 1
assert messages[0].target == 'conversation.getMyConversations'
assert messages[0].response == '/18'
assert messages[0].body == []
`;
  const result = run('python3', ['-c', script]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('Find Friends request matches the recovered SWF authentication contract', () => {
  const script = String.raw`
import hashlib
import sys
sys.path.insert(0, 'tools')
from smallverse_amf import decode_remoting_envelope
from smallverse_friend_search_protocol import build_request, make_auth_context
from beacon_friend_search_bridge import (
    FLASH_TIMER_INITIAL,
    flash_like_timer_ms,
    read_timer_state,
    write_timer_state,
)

query = 'ab'
timer = 1586786
context = make_auth_context(query, timer)
expected = hashlib.md5(('caXBGo4b' + str(timer) + query).encode()).hexdigest() + ',' + str(timer)
assert context == expected
messages = decode_remoting_envelope(build_request(query, call_id=42, timer_ms=timer))
assert len(messages) == 1
assert messages[0].target == 'friend.searchForFriends'
assert messages[0].response == '/42'
assert messages[0].body == [context, query, True]
assert 1_000_000 <= flash_like_timer_ms() < 8_000_000
from pathlib import Path
import tempfile
with tempfile.TemporaryDirectory() as directory:
    state = Path(directory) / 'timer.json'
    assert read_timer_state(state) == FLASH_TIMER_INITIAL
    write_timer_state(state, FLASH_TIMER_INITIAL)
    assert read_timer_state(state) == FLASH_TIMER_INITIAL + 1
`;
  const result = run('python3', ['-c', script]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('Find Friends preserves nested avatar URLs and the cache accepts the exact returned URL', () => {
  const script = String.raw`
import sys
sys.path.insert(0, 'tools')
from smallverse_friend_search_protocol import avatar_rows
from cache_avatar_thumbnails_via_cdp import authoritative_variant_url, merge_identity_metadata

def utf(value):
    raw = value.encode()
    return len(raw).to_bytes(2, 'big') + raw

def string(value):
    return b'\x02' + utf(value)

def typed(class_name, values):
    output = bytearray(b'\x10' + utf(class_name))
    for key, value in values.items():
        output += utf(key) + value
    output += b'\x00\x00\x09'
    return bytes(output)

avatar_id = '0123456789abcdef01234567'
thumb = 'https://content.smallverse.app/uploads/avatars/' + avatar_id + 'opaque-server-value_thumb.png'
avatar = typed('com.smallworlds.service.avatar.data.AvatarIdentity', {
    'id': string(avatar_id),
    'firstName': string('Ada'),
    'lastName': string('Byron'),
    'thumbUrl': string(thumb),
})
person = typed('com.smallworlds.service.person.data.Person', {
    'avatarId': b'\x05',
    'avatar': avatar,
})
result = typed('com.smallworlds.service.result.ListResult', {
    'success': b'\x01\x01',
    'list': b'\x0a' + (1).to_bytes(4, 'big') + person,
})
payload = (
    b'\x00\x00\x00\x00\x00\x01' +
    utf('/1/onResult') + utf('') + len(result).to_bytes(4, 'big') + result
)
rows = avatar_rows(payload, query='ab')
assert len(rows) == 1
assert rows[0]['avatar_id'] == avatar_id
assert rows[0]['display_name'] == 'Ada Byron'
assert rows[0]['thumb_url'] == thumb
assert authoritative_variant_url(rows[0], avatar_id, 'thumb') == thumb
record = {'avatar_id': avatar_id}
merge_identity_metadata(record, rows[0])
assert record['display_name'] == 'Ada Byron'
assert record['source_query'] == 'ab'
assert 'friend.searchForFriends' in record['sources']
`;
  const result = run('python3', ['-c', script]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('Find Friends collection cycle starts bounded and advances only when asked', () => {
  const script = String.raw`
import sys
import tempfile
from pathlib import Path
sys.path.insert(0, 'tools')
from next_smallverse_friend_query import query_cycle, read_index, write_index

cycle = query_cycle()
assert cycle[0] == 'ab'
assert len(cycle) == 26 * 26
assert len(set(cycle)) == len(cycle)
with tempfile.TemporaryDirectory() as directory:
    state = Path(directory) / 'state.json'
    assert cycle[read_index(state, len(cycle))] == 'ab'
    write_index(state, 1)
    assert cycle[read_index(state, len(cycle))] == 'aa'
`;
  const result = run('python3', ['-c', script]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
