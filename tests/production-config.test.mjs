import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  isTailscaleHost,
  parseEnvironmentText,
  validateEnvironment
} from '../scripts/lib/production-config.mjs';

function baseValues() {
  return {
    NODE_ENV: 'production',
    SMALLVERSE_VERSION: 'a'.repeat(40),
    SMALLVERSE_LOG_LEVEL: 'info',
    SMALLVERSE_WORKSPACE: '/opt/smallverse/workspace',
    SMALLVERSE_AUTOMATION_ROOT: '/opt/smallverse/automation-workspace',
    SMALLVERSE_PUBLIC_DIR: '/var/www/smallverse'
  };
}

test('production environment parser rejects duplicate and executable syntax', () => {
  const parsed = parseEnvironmentText([
    'NODE_ENV=production',
    'NODE_ENV=development',
    'DANGER=$(touch /tmp/nope)'
  ].join('\n'));

  assert.equal(parsed.values.NODE_ENV, 'production');
  assert.ok(parsed.findings.some((item) => item.code === 'ENV_KEY_DUPLICATE'));
  assert.ok(parsed.findings.some((item) => item.code === 'ENV_COMMAND_SUBSTITUTION'));
});

test('tracked environment examples cannot pass with template placeholders', () => {
  for (const [service, filename] of [
    ['public', 'infra/env/public-api.env.example'],
    ['operator', 'infra/env/operator-api.env.example'],
    ['worker', 'infra/env/worker.env.example']
  ]) {
    const parsed = parseEnvironmentText(readFileSync(filename, 'utf8'));
    const findings = validateEnvironment(service, parsed.values, {
      expectedCommit: 'a'.repeat(40)
    });
    assert.ok(
      findings.some((item) => item.code === 'ENV_PLACEHOLDER'),
      `${filename} should retain an explicit template blocker`
    );
  }
});

test('operator validation accepts only reviewed private boundaries', () => {
  const valid = {
    ...baseValues(),
    SMALLVERSE_OPERATOR_HOST: '100.90.80.70',
    SMALLVERSE_OPERATOR_PORT: '8781',
    SMALLVERSE_OPERATOR_SCOPES:
      'services:read,services:write,operations:read,operations:write,sessions:write,audit:read',
    SMALLVERSE_OPERATOR_TOKEN: 'x'.repeat(48),
    SMALLVERSE_OPERATOR_SERVICES:
      'smallverse-explorer.service,smallverse-admin.service',
    SMALLVERSE_SYSTEMCTL_COMMAND: '/usr/bin/sudo,-n,/usr/bin/systemctl',
    SMALLVERSE_PRIVILEGED_COMMAND: '/usr/bin/sudo,-n',
    SMALLVERSE_ROOT: '/opt/smallverse',
    SMALLVERSE_REMOTE_SESSION_ROOT: '/opt/smallverse/probe-lab-connect'
  };

  assert.equal(validateEnvironment('operator', valid, {
    expectedCommit: 'a'.repeat(40)
  }).filter((item) => item.severity === 'blocker').length, 0);
  assert.equal(isTailscaleHost('100.64.0.1'), true);
  assert.equal(isTailscaleHost('100.127.255.255'), true);
  assert.equal(isTailscaleHost('100.128.0.1'), false);

  const unsafe = {
    ...valid,
    SMALLVERSE_OPERATOR_HOST: '0.0.0.0',
    SMALLVERSE_OPERATOR_SCOPES: `${valid.SMALLVERSE_OPERATOR_SCOPES},root:all`
  };
  const findings = validateEnvironment('operator', unsafe);
  assert.ok(findings.some((item) => item.code === 'OPERATOR_HOST_NOT_PRIVATE'));
  assert.ok(findings.some((item) => item.code === 'OPERATOR_SCOPE_ALLOWLIST_CHANGED'));
});

test('worker validation keeps ingestion disabled without requiring PostgreSQL', () => {
  const values = {
    ...baseValues(),
    SMALLVERSE_WORKER_ENABLED: 'false',
    SMALLVERSE_WORKER_ID: 'casa-worker-1',
    SMALLVERSE_WORKER_POLL_MS: '2000'
  };
  assert.equal(
    validateEnvironment('worker', values, {
      expectedCommit: 'a'.repeat(40)
    }).filter((item) => item.severity === 'blocker').length,
    0
  );

  values.SMALLVERSE_WORKER_ENABLED = 'true';
  assert.ok(
    validateEnvironment('worker', values)
      .some((item) => item.code === 'WORKER_NOT_DISABLED')
  );
});

test('environment CLI never prints secret values', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'smallverse-env-test-'));
  const token = 'secret-token-that-must-never-be-printed-123456789';
  const filename = path.join(directory, 'operator.env');
  writeFileSync(filename, [
    ...Object.entries({
      ...baseValues(),
      SMALLVERSE_OPERATOR_HOST: '100.90.80.70',
      SMALLVERSE_OPERATOR_PORT: '8781',
      SMALLVERSE_OPERATOR_SCOPES:
        'services:read,services:write,operations:read,operations:write,sessions:write,audit:read',
      SMALLVERSE_OPERATOR_TOKEN: token,
      SMALLVERSE_OPERATOR_SERVICES:
        'smallverse-explorer.service,smallverse-admin.service',
      SMALLVERSE_SYSTEMCTL_COMMAND: '/usr/bin/sudo,-n,/usr/bin/systemctl',
      SMALLVERSE_PRIVILEGED_COMMAND: '/usr/bin/sudo,-n',
      SMALLVERSE_ROOT: '/opt/smallverse',
      SMALLVERSE_REMOTE_SESSION_ROOT: '/opt/smallverse/probe-lab-connect'
    }).map(([key, value]) => `${key}=${value}`)
  ].join('\n'));
  chmodSync(filename, 0o600);

  try {
    const result = spawnSync(process.execPath, [
      'scripts/validate-production-env.mjs',
      '--service', 'operator',
      '--file', filename,
      '--commit', 'a'.repeat(40),
      '--skip-metadata',
      '--json'
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.doesNotMatch(result.stdout, new RegExp(token));
    assert.match(result.stdout, /SMALLVERSE_OPERATOR_TOKEN/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
