#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import process from 'node:process';

const VALID_STAGES = new Set(['inventory', 'foundation', 'shadow']);

function usage() {
  console.log(
    'Usage: node scripts/evaluate-production-audit.mjs <audit.json> ' +
    '[--stage inventory|foundation|shadow]'
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
  if (!VALID_STAGES.has(stage)) {
    throw new Error(`Invalid stage: ${stage}`);
  }

  return { filename, stage };
}

function major(version) {
  const match = String(version ?? '').match(/v?(\d+)/);
  return match ? Number(match[1]) : null;
}

function modeAllowsGroupOrWorld(modeOctal) {
  const numeric = Number.parseInt(String(modeOctal ?? ''), 8);
  return Number.isFinite(numeric) && (numeric & 0o077) !== 0;
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

function evaluate(audit, stage) {
  const findings = [];

  if (audit.schemaVersion !== 1 || audit.mode !== 'read-only') {
    add(
      findings,
      'blocker',
      'AUDIT_FORMAT_INVALID',
      'The input is not a recognized read-only production audit.'
    );
    return findings;
  }

  if (!pathState(audit, '/opt/smallverse').exists) {
    add(
      findings,
      'blocker',
      'PRESERVATION_ROOT_MISSING',
      '/opt/smallverse is missing; do not prepare a deployment until the authoritative source location is confirmed.'
    );
  }

  const databases = audit.filesystem?.preservationDatabases ?? [];
  if (!databases.some((entry) => entry.exists)) {
    add(
      findings,
      'warning',
      'OBSERVATORY_DATABASE_NOT_DISCOVERED',
      'No Observatory SQLite database was discovered within five levels of /opt/smallverse.'
    );
  }

  for (const command of ['systemctl', 'ss', 'sha256sum', 'tar']) {
    if (!commandAvailable(audit, command)) {
      add(
        findings,
        stage === 'inventory' ? 'warning' : 'blocker',
        'COMMAND_MISSING',
        `${command} is unavailable.`
      );
    }
  }

  if (stage === 'inventory') return findings;

  if (major(audit.runtime?.node) !== 24) {
    add(
      findings,
      'blocker',
      'NODE_VERSION_UNSUPPORTED',
      `Production is pinned to Node 24.x; the audit found ${audit.runtime?.node ?? 'no Node runtime'}.`
    );
  }

  if (!pathState(audit, '/usr/bin/node').exists) {
    add(
      findings,
      'blocker',
      'SYSTEM_NODE_PATH_MISSING',
      'The systemd units require Node at /usr/bin/node.'
    );
  }

  for (const command of ['nginx', 'tailscale', 'psql', 'pg_isready']) {
    if (!commandAvailable(audit, command)) {
      add(
        findings,
        'blocker',
        'FOUNDATION_COMMAND_MISSING',
        `${command} must be installed before shadow deployment.`
      );
    }
  }

  if (!audit.network?.tailscaleIpv4?.length) {
    add(
      findings,
      'blocker',
      'TAILSCALE_ADDRESS_MISSING',
      'No Tailscale IPv4 address was reported.'
    );
  }

  if (!audit.postgres?.ready) {
    add(
      findings,
      'blocker',
      'POSTGRES_UNAVAILABLE',
      'PostgreSQL is not accepting local connections.'
    );
  }

  for (const account of [
    'smallverse-public',
    'smallverse-operator',
    'smallverse-worker'
  ]) {
    if (!accountExists(audit, account)) {
      add(
        findings,
        'blocker',
        'SERVICE_ACCOUNT_MISSING',
        `The ${account} service account is missing.`
      );
    }
  }

  for (const filename of [
    '/srv/smallverse/releases',
    '/srv/smallverse/shared',
    '/etc/smallverse'
  ]) {
    if (!pathState(audit, filename).exists) {
      add(
        findings,
        'blocker',
        'DEPLOYMENT_PATH_MISSING',
        `${filename} is missing.`
      );
    }
  }

  for (const filename of [
    '/etc/smallverse/public-api.env',
    '/etc/smallverse/operator-api.env',
    '/etc/smallverse/worker.env'
  ]) {
    const record = pathState(audit, filename);

    if (!record.exists) {
      add(
        findings,
        'blocker',
        'ENVIRONMENT_FILE_MISSING',
        `${filename} is missing.`
      );
    } else {
      if (modeAllowsGroupOrWorld(record.modeOctal)) {
        add(
          findings,
          'blocker',
          'ENVIRONMENT_FILE_PERMISSIONS',
          `${filename} must not be readable by group or world (expected mode 0600 or stricter).`
        );
      }

      if (record.owner !== 'root:root') {
        add(
          findings,
          'blocker',
          'ENVIRONMENT_FILE_OWNER',
          `${filename} must be owned by root:root.`
        );
      }
    }
  }

  if (stage === 'foundation') return findings;

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

  if (serviceState(audit, 'smallverse-public-api.service').ActiveState !== 'active') {
    add(
      findings,
      'blocker',
      'PUBLIC_API_INACTIVE',
      'The public API service is not active for shadow testing.'
    );
  }

  if (serviceState(audit, 'smallverse-operator-api.service').ActiveState !== 'active') {
    add(
      findings,
      'blocker',
      'OPERATOR_API_INACTIVE',
      'The operator API service is not active for shadow testing.'
    );
  }

  if (serviceState(audit, 'smallverse-worker.service').ActiveState === 'active') {
    add(
      findings,
      'blocker',
      'WORKER_MUST_REMAIN_STOPPED',
      'The ingestion worker is active before production handlers and reconciliation are approved.'
    );
  }

  const listeners = (audit.network?.listeners ?? []).join('\n');
  if (/(?:0\.0\.0\.0|\[::\]|\*):8781\b/.test(listeners)) {
    add(
      findings,
      'blocker',
      'OPERATOR_API_PUBLICLY_BOUND',
      'Port 8781 is listening on a wildcard/public address. It must bind only to the confirmed Tailscale address.'
    );
  }

  if (!/(?:127\.0\.0\.1|\[::1\]):8780\b/.test(listeners)) {
    add(
      findings,
      'warning',
      'PUBLIC_API_LOOPBACK_NOT_OBSERVED',
      'The audit did not observe the public API on loopback port 8780.'
    );
  }

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
    console.log(
      `${finding.severity.toUpperCase()} ${finding.code}: ${finding.message}`
    );
  }

  if (findings.length === 0) {
    console.log('PASS: no findings for this stage.');
  }

  if (blockers.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
