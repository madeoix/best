import { afterEach, describe, expect, it } from 'vitest';
import { createOperatorApp } from './operator-app.js';

const apps: Array<Awaited<ReturnType<typeof createOperatorApp>>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function fixture() {
  const app = await createOperatorApp({
    nodeEnv: 'test',
    serviceVersion: 'test',
    logLevel: 'silent',
    workspaceRoot: '/tmp',
    automationRoot: '/tmp',
    publicDirectory: '/tmp',
    allowedOrigins: ['http://127.0.0.1:5173'],
    host: '127.0.0.1',
    port: 0,
    operatorToken: 'test-operator-token-that-is-long-enough',
    allowedServices: [
      'smallverse-explorer.service',
      'smallverse-admin.service'
    ],
    systemctlCommand: ['/usr/bin/systemctl']
  });

  apps.push(app);
  return app;
}

describe('operator API', () => {
  it('exposes health without credentials for private monitoring', async () => {
    const app = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: '/ops/v1/health'
    });

    expect(response.statusCode).toBe(200);
  });

  it('rejects protected routes without a bearer token', async () => {
    const app = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: '/_service'
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('OPERATOR_AUTH_REQUIRED');
  });

  it('accepts the configured operator bearer token', async () => {
    const app = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: '/_service',
      headers: {
        authorization:
          'Bearer test-operator-token-that-is-long-enough'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.service).toBe(
      'smallverse-operator-api'
    );
  });
  it('allows the configured private UI origin', async () => {
    const app = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: '/_service',
      headers: {
        origin: 'http://127.0.0.1:5173',
        authorization:
          'Bearer test-operator-token-that-is-long-enough'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://127.0.0.1:5173'
    );
  });

});
