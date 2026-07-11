import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  CommandExecutor,
  CommandResult
} from './modules/operator/action-runner.js';
import { createOperatorApp } from './operator-app.js';

const apps: Array<Awaited<ReturnType<typeof createOperatorApp>>> = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

class FakeExecutor implements CommandExecutor {
  calls: Array<{ command: string; args: string[] }> = [];

  async run(command: string, args: string[]): Promise<CommandResult> {
    this.calls.push({ command, args });
    return {
      stdout: `${command} ${args.join(' ')}`,
      stderr: ''
    };
  }
}

async function fixture(
  options: {
    scopes?: string[];
    executor?: CommandExecutor;
  } = {}
) {
  const remoteSessionRoot = await mkdtemp(
    path.join(os.tmpdir(), 'smallverse-operator-session-')
  );
  temporaryDirectories.push(remoteSessionRoot);

  const app = await createOperatorApp({
    nodeEnv: 'test',
    serviceVersion: 'test',
    logLevel: 'silent',
    workspaceRoot: remoteSessionRoot,
    automationRoot: remoteSessionRoot,
    publicDirectory: remoteSessionRoot,
    allowedOrigins: ['http://127.0.0.1:5173'],
    host: '127.0.0.1',
    port: 0,
    operatorToken: 'test-operator-token-that-is-long-enough',
    operatorScopes: options.scopes ?? [
      'services:read',
      'services:write',
      'operations:read',
      'operations:write',
      'sessions:write',
      'audit:read'
    ],
    allowedServices: [
      'smallverse-explorer.service',
      'smallverse-admin.service'
    ],
    systemctlCommand: ['/usr/bin/systemctl'],
    privilegedCommand: ['/usr/bin/sudo', '-n'],
    smallverseRoot: remoteSessionRoot,
    remoteSessionRoot
  }, {
    ...(options.executor
      ? { commandExecutor: options.executor }
      : {})
  });

  apps.push(app);
  return { app, remoteSessionRoot };
}

const authorization = {
  authorization: 'Bearer test-operator-token-that-is-long-enough'
};

describe('operator API', () => {
  it('exposes health without credentials for private monitoring', async () => {
    const { app } = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: '/ops/v1/health'
    });

    expect(response.statusCode).toBe(200);
  });

  it('rejects protected routes without a bearer token', async () => {
    const { app } = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: '/_service'
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('OPERATOR_AUTH_REQUIRED');
  });

  it('accepts the configured operator bearer token', async () => {
    const { app } = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: '/_service',
      headers: authorization
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.service).toBe(
      'smallverse-operator-api'
    );
  });

  it('allows the configured private UI origin', async () => {
    const { app } = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: '/_service',
      headers: {
        origin: 'http://127.0.0.1:5173',
        ...authorization
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://127.0.0.1:5173'
    );
  });

  it('requires a database before reading audit history', async () => {
    const { app } = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: '/ops/v1/audit?limit=10',
      headers: authorization
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe(
      'AUDIT_DATABASE_UNAVAILABLE'
    );
  });

  it('enforces route scopes after authentication', async () => {
    const { app } = await fixture({
      scopes: ['operations:read']
    });
    const response = await app.inject({
      method: 'POST',
      url: '/ops/v1/actions/disk',
      headers: authorization,
      payload: {
        confirmation: 'disk',
        reason: 'Verify disk use'
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('OPERATOR_SCOPE_REQUIRED');
  });

  it('runs only an allowlisted fixed operator action', async () => {
    const executor = new FakeExecutor();
    const { app } = await fixture({ executor });
    const response = await app.inject({
      method: 'POST',
      url: '/ops/v1/actions/timer-on',
      headers: authorization,
      payload: {
        confirmation: 'timer-on',
        reason: 'Resume scheduled preservation'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.action).toBe('timer-on');
    expect(executor.calls).toEqual([
      {
        command: '/usr/bin/systemctl',
        args: ['enable', 'smallverse-explorer.timer']
      },
      {
        command: '/usr/bin/systemctl',
        args: ['start', 'smallverse-explorer.timer']
      }
    ]);
  });

  it('rejects operator actions with a mismatched confirmation', async () => {
    const executor = new FakeExecutor();
    const { app } = await fixture({ executor });
    const response = await app.inject({
      method: 'POST',
      url: '/ops/v1/actions/disk',
      headers: authorization,
      payload: {
        confirmation: 'oom-check',
        reason: 'This must be rejected'
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('CONFIRMATION_MISMATCH');
    expect(executor.calls).toEqual([]);
  });

  it('imports a complete session without returning its cookie', async () => {
    const { app, remoteSessionRoot } = await fixture();
    const cookie = 'JSESSIONID=abc123456789; SWSID=sw-session-token';
    const response = await app.inject({
      method: 'POST',
      url: '/ops/v1/sessions/import',
      headers: authorization,
      payload: {
        cookie,
        label: 'Maddie',
        avatarName: 'Maddie',
        capturedAt: '2026-07-10T20:00:00.000Z'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(cookie);
    expect(response.json().data.ready).toBe(true);
    expect(
      await readFile(path.join(remoteSessionRoot, 'cookie.txt'), 'utf8')
    ).toBe(`${cookie}\n`);
    expect(
      await readFile(path.join(remoteSessionRoot, 'svsid.txt'), 'utf8')
    ).toBe('sw-session-token\n');
    expect(
      (await stat(path.join(remoteSessionRoot, 'cookie.txt'))).mode &
      0o777
    ).toBe(0o600);
    expect(
      (await readdir(remoteSessionRoot)).some((name) =>
        name.includes('.partial-')
      )
    ).toBe(false);
  });

  it('rejects incomplete session cookies', async () => {
    const { app } = await fixture();
    const response = await app.inject({
      method: 'POST',
      url: '/ops/v1/sessions/import',
      headers: authorization,
      payload: {
        cookie: 'JSESSIONID=only-one-cookie',
        label: 'Incomplete'
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('SESSION_COOKIE_INCOMPLETE');
  });

  it('does not expose operator routes on the public-style legacy path', async () => {
    const { app } = await fixture();
    const response = await app.inject({
      method: 'POST',
      url: '/api/beacon/action',
      headers: authorization,
      payload: { action: 'disk' }
    });

    expect(response.statusCode).toBe(404);
  });
});
