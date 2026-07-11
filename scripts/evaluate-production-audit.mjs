#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import process from 'node:process';

const VALID_STAGES = new Set(['inventory', 'foundation', 'shadow', 'database']);

function usage() {
  console.log(
    'Usage: node scripts/evaluate-production-audit.mjs <audit.json> ' +
    '[--stage inventory|foundation|shadow|database]'
  );
}

function parseArguments(argv) {
  let filename = null;
  let stage = 'inventory';

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') {
      usage();
      process.exit(0);
    }
    if (argument === '--stage') {
      stage = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (!filename) {
      filename = argument;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!filename) throw new Error('An audit JSON file is required');
  if (!VALID_STAGES.has(stage)) throw new Error(`Invalid stage: ${stage}`);
  return { filename, stage };
}

function major(version) {
  const match = String(version ?? '').match(/v?(\d+)/);
  return match ? Number(match[1]) : null;
}

function modeNumber(modeOctal) {
  const numeric = Number.parseInt(String(modeOctal ?? ''), 8);
  return Number.isFinite(numeric) ? numeric : null;
}

function modeAllowsGroupOrWorld(modeOctal) {
  const numeric = modeNumber(modeOctal);
  return numeric !== null && (numeric & 0o077) !== 0;
}

function modeAllowsGroupOrWorldWrite(modeOctal) {
  const numeric = modeNumber(modeOctal);
  return numeric !== null && (numeric & 0o022) !== 0;
}

function serviceState(audit, name) {
  return audit.services?.[name] ?? {};
}

function pathState(audit, name) {
  return audit.filesystem?.paths?.[name] ?? {};
}

function commandAvailable(audit, name) {
  return audit.commands?.[name]?.available === true;
}

function accountExists(audit, name) {
  return audit.accounts?.[name]?.exists === true;
}

function add(list, severity, code, message) {
  list.push({ severity, code, message });
}

function requireCommand(findings, audit, name, severity = 'blocker') {
  if (!commandAvailable(audit, name)) {
    add(findings, severity, 'COMMAND_MISSING', `${name} is unavailable.`);
  }
}

function requirePath(findings, audit, filename) {
  if (!pathState(audit, filename).exists) {
    add(findings, 'blocker', 'DEPLOYMENT_PATH_MISSING', `${filename} is missing.`);
  }
}

function validateOwnedDirectory(findings, audit, filename, owner, privateMode = false) {
  const record = pathState(audit, filename);
  if (!record.exists) return;
  if (record.type !== 'directory') {
    add(findings, 'blocker', 'DEPLOYMENT_PATH_TYPE', `${filename} must be a directory.`);
  }
  if (record.owner !== owner) {
    add(findings, 'blocker', 'DEPLOYMENT_PATH_OWNER', `${filename} must be owned by ${owner}.`);
  }
  if (privateMode ? modeAllowsGroupOrWorld(record.modeOctal) : modeAllowsGroupOrWorldWrite(record.modeOctal)) {
    add(
      findings,
      'blocker',
      'DEPLOYMENT_PATH_PERMISSIONS',
      privateMode
        ? `${filename} must not be accessible by group or world.`
        : `${filename} must not be writable by group or world.`
    );
  }
}

