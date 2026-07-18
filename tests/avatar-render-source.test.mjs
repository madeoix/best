import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildAvatarRenderSource,
  resolveAvatarRenderSource
} from '../src/lib/avatar-renderer/avatarRenderSource.js';

function json(filename) {
  return JSON.parse(readFileSync(filename, 'utf8'));
}

test('v4 fixture resolves captured Flash output and enables reconstruction', () => {
  const avatarId = '6a47397a3d4b833613ec136a';
  const source = buildAvatarRenderSource({
    avatarId,
    documents: {
      contractV4: json(
        `static/avatar-renders/${avatarId}/render-contract.v4.json`
      ),
      bundleV3: json(
        `static/avatar-renders/${avatarId}/render-bundle.v3.json`
      )
    }
  });

  assert.equal(source.status, 'ready');
  assert.equal(
    source.fullBodyUrl,
    `/avatar-oracles/${avatarId}/flash-full-body.png`
  );
  assert.equal(source.primary.source, 'captured-flash-contract-v4');
  assert.equal(source.capabilities.captured, true);
  assert.equal(source.capabilities.reconstruction, true);
  assert.deepEqual(
    source.evidenceUrls.map((entry) => entry.label),
    ['render-contract.v4.json', 'render-bundle.v3.json']
  );
});

test('legacy body-manifest fixture resolves captured PNGs without claiming O3D support', () => {
  const avatarId = '694195a7a02bd82876d3bcce';
  const source = buildAvatarRenderSource({
    avatarId,
    documents: {
      bodyManifest: json(
        `static/avatar-renders/${avatarId}/body-render-manifest.json`
      )
    }
  });

  assert.equal(source.status, 'ready');
  assert.equal(
    source.fullBodyUrl,
    `/avatar-renders/${avatarId}/saveAvatar-carved-1.png`
  );
  assert.equal(source.capabilities.captured, true);
  assert.equal(source.capabilities.reconstruction, false);
  assert.deepEqual(
    source.evidenceUrls.map((entry) => entry.label),
    ['body-render-manifest.json']
  );
});

test('unknown avatar uses preserved profile images without fabricated render paths', () => {
  const avatarId = 'unknown-avatar';
  const source = buildAvatarRenderSource({
    avatarId,
    profile: {
      avatar: {
        avatar_id: avatarId,
        head_url: 'https://assets.example/avatar-head.png',
        thumb_url: 'https://assets.example/avatar-thumb.png'
      },
      render_packet: {
        contract: 'smallverse-avatar-render-hints/v1',
        full_body_url: null,
        preview_url: null,
        thumb_url: 'https://assets.example/avatar-thumb.png',
        head_url: 'https://assets.example/avatar-head.png'
      }
    }
  });

  assert.equal(source.status, 'ready');
  assert.equal(source.primary.url, 'https://assets.example/avatar-thumb.png');
  assert.equal(source.capabilities.captured, false);
  assert.equal(source.capabilities.reconstruction, false);
  assert.equal(
    source.candidates.some((entry) =>
      entry.url.includes(`/avatar-renders/${avatarId}/saveAvatar`)
    ),
    false
  );
});

test('unknown avatar with no evidence returns an explicit missing state', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 404,
    headers: { get: () => 'application/json' }
  });

  const source = await resolveAvatarRenderSource({
    avatarId: 'missing-avatar',
    fetchImpl
  });

  assert.equal(source.status, 'missing');
  assert.equal(source.primary, null);
  assert.deepEqual(source.candidates, []);
  assert.equal(source.capabilities.reconstruction, false);
});

test('documents for a different avatar are ignored', () => {
  const source = buildAvatarRenderSource({
    avatarId: 'requested-avatar',
    documents: {
      contractV4: {
        contract: 'smallverse-avatar-render-contract/v4',
        avatar_id: 'different-avatar',
        oracle: {
          full_body: '/avatar-oracles/different-avatar/flash-full-body.png'
        }
      }
    }
  });

  assert.equal(source.status, 'missing');
  assert.equal(source.fullBodyUrl, null);
  assert.equal(source.capabilities.reconstruction, false);
});

test('sanitized calibration pack is a captured production source for male fixtures', () => {
  const source = buildAvatarRenderSource({
    avatarId: 'male-fixture',
    documents: {
      calibration: {
        contract: 'beacon-avatar-calibration/v1',
        avatar_id: 'male-fixture',
        gender: 'male',
        sanitized: true,
        states: [
          {
            body: '/avatar-calibration/male-fixture/full-00/body.png',
            preview: '/avatar-calibration/male-fixture/full-00/preview.png',
            thumb: '/avatar-calibration/male-fixture/full-00/thumb.png'
          }
        ]
      }
    }
  });

  assert.equal(source.status, 'ready');
  assert.equal(
    source.fullBodyUrl,
    '/avatar-calibration/male-fixture/full-00/body.png'
  );
  assert.equal(source.capabilities.captured, true);
  assert.equal(source.capabilities.reconstruction, false);
  assert.match(source.label, /calibration render/i);
});
