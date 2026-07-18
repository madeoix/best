import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('fresh Popular tools compile and the VPS collector is valid shell', () => {
  const compile = run('python3', [
    '-m',
    'py_compile',
    'tools/smallverse_popular_protocol.py',
    'tools/fetch_popular_spaces_via_cdp.py',
    'tools/select_fresh_popular_spaces.py',
    'tools/write_capture_generation_receipt.py'
  ]);
  assert.equal(compile.status, 0, compile.stderr || compile.stdout);

  const shell = run('bash', ['-n', 'session/vps_popular_avatar_collector.sh']);
  assert.equal(shell.status, 0, shell.stderr || shell.stdout);
});

test('Popular requests and deterministic AMF fixtures match the recovered SWF contract', () => {
  const script = String.raw`
import hashlib
import struct
import sys
from datetime import datetime, timedelta, timezone
sys.path.insert(0, 'tools')

from smallverse_amf import decode_remoting_envelope
from smallverse_popular_protocol import (
    ARGUMENT_AUTH_KEY,
    PopularProtocolError,
    build_category_tree_request,
    build_manifest,
    build_spaces_request,
    decode_popular_category,
    decode_space_page,
    validate_manifest,
)

CATEGORY = '0c04308f145ead8fce6cf8a73898617b'

def utf(value):
    raw = value.encode('utf-8')
    return len(raw).to_bytes(2, 'big') + raw

def string(value):
    return b'\x02' + utf(value)

def number(value):
    return b'\x00' + struct.pack('>d', float(value))

def boolean(value):
    return b'\x01' + (b'\x01' if value else b'\x00')

def null():
    return b'\x05'

def array(values):
    return b'\x0a' + len(values).to_bytes(4, 'big') + b''.join(values)

def typed(class_name, fields):
    body = bytearray(b'\x10' + utf(class_name))
    for name, value in fields:
        body += utf(name) + value
    body += b'\x00\x00\x09'
    return bytes(body)

def response(call_id, body):
    target = f'/{call_id}/onResult'
    return (
        b'\x00\x00\x00\x00\x00\x01' +
        utf(target) + utf('null') + len(body).to_bytes(4, 'big') + body
    )

tree_request = decode_remoting_envelope(build_category_tree_request(call_id=11))[0]
assert tree_request.target == 'catalog_category.getActiveSpaceCategoryTree'
assert tree_request.response == '/11'
assert tree_request.body == []

timer = 212316
spaces_request = decode_remoting_envelope(
    build_spaces_request(CATEGORY, 0, 12, call_id=12, timer_ms=timer)
)[0]
expected = hashlib.md5(
    (ARGUMENT_AUTH_KEY + str(timer) + CATEGORY + '0' + '12').encode('utf-8')
).hexdigest() + ',' + str(timer)
assert spaces_request.target == 'catalog_entry.getSpacesForCategory'
assert spaces_request.response == '/12'
assert spaces_request.body == [expected, CATEGORY, 0.0, 12.0]

category_row = typed('com.smallworlds.service.catalog.category.data.CatalogCategory', [
    ('id', string(CATEGORY)),
    ('name', string('Popular')),
    ('active', boolean(True)),
    ('isControlledByPopularity', boolean(True)),
    ('children', null()),
])
category_result = typed('com.smallworlds.service.result.ListResult', [
    ('success', boolean(True)),
    ('list', array([category_row])),
])
category_fixture = response(11, category_result)
category = decode_popular_category(category_fixture)
assert category['id'] == CATEGORY
assert category['name'] == 'Popular'

def space(space_id, visitors, name):
    return typed('com.smallworlds.service.result.space.SpacePanelItem', [
        ('id', string(space_id)),
        ('currentVisitors', number(visitors)),
        ('desc', string(name)),
    ])

space_result = typed('com.smallworlds.service.result.RecordSetResult', [
    ('startIndex', number(0)),
    ('success', boolean(True)),
    ('recordSet', array([
        space('11111111111111111111111111111111', 2, 'Second'),
        space('22222222222222222222222222222222', 9, 'First'),
    ])),
    ('totalCount', number(2)),
    ('maxLength', number(2)),
])
page_fixture = response(12, space_result)
page = decode_space_page(page_fixture)
assert [row['currentVisitors'] for row in page['spaces']] == [2, 9]

generated = datetime(2026, 7, 15, 20, 0, tzinfo=timezone.utc)
manifest = build_manifest(category, page['spaces'], generated_at=generated, fresh_for_seconds=300)
assert manifest['contract'] == 'smallverse-popular-spaces/v2'
assert [row['currentVisitors'] for row in manifest['spaces']] == [9, 2]
assert [row['rank'] for row in manifest['spaces']] == [1, 2]
assert validate_manifest(manifest, now=generated + timedelta(seconds=299)) is manifest
try:
    validate_manifest(manifest, now=generated + timedelta(seconds=301))
except PopularProtocolError as exc:
    assert 'stale' in str(exc)
else:
    raise AssertionError('stale Popular manifest was accepted')

broken = dict(manifest)
broken['spaces'] = [dict(manifest['spaces'][0], currentVisitors='nine')]
try:
    validate_manifest(broken, now=generated)
except PopularProtocolError:
    pass
else:
    raise AssertionError('malformed visitor data was accepted')
`;
  const result = run('python3', ['-c', script]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('live fetch orchestration reads the authenticated production Popular route only', () => {
  const script = String.raw`
import json
import sys
sys.path.insert(0, 'tools')
import fetch_popular_spaces_via_cdp as fetcher

class FakeCdp:
    def evaluate(self, expression):
        assert fetcher.POPULAR_API_URL in expression
        assert "credentials: 'include'" in expression
        assert 'gateway.smallverse.app' not in expression
        return json.dumps({'status': 200, 'payload': [{
            'spaceId': 'abcdefabcdefabcdefabcdefabcdefab',
            'desc': 'A live room',
            'snapShot': 'https://content.smallverse.app/uploads/spaces/example_thumb.png',
            'visitors': 4,
        }]})
manifest = fetcher.collect_live_popular(FakeCdp(), fresh_for_seconds=300)
assert manifest['spaces'][0]['space_id'] == 'abcdefabcdefabcdefabcdefabcdefab'
assert manifest['spaces'][0]['currentVisitors'] == 4
assert manifest['spaces'][0]['name'] == 'A live room'
assert manifest['source'] == {
    'transport': 'crawler-browser-cdp-json',
    'method': 'GET',
    'path': '/api/space/popular',
}
assert 'gateway' not in manifest
`;
  const result = run('python3', ['-c', script]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('candidate selection partitions occupied rooms, rotates successes, and rejects stale input', () => {
  const script = String.raw`
import hashlib
import sys
from datetime import datetime, timedelta, timezone
sys.path.insert(0, 'tools')
from select_fresh_popular_spaces import select_candidates
from smallverse_popular_protocol import PopularProtocolError, build_manifest

now = datetime(2026, 7, 15, 20, 0, tzinfo=timezone.utc)
category = {'id': '0c04308f145ead8fce6cf8a73898617b', 'name': 'Popular'}
ids = [f'{number:032x}' for number in range(1, 100)]
left = next(value for value in ids if int(hashlib.sha256(value.encode()).hexdigest(), 16) % 2 == 0)
right = next(value for value in ids if int(hashlib.sha256(value.encode()).hexdigest(), 16) % 2 == 1)
manifest = build_manifest(category, [
    {'space_id': left, 'currentVisitors': 8, 'source_order': 0},
    {'space_id': right, 'currentVisitors': 7, 'source_order': 1},
], generated_at=now, fresh_for_seconds=300)
assert select_candidates(manifest, {}, profile='crawler-01', limit=3, now=now) == [left]
assert select_candidates(manifest, {}, profile='crawler-02', limit=3, now=now) == [right]
legacy_state = {'seen_space_ids': [left], 'updated_at': now.isoformat()}
assert select_candidates(manifest, legacy_state, profile='crawler-01', limit=3, now=now) == []

# Legacy seen-only state gets a fixed migration epoch: no immediate storm, but
# both deterministic shards become eligible again after the configured TTL.
later = now + timedelta(seconds=3601)
refreshed = build_manifest(category, [
    {'space_id': left, 'currentVisitors': 8, 'source_order': 0},
    {'space_id': right, 'currentVisitors': 7, 'source_order': 1},
], generated_at=later, fresh_for_seconds=300)
legacy_both = {'seen_space_ids': [left, right], 'updated_at': now.isoformat()}
assert select_candidates(refreshed, legacy_both, profile='crawler-01', limit=3,
                         now=later, recrawl_after_seconds=3600) == [left]
assert select_candidates(refreshed, legacy_both, profile='crawler-02', limit=3,
                         now=later, recrawl_after_seconds=3600) == [right]

# A timestamped success is not selected continuously inside its TTL, while
# missing-avatar and hard-failure attempts retain independent cooldowns.
recent_success = {'successful_space_visits': {left: later.isoformat()}}
assert select_candidates(refreshed, recent_success, profile='crawler-01', limit=3,
                         now=later, recrawl_after_seconds=3600) == []
almost_later = later + timedelta(seconds=3599)
almost_refreshed = build_manifest(category, [
    {'space_id': left, 'currentVisitors': 8, 'source_order': 0},
    {'space_id': right, 'currentVisitors': 7, 'source_order': 1},
], generated_at=almost_later, fresh_for_seconds=300)
assert select_candidates(almost_refreshed, recent_success, profile='crawler-01', limit=3,
                         now=almost_later, recrawl_after_seconds=3600) == []
missing_state = {'missing_avatar_spaces': {left: later.isoformat()}}
failed_state = {'failed_space_attempts': {left: later.isoformat()}}
assert select_candidates(refreshed, missing_state, profile='crawler-01', limit=3,
                         now=later, missing_cooldown_seconds=3600) == []
assert select_candidates(refreshed, failed_state, profile='crawler-01', limit=3,
                         now=later, error_cooldown_seconds=600) == []
try:
    select_candidates(manifest, {}, profile='crawler-01', limit=3, now=now + timedelta(seconds=301))
except PopularProtocolError:
    pass
else:
    raise AssertionError('selector accepted a stale manifest')
`;
  const result = run('python3', ['-c', script]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('collector has no saved Popular capture fallback', () => {
  const source = readFileSync(path.join(root, 'session/vps_popular_avatar_collector.sh'), 'utf8');
  assert.doesNotMatch(source, /POPULAR_SOURCE_GLOB|popular-source\/popular-spaces\.json/);
  assert.match(source, /fetch_popular_spaces_via_cdp\.py/);
  assert.match(source, /select_fresh_popular_spaces\.py/);
  assert.match(source, /refusing stale Popular fallback/);
  assert.match(source, /successful_space_visits/);
  assert.match(source, /failed_space_attempts/);
  assert.match(source, /SMALLVERSE_POPULAR_RECRAWL_AFTER_SECONDS/);
  assert.match(source, /write_capture_generation_receipt\.py/);
  assert.match(source, /capture-generations/);
});

test('capture generation receipts are append-only and never invent unavailable counts', () => {
  const script = String.raw`
import argparse
import json
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, 'tools')
from smallverse_popular_protocol import build_api_manifest
from write_capture_generation_receipt import append_only_write, build_receipt

root = Path(tempfile.mkdtemp())
manifest_path = root / 'popular.json'
sid = 'abcdefabcdefabcdefabcdefabcdefab'
manifest = build_api_manifest([{
    'space_id': sid,
    'currentVisitors': 2,
    'source_order': 0,
    'name': 'A live room',
    'snapshot_url': 'https://content.smallverse.app/uploads/spaces/room.png',
}], generated_at=datetime(2026, 7, 16, 12, 0, tzinfo=timezone.utc))
manifest_path.write_text(json.dumps(manifest) + '\n')
args = argparse.Namespace(
    generation_id='crawler-02:fixture', crawler_id='crawler-02',
    outcome='succeeded', started_at='2026-07-16T12:00:00Z',
    completed_at='2026-07-16T12:01:00Z', popular_manifest=manifest_path,
    selected_space=[sid], completed_space=[sid], missing_space=[], failed_space=[],
    failure_code=None, failure_message=None,
)
receipt = build_receipt(args)
assert receipt['popularRequestMethod'] == 'GET /api/space/popular'
assert receipt['counts']['popularRows'] == 1
assert receipt['counts']['joinedSpaces'] == 1
assert receipt['counts']['avatarConfigsCaptured'] is None
target = append_only_write(root / 'receipts', receipt)
assert target.is_file()
try:
    append_only_write(root / 'receipts', receipt)
except FileExistsError:
    pass
else:
    raise AssertionError('an immutable generation receipt was overwritten')
`;
  const result = run('python3', ['-c', script]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