function evaluateFoundation(audit, findings) {
  if (major(audit.runtime?.node) !== 24) {
    add(
      findings,
      'blocker',
      'NODE_VERSION_UNSUPPORTED',
      `Production is pinned to Node 24.x; found ${audit.runtime?.node ?? 'no Node runtime'}.`
    );
  }
  if (String(audit.runtime?.npm ?? '').trim() !== '11.18.0') {
    add(
      findings,
      'blocker',
      'NPM_VERSION_UNSUPPORTED',
      `Production is pinned to npm 11.18.0; found ${audit.runtime?.npm ?? 'no npm runtime'}.`
    );
  }

  for (const filename of ['/usr/bin/node', '/usr/bin/npm']) {
    if (!pathState(audit, filename).exists) {
      add(findings, 'blocker', 'SYSTEM_RUNTIME_PATH_MISSING', `${filename} is required by deployment tooling.`);
    }
  }

  for (const command of [
    'nginx', 'tailscale', 'systemd-analyze', 'visudo', 'getent', 'useradd'
  ]) {
    requireCommand(findings, audit, command);
  }

  if (!audit.network?.tailscaleIpv4?.length) {
    add(findings, 'blocker', 'TAILSCALE_ADDRESS_MISSING', 'No Tailscale IPv4 address was reported.');
  }
  if (audit.nginx?.configTestStatus !== 0) {
    add(findings, 'blocker', 'NGINX_CONFIGURATION_INVALID', 'The existing Nginx configuration does not pass nginx -t.');
  }

  for (const account of ['smallverse-public', 'smallverse-operator', 'smallverse-worker']) {
    if (!accountExists(audit, account)) {
      add(findings, 'blocker', 'SERVICE_ACCOUNT_MISSING', `The ${account} service account is missing.`);
    }
  }

  for (const filename of [
    '/srv/smallverse/releases',
    '/srv/smallverse/shared',
    '/srv/smallverse/shared/operator',
    '/srv/smallverse/shared/worker',
    '/etc/smallverse'
  ]) {
    requirePath(findings, audit, filename);
  }

  validateOwnedDirectory(findings, audit, '/srv/smallverse/releases', 'root:root');
  validateOwnedDirectory(findings, audit, '/srv/smallverse/shared', 'root:root');
  validateOwnedDirectory(
    findings,
    audit,
    '/srv/smallverse/shared/operator',
    'smallverse-operator:smallverse-operator',
    true
  );
  validateOwnedDirectory(
    findings,
    audit,
    '/srv/smallverse/shared/worker',
    'smallverse-worker:smallverse-worker',
    true
  );
  validateOwnedDirectory(findings, audit, '/etc/smallverse', 'root:root', true);

  for (const filename of [
    '/etc/smallverse/public-api.env',
    '/etc/smallverse/operator-api.env',
    '/etc/smallverse/worker.env'
  ]) {
    const record = pathState(audit, filename);
    if (!record.exists) {
      add(findings, 'blocker', 'ENVIRONMENT_FILE_MISSING', `${filename} is missing.`);
      continue;
    }
    if (modeAllowsGroupOrWorld(record.modeOctal)) {
      add(findings, 'blocker', 'ENVIRONMENT_FILE_PERMISSIONS', `${filename} must use mode 0600 or stricter.`);
    }
    if (record.owner !== 'root:root') {
      add(findings, 'blocker', 'ENVIRONMENT_FILE_OWNER', `${filename} must be owned by root:root.`);
    }
  }

  if (!commandAvailable(audit, 'psql') || !commandAvailable(audit, 'pg_isready') || !audit.postgres?.ready) {
    add(
      findings,
      'warning',
      'POSTGRES_NOT_READY',
      'PostgreSQL is not ready. This does not block the file-backed shadow runtime, but it blocks the later database stage.'
    );
  }
}

