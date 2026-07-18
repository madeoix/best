import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runPython(script) {
  return spawnSync('python3', ['-c', script], {
    cwd: root,
    encoding: 'utf8'
  });
}

test('wearing ingestion accepts only explicit protocol evidence and never invents a snapshot join', () => {
  const script = String.raw`
import hashlib
import json
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

avatar = 'a' * 24
owner = 'b' * 24
uid_one = 'c' * 24
uid_two = 'd' * 24
neighbor_owner = 'e' * 24
item_config = '<item><description name="Observed Shirt"/></item>'

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    db_path = root / 'observatory.sqlite'
    identity_path = root / 'identity.sqlite'
    conn = sqlite3.connect(db_path)
    conn.executescript('''
      CREATE TABLE items (
        source_xml TEXT, name TEXT, tags TEXT, observed_count INTEGER,
        last_seen TEXT, variant_icon TEXT
      );
      CREATE TABLE uid_instance_configs (
        uid TEXT, source_xml TEXT, instance_name TEXT, instance_desc TEXT,
        variant_label TEXT, variant_options_json TEXT, variant_icon TEXT,
        variant_render_key TEXT, variant_render_status TEXT, space_id TEXT,
        space_name TEXT, observed_at TEXT
      );
      CREATE TABLE observations (
        uid TEXT, source_xml TEXT, owner_id TEXT, ask_price INTEGER,
        currency TEXT, session_name TEXT, observed_at TEXT, origin TEXT
      );
      CREATE TABLE protocol_events (
        id INTEGER PRIMARY KEY, session_name TEXT, event_type TEXT,
        uid TEXT, owner_id TEXT, avatar_id TEXT, source_xml TEXT,
        raw_context TEXT, confidence REAL, observed_at TEXT, origin TEXT
      );
    ''')
    conn.execute(
        'INSERT INTO items VALUES (?, ?, ?, ?, ?, ?)',
        ('items/rare/crown.xml', 'Rare Crown', 'rare', 1,
         '2026-07-15T10:00:00Z', '')
    )
    conn.execute(
        'INSERT INTO observations VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ('f' * 24, 'items/rare/crown.xml', owner, None, None,
         'crawler-01-capture', '2026-07-15T10:00:00Z', 'vps_real_client')
    )
    conn.execute(
        'INSERT INTO uid_instance_configs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ('f' * 24, 'items/rare/crown.xml', '', '', '', '[]', '', '', '',
         'space-one', '', '2026-07-15T10:00:00Z')
    )
    explicit = {
        'initId': uid_one,
        'initAvatarId': avatar,
        'initModelSource': 'items/common/observed_shirt.xml',
        'decodedConfigXML': item_config,
        'avatarConfigSnapshotId': 'snapshot-explicitly-linked',
        'evidence': 'Avatar init packet',
    }
    raw_neighbor = {
        'initId': uid_two,
        'initAvatarId': avatar,
        'initModelSource': 'items/common/observed_shoes.xml',
        'raw': 'neighbor ownerId ' + neighbor_owner,
    }
    rows = [
        (1, 'crawler-01-capture', 'avatar_wearing_uid', uid_one, owner, avatar,
         'items/common/observed_shirt.xml', json.dumps(explicit), .94,
         '2026-07-15 10:01:00', 'vps_real_client'),
        (2, 'crawler-01-capture', 'avatar_equipped_item', uid_two, None, avatar,
         'items/common/observed_shoes.xml', json.dumps(raw_neighbor), .76,
         '2026-07-15 10:02:00', 'vps_real_client'),
        # A body config is renderer evidence, not an equipped item.
        (3, 'crawler-01-capture', 'avatar_wearing_uid', '1' * 24, owner, avatar,
         'avatars/body/base/unisex/avatar.xml', json.dumps(explicit), .94,
         '2026-07-15 10:03:00', 'vps_real_client'),
        # Merely carrying avatar/item fields is not wearing evidence.
        (4, 'crawler-01-capture', 'dirty_snapshot_avatar', '2' * 24, owner, avatar,
         'items/common/not_equipped.xml', json.dumps(explicit), .95,
         '2026-07-15 10:04:00', 'vps_real_client'),
    ]
    conn.executemany('INSERT INTO protocol_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', rows)
    conn.commit()
    conn.close()

    result = subprocess.run([
        sys.executable, 'tools/beacon_avatar_wearing_sidecar.py',
        '--observatory-db', str(db_path), '--identity-db', str(identity_path),
    ], check=True, capture_output=True, text=True)
    report = json.loads(result.stdout)
    assert report['imported_or_updated'] == 2
    sidecar = sqlite3.connect(identity_path)
    sidecar.row_factory = sqlite3.Row
    projected = [dict(row) for row in sidecar.execute(
        'SELECT * FROM avatar_wearing_rtmp_events ORDER BY observatory_event_id'
    )]
    assert len(projected) == 2
    assert projected[0]['relationship'] == 'equipped'
    assert projected[0]['owner_id'] == owner
    assert projected[0]['item_config_sha256'] == hashlib.sha256(item_config.encode()).hexdigest()
    assert projected[0]['avatar_config_snapshot_id'] == 'snapshot-explicitly-linked'
    assert projected[1]['owner_id'] == ''
    assert projected[1]['avatar_config_snapshot_id'] == ''
    assert neighbor_owner not in json.dumps(projected[1])

    queue_path = root / 'queue.json'
    body_config = '<avatar gender="female"><options/></avatar>'
    queue_path.write_text(json.dumps({
        'contract': 'beacon-avatar-render-queue/v1',
        'avatars': [{
            'avatar_id': avatar,
            'config_xml': body_config,
            'captured_at': '2026-07-15T10:02:30Z',
            'space_id': 'space-one',
        }],
    }))
    output_path = root / 'observatory-sync.json'
    world_path = root / 'beacon-world-index.json'
    world_path.write_text(json.dumps({'spaces': [{
        'space_id': 'space-one',
        'space_name': 'Canonical Popular Space',
        'snapshot_url': '/space-images/space-one.png',
    }]}))
    subprocess.run([
        sys.executable, 'session/export-beacon-observatory-lite.py',
        str(db_path), str(output_path), str(queue_path), str(identity_path),
        str(world_path),
    ], check=True)
    output = json.loads(output_path.read_text())
    assert [item['source_xml'] for item in output['assets']] == ['items/rare/crown.xml']
    assert output['observations'][0]['space_name'] == 'Canonical Popular Space'
    assert output['observations'][0]['space_snapshot_url'] == '/space-images/space-one.png'
    assert output['sync_metadata']['pending_space_enrichment'] == 0
    assert len(output['avatar_wearing_events']) == 2
    assert len(output['avatar_config_snapshots']) == 1
    by_uid = {row['uid']: row for row in output['avatar_wearing_events']}
    assert by_uid[uid_one]['avatar_config_snapshot_id'] == 'snapshot-explicitly-linked'
    # The nearby queue snapshot belongs to the same avatar, but no event linked it.
    assert by_uid[uid_two]['avatar_config_snapshot_id'] is None
    assert by_uid[uid_two]['owner_id'] is None
    assert output['avatar_config_snapshots'][0]['equipped_items'] == []
`;
  const result = runPython(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('live config export prefers the authoritative RTMP shared-object table', () => {
  const script = String.raw`
import hashlib
import json
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

avatar = '1' * 24
owner = '2' * 24
config = '<avatar gender="male"><options/></avatar>'
digest = hashlib.sha256(config.encode()).hexdigest()

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    db_path = root / 'session.sqlite'
    static_root = root / 'static'
    conn = sqlite3.connect(db_path)
    conn.executescript('''
      CREATE TABLE avatar_config_observations (
        id INTEGER PRIMARY KEY, session_name TEXT, run_id TEXT,
        avatar_id TEXT, owner_id TEXT, space_id TEXT, display_name TEXT,
        gender TEXT, model TEXT, config_sha256 TEXT, config_xml TEXT,
        source_shared_object TEXT, observed_at TEXT, origin TEXT
      );
      CREATE TABLE protocol_events (
        id INTEGER PRIMARY KEY, avatar_id TEXT, owner_id TEXT, space_id TEXT,
        model_name TEXT, source TEXT, session_name TEXT, run_id TEXT,
        raw_context TEXT, observed_at TEXT, origin TEXT
      );
    ''')
    conn.execute(
        'INSERT INTO avatar_config_observations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        (1, 'crawler-02-session', 'run-02', avatar, owner, 'space-01',
         'Exact Avatar', 'male', 'avatars/body/base/unisex/avatar.xml',
         digest, config, 'Avatar.' + avatar, '2026-07-15T11:00:00Z',
         'headless_rtmp_shared_object')
    )
    # This fallback row must not replace the authoritative table row.
    conn.execute(
        'INSERT INTO protocol_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        (1, avatar, None, None, None, 'avatars/body/base/unisex/avatar.xml',
         'wrong-session', 'wrong-run', json.dumps({'decodedConfigXML': '<avatar/>'}),
         '2026-07-15T12:00:00Z', 'fallback')
    )
    conn.commit()
    conn.close()

    result = subprocess.run([
        sys.executable, 'tools/export_live_avatar_configs.py',
        '--observatory-db', str(db_path), '--static-root', str(static_root),
    ], check=True, capture_output=True, text=True)
    report = json.loads(result.stdout)
    assert report['avatars_exported'] == [avatar]
    manifest = json.loads((static_root / 'avatar-calibration' / avatar / 'manifest.json').read_text())
    assert manifest['owner_id'] == owner
    assert manifest['config_sha256'] == digest
    assert manifest['source_capture_id'] == 'run-02'
    assert manifest['source_shared_object'] == 'Avatar.' + avatar
    assert manifest['supplied_config_sha256_verified'] is True
    assert (static_root / 'avatar-calibration' / avatar / 'live-config.xml').read_text().strip() == config
`;
  const result = runPython(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('the repo-managed parser adapter prevents the external Avatar packet NameError from being silent', () => {
  const script = String.raw`
import sys
from types import ModuleType
sys.path.insert(0, 'session')
from smallverse_core_compat import extract_observatory_records

broken = ModuleType('smallverse_core.observatory_parser')
exec('''
def _extract_avatar_equipped_records(data, session_name, origin):
    if b"Avatar." in data:
        return decoded_config
    return None

def extract_observatory_records_from_bytes(data, session_name, origin="parser"):
    _extract_avatar_equipped_records(data, session_name, origin)
    return set(), [], []
''', broken.__dict__)

xml, observations, events, status = extract_observatory_records(
    broken,
    b'Avatar.' + b'a' * 24,
    'crawler-02-avatar-packet',
    origin='test',
)
assert xml == set() and observations == [] and events == []
assert status['status'] == 'guarded-external-parser'
assert status['decoded_item_config_available'] is False
assert status['known_defect'] == 'unbound-decoded-config-in-avatar-equipped-branch'
`;
  const result = runPython(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
