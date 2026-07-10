import {
  mkdtemp,
  mkdir,
  writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  afterEach,
  describe,
  expect,
  it
} from 'vitest';
import { createPublicApp } from './public-app.js';

const apps: Array<Awaited<ReturnType<typeof createPublicApp>>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'smallverse-api-'));
  const workspace = path.join(root, 'workspace');
  const automation = path.join(root, 'automation');

  await mkdir(workspace);
  await mkdir(automation);

  await writeFile(
    path.join(workspace, 'beacon-world-index.json'),
    JSON.stringify({
      ok: true,
      generated_at: '2026-07-10T00:00:00Z',
      spaces: [
        {
          space_id: 'space-0001',
          space_name: 'Preservation Hall',
          snapshot_url: 'https://assets.example/space.png',
          item_source_xmls: [
            'items/base/chair.xml',
            'items/base/lamp.xml'
          ],
          avatar_ids: ['avatar-001']
        }
      ],
      avatars: [
        {
          avatar_id: 'avatar-001',
          avatar_name: 'Archive Guide',
          head_url: 'https://assets.example/avatar-head.png',
          thumb_url: 'https://assets.example/avatar-thumb.png'
        }
      ],
      item_appearances: []
    })
  );

  await writeFile(
    path.join(workspace, 'observatory-sync.json'),
    JSON.stringify({
      generated_at: '2026-07-10T00:00:00Z',
      assets: [
        {
          source_xml: 'items/base/chair.xml',
          name: 'Blue Chair',
          category: 'Furniture',
          is_rare: true
        },
        {
          source_xml: 'items/base/lamp.xml',
          name: 'Gold Lamp',
          category: 'Furniture'
        }
      ],
      observations: [
        {
          source_xml: 'items/base/chair.xml',
          owner_id: 'owner-1',
          avatar_id: 'avatar-001',
          avatar_name: 'Archive Guide',
          space_id: 'space-0001',
          uid: 'uid-1',
          ask_price: 150,
          observed_at: '2026-07-09T00:00:00Z'
        },
        {
          source_xml: 'items/base/lamp.xml',
          owner_id: 'owner-1',
          avatar_id: 'avatar-001',
          space_id: 'space-0001',
          uid: 'uid-2',
          observed_at: '2026-07-08T00:00:00Z'
        }
      ],
      protocol_events: [
        {
          source_xml: 'items/base/chair.xml',
          owner_id: 'owner-1',
          avatar_id: 'avatar-001',
          space_id: 'space-0001',
          uid: 'uid-1',
          ask: 150,
          event_type: 'item.observed',
          observed_at: '2026-07-09T00:00:00Z'
        }
      ],
      uid_change_events: [
        {
          uid: 'uid-1',
          event_type: 'owner.changed',
          at: '2026-07-09T01:00:00Z'
        }
      ],
      variant_visuals: [
        {
          source_xml: 'items/base/chair.xml',
          url: 'https://assets.example/chair-variant.png',
          observed_at: '2026-07-09T02:00:00Z'
        }
      ]
    })
  );

  await writeFile(
    path.join(workspace, 'beacon-item-profiles.json'),
    JSON.stringify({
      generated_at: '2026-07-10T00:01:00Z',
      counts: { profiles: 1 },
      profiles: {
        'items/base/chair.xml': {
          ok: true,
          contract: 'smallverse-beacon-item-profile/v2',
          item: {
            source_xml: 'items/base/chair.xml',
            name: 'Cached Blue Chair'
          },
          stats: {
            known_copies: 1,
            observed_owners: 1
          },
          owners: [],
          spaces: [],
          latest: []
        }
      }
    })
  );

  await writeFile(
    path.join(workspace, 'avatar-url-index.json'),
    JSON.stringify({
      by_avatar_id: {
        'avatar-001': {
          avatar_id: 'avatar-001',
          avatar_name: 'Archive Guide',
          snapshot_url: 'https://assets.example/avatar.png'
        }
      }
    })
  );

  await writeFile(
    path.join(workspace, 'spin-prices.json'),
    JSON.stringify({
      source: 'captured.gateway.spintowin.getSpinPrices',
      generated_at: '2026-07-10T00:02:00Z',
      decoded_preview: {
        offers: [
          { spins: 1, price: 5 },
          { spins: 10, price: 40 }
        ]
      }
    })
  );

  const app = await createPublicApp({
    nodeEnv: 'test',
    serviceVersion: 'test',
    logLevel: 'silent',
    workspaceRoot: workspace,
    automationRoot: automation,
    publicDirectory: path.join(root, 'public'),
    allowedOrigins: [],
    host: '127.0.0.1',
    port: 0
  });

  apps.push(app);
  return app;
}