function evaluateShadow(audit, findings) {
  const current = pathState(audit, '/srv/smallverse/current');
  if (
    !current.exists ||
    current.type !== 'symlink' ||
    !current.resolved ||
    !current.resolved.startsWith('/srv/smallverse/releases/')
  ) {
    add(
      findings,
      'blocker',
      'CURRENT_RELEASE_INVALID',
      '/srv/smallverse/current must resolve inside /srv/smallverse/releases/.'
    );
  }

  for (const filename of [
    '/etc/systemd/system/smallverse-public-api.service',
    '/etc/systemd/system/smallverse-operator-api.service',
    '/etc/systemd/system/smallverse-worker.service',
    '/etc/sudoers.d/smallverse-operator'
  ]) {
    if (!pathState(audit, filename).exists) {
      add(findings, 'blocker', 'RUNTIME_CONFIGURATION_MISSING', `${filename} is not installed.`);
    }
  }

  for (const service of ['smallverse-public-api.service', 'smallverse-operator-api.service']) {
    if (serviceState(audit, service).ActiveState !== 'active') {
      add(findings, 'blocker', 'SHADOW_SERVICE_INACTIVE', `${service} is not active.`);
    }
  }

  const worker = serviceState(audit, 'smallverse-worker.service');
  if (worker.ActiveState === 'active') {
    add(findings, 'blocker', 'WORKER_MUST_REMAIN_STOPPED', 'The ingestion worker is active before ingestion approval.');
  }
  if (worker.UnitFileState === 'enabled') {
    add(findings, 'blocker', 'WORKER_MUST_REMAIN_DISABLED', 'The ingestion worker is enabled before ingestion approval.');
  }

  const listeners = (audit.network?.listeners ?? []).join('\n');
  if (/(?:0\.0\.0\.0|\[::\]|\*):8781\b/.test(listeners)) {
    add(findings, 'blocker', 'OPERATOR_API_PUBLICLY_BOUND', 'Port 8781 is bound to a wildcard/public address.');
  }
  if (!/(?:127\.0\.0\.1|\[::1\]):8780\b/.test(listeners)) {
    add(findings, 'blocker', 'PUBLIC_API_LOOPBACK_NOT_OBSERVED', 'The public API was not observed on loopback port 8780.');
  }
  if (!/(?:127\.0\.0\.1|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}|\[fd7a:115c:a1e0:[^\]]+\]):8781\b/.test(listeners)) {
    add(findings, 'warning', 'OPERATOR_PRIVATE_LISTENER_NOT_OBSERVED', 'The audit did not observe port 8781 on loopback or Tailscale.');
  }
}

function evaluateDatabase(audit, findings) {
  for (const command of ['psql', 'pg_isready']) requireCommand(findings, audit, command);
  if (!accountExists(audit, 'postgres')) {
    add(findings, 'blocker', 'POSTGRES_ACCOUNT_MISSING', 'The postgres service account is missing.');
  }
  if (!audit.postgres?.ready) {
    add(findings, 'blocker', 'POSTGRES_UNAVAILABLE', 'PostgreSQL is not accepting local connections.');
  }
}

function evaluate(audit, stage) {
  const findings = [];

  if (audit.schemaVersion !== 1 || audit.mode !== 'read-only') {
    add(findings, 'blocker', 'AUDIT_FORMAT_INVALID', 'The input is not a recognized read-only production audit.');
    return findings;
  }

  if (!pathState(audit, '/opt/smallverse').exists) {
    add(
      findings,
      'blocker',
      'PRESERVATION_ROOT_MISSING',
      '/opt/smallverse is missing; confirm the authoritative source before deployment.'
    );
  }

  const databases = audit.filesystem?.preservationDatabases ?? [];
  if (!databases.some((entry) => entry.exists)) {
    add(findings, 'warning', 'OBSERVATORY_DATABASE_NOT_DISCOVERED', 'No Observatory SQLite database was discovered within five levels of /opt/smallverse.');
  }

  for (const command of ['systemctl', 'ss', 'sha256sum', 'tar']) {
    requireCommand(findings, audit, command, stage === 'inventory' ? 'warning' : 'blocker');
  }

  if (stage === 'inventory') return findings;

  evaluateFoundation(audit, findings);
  if (stage === 'foundation') return findings;

  if (stage === 'database') {
    evaluateDatabase(audit, findings);
    return findings;
  }

  evaluateShadow(audit, findings);
  return findings;
}

async function main() {
  const { filename, stage } = parseArguments(process.argv.slice(2));
  const audit = JSON.parse(await readFile(filename, 'utf8'));
  const findings = evaluate(audit, stage);
  const blockers = findings.filter((finding) => finding.severity === 'blocker');
  const warnings = findings.filter((finding) => finding.severity === 'warning');

  console.log(`Production audit evaluation: ${stage}`);
  console.log(`Blockers: ${blockers.length}`);
  console.log(`Warnings: ${warnings.length}`);

  for (const finding of findings) {
    console.log(`${finding.severity.toUpperCase()} ${finding.code}: ${finding.message}`);
  }
  if (findings.length === 0) console.log('PASS: no findings for this stage.');
  if (blockers.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
