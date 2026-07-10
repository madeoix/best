import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
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
      spaces: [{ id: 'space-1', name: 'One' }]
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
          category: 'Furniture'
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
          uid: 'uid-1',
          observed_at: '2026-07-09T00:00:00Z'
        }
      ],
      uid_change_events: [],
      variant_visuals: []
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
  it('reports dependency health', async () => {
    const app = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe('ok');
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('serves the legacy world contract from the VPS workspace', async () => {
    const app = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: '/api/beacon/world'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      spaces: [{ id: 'space-1' }]
    });
  });

  it('searches preserved Observatory exports without SSH', async () => {
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
});