describe('public API', () => {
  it('reports preservation and optional database health', async () => {
    const app = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      status: 'ok',
      dependencies: {
        observatory: 'ok',
        database: 'not-configured'
      }
    });
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('serves the world export directly without SSH', async () => {
    const app = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: '/api/beacon/world'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      spaces: [{ space_id: 'space-0001' }]
    });
  });

  it('searches preserved Observatory exports', async () => {
    const app = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: '/api/beacon/observatory/search?q=chair&limit=10'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      count: 1,
      items: [
        {
          name: 'Blue Chair',
          observed_count: 1,
          owner_count: 1,
          uid_count: 1
        }
      ]
    });
  });

  it('returns Observatory item evidence without internal paths', async () => {
    const app = await fixture();
    const response = await app.inject({
      method: 'GET',
      url:
        '/api/beacon/observatory/item?' +
        'source_xml=items%2Fbase%2Fchair.xml'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      summary: {
        observation_count: 1,
        owner_count: 1,
        uid_count: 1
      }
    });
    expect(response.json()).not.toHaveProperty('path');
  });

  it('serves a cached item profile when preservation generated one', async () => {
    const app = await fixture();
    const response = await app.inject({
      method: 'GET',
      url:
        '/api/beacon/item/profile?' +
        'source_xml=items%2Fbase%2Fchair.xml'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      item: {
        name: 'Cached Blue Chair'
      },
      cache_generated_at: '2026-07-10T00:01:00Z'
    });
  });

  it('builds a read-only item profile when no cache entry exists', async () => {
    const app = await fixture();
    const response = await app.inject({
      method: 'GET',
      url:
        '/api/beacon/item/profile?' +
        'source_xml=items%2Fbase%2Flamp.xml'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      contract: 'smallverse-beacon-item-profile/v2',
      item: {
        name: 'Gold Lamp'
      },
      stats: {
        known_copies: 1,
        observed_owners: 1,
        observed_spaces: 1
      }
    });
  });

  it('returns item profiles in one bounded batch', async () => {
    const app = await fixture();
    const response = await app.inject({
      method: 'GET',
      url:
        '/api/beacon/item/profiles?' +
        'source_xml=items%2Fbase%2Fchair.xml&' +
        'source_xml=items%2Fbase%2Flamp.xml'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().profiles).toHaveProperty(
      'items/base/chair.xml'
    );
    expect(response.json().profiles).toHaveProperty(
      'items/base/lamp.xml'
    );
  });

  it('builds an avatar profile from world and evidence exports', async () => {
    const app = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: '/api/beacon/avatar/profile?avatar_id=avatar-001'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      avatar: {
        avatar_id: 'avatar-001',
        display_name: 'Archive Guide'
      },
      stats: {
        owner_count: 1,
        associated_space_count: 1
      }
    });
  });

  it('serves safe generated avatar badges from the public API', async () => {
    const app = await fixture();
    const response = await app.inject({
      method: 'GET',
      url:
        '/api/beacon/avatar/badge?' +
        'label=%3Cscript%3E&status=missing'
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('image/svg+xml');
    expect(response.body).not.toContain('<script>');
  });

  it('builds the v2 space profile without executing Python', async () => {
    const app = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: '/api/beacon/space/profile?space_id=space-0001'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      contract: 'smallverse-beacon-space-profile/v2',
      profile: {
        space: {
          space_id: 'space-0001'
        }
      }
    });
    expect(response.json().profile.useful_items[0]).toMatchObject({
      source_xml: 'items/base/chair.xml'
    });
  });

  it('serves captured spin prices instead of probing live credentials', async () => {
    const app = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: '/api/beacon/spin/prices'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      prices: [
        { spins: 1, price: 5 },
        { spins: 10, price: 40 }
      ],
      raw_available: true
    });
  });

  it('exposes versioned profile envelopes with request metadata', async () => {
    const app = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/avatars/avatar-001'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        ok: true,
        avatar: {
          avatar_id: 'avatar-001'
        }
      },
      meta: {
        nextCursor: null
      }
    });
    expect(response.json().meta.requestId).toBeTruthy();
  });

  it('does not expose operator routes on the public listener', async () => {
    const app = await fixture();
    const response = await app.inject({
      method: 'POST',
      url:
        '/ops/v1/services/' +
        'smallverse-explorer.service/restart',
      payload: {
        confirmation: 'smallverse-explorer.service',
        reason: 'test'
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('ROUTE_NOT_FOUND');
  });
});
