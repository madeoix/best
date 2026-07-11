#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const REQUIRED_FILES = [
  'RELEASE.json',
  'DEPENDENCY-INVENTORY.json',
  'SECURITY-AUDIT.json',
  '.npmrc',
  '.nvmrc',
  'MANIFEST.sha256',
  'package.json',
  'package-lock.json',
  'build/index.html',
  'apps/api/package.json',
  'apps/api/dist/entrypoints/public.js',
  'apps/api/dist/entrypoints/operator.js',
  'apps/api/dist/entrypoints/worker.js',
  'packages/contracts/package.json',
  'packages/contracts/dist/index.js',
  'packages/database/package.json',
  'packages/database/dist/index.js',
  'packages/database/dist/migrate.js',
  'packages/database/dist/migrations/20260710_001_foundation.js',
  'infra/env/public-api.env.example',
  'infra/env/operator-api.env.example',
  'infra/env/worker.env.example',
  'infra/nginx/smallverse-lab.conf.template',
  'infra/nginx/smallverse-lab.locations.conf.template',
  'infra/nginx/smallverse-lab.shadow.conf.template',
  'infra/sudoers/smallverse-operator',
  'infra/systemd/smallverse-public-api.service',
  'infra/systemd/smallverse-operator-api.service',
  'infra/systemd/smallverse-worker.service',
  'scripts/lib/production-config.mjs',
  'scripts/lib/production-release.mjs',
  'scripts/audit-dependencies.mjs',
  'scripts/production-audit.mjs',
  'scripts/production-deploy.mjs',
  'scripts/production-doctor.mjs',
  'scripts/run-db-verify.mjs',
  'scripts/evaluate-production-audit.mjs',
  'scripts/smoke-production.mjs',
  'scripts/validate-production-env.mjs',
  'scripts/verify-installed-release.mjs',
  'scripts/verify-production-release.mjs',
  'scripts/verify-postgres.mjs',
  'scripts/verify-toolchain.mjs',
  'scripts/write-dependency-inventory.mjs',
  'scripts/verify-lockfile-portability.mjs'
];

function usage() {
  console.log(
    'Usage: node scripts/verify-production-release.mjs ' +
    '<release-directory|release.tar.gz>'
  );
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed:\n` +
      `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    );
  }

  return String(result.stdout ?? '');
}

function safeArchiveEntry(entry) {
  if (!entry || entry.startsWith('/') || entry.includes('\\')) return false;
  const parts = entry.split('/').filter(Boolean);
  return !parts.includes('..');
}

async function walk(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    const info = await lstat(absolute);

    if (info.isSymbolicLink()) {
      throw new Error(`Release may not contain symlinks: ${relative}`);
    }

    if (info.isDirectory()) {
      if (relative === 'node_modules' || relative.includes('/node_modules')) {
        throw new Error(`Packaged source release may not contain node_modules: ${relative}`);
      }
      files.push(...await walk(root, absolute));
    } else if (info.isFile()) {
      files.push(relative);
    } else {
      throw new Error(`Unsupported release entry type: ${relative}`);
    }
  }

  return files;
}

async function sha256(filename) {
  const contents = await readFile(filename);
  return createHash('sha256').update(contents).digest('hex');
}

function parseManifest(text) {
  const entries = new Map();

  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const match = line.match(/^([a-f0-9]{64})  (.+)$/);

    if (!match) throw new Error(`Invalid manifest line: ${line}`);

    const [, digest, filename] = match;
    if (!safeArchiveEntry(filename)) {
      throw new Error(`Unsafe manifest path: ${filename}`);
    }
    if (entries.has(filename)) {
      throw new Error(`Duplicate manifest path: ${filename}`);
    }

    entries.set(filename, digest);
  }

  return entries;
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message);
}

function rejectPattern(text, pattern, message) {
  if (pattern.test(text)) throw new Error(message);
}

async function verifyDirectory(root) {
  const files = (await walk(root)).sort();

  for (const filename of REQUIRED_FILES) {
    if (!files.includes(filename)) {
      throw new Error(`Release is missing required file: ${filename}`);
    }
  }

  for (const filename of files) {
    if (
      /(^|\/)\.env(?:\.|$)/.test(filename) &&
      !filename.endsWith('.example')
    ) {
      throw new Error(`Release may not contain a real environment file: ${filename}`);
    }
  }

  const release = JSON.parse(
    await readFile(path.join(root, 'RELEASE.json'), 'utf8')
  );

  if (release.schemaVersion !== 2) {
    throw new Error('RELEASE.json schemaVersion must equal 2');
  }
  if (!/^[a-f0-9]{7,40}$/.test(String(release.commit ?? ''))) {
    throw new Error('RELEASE.json commit must be a 7-40 character Git SHA');
  }
  if (release.artifact !== `smallverse-${release.commit.slice(0, 12)}`) {
    throw new Error('RELEASE.json artifact does not match the release commit');
  }
  if (!release.generatedAt || Number.isNaN(Date.parse(release.generatedAt))) {
    throw new Error('RELEASE.json generatedAt is invalid');
  }
  if (Number(String(release.node).replace(/^v/, '').split('.')[0]) !== 24) {
    throw new Error(
      `Production releases must be built with Node 24.x; found ${release.node}`
    );
  }
  if (release.packageManager !== 'npm@11.18.0') {
    throw new Error(`Unexpected release package manager: ${release.packageManager}`);
  }
  if (release.releaseFormat !== 'immutable-vps-release-v1') {
    throw new Error('Unexpected production release format');
  }
  if (
    release.sourceBoundary?.authoritativeRoot !== '/opt/smallverse' ||
    release.sourceBoundary?.authoritativeDataIsReadOnly !== true ||
    release.sourceBoundary?.workerEnabledByDefault !== false
  ) {
    throw new Error('RELEASE.json source boundary is invalid');
  }

  const manifest = parseManifest(
    await readFile(path.join(root, 'MANIFEST.sha256'), 'utf8')
  );
  const expectedFiles = files.filter(
    (filename) => filename !== 'MANIFEST.sha256'
  );
  const manifestFiles = [...manifest.keys()].sort();

  if (JSON.stringify(expectedFiles) !== JSON.stringify(manifestFiles)) {
    const missing = expectedFiles.filter((filename) => !manifest.has(filename));
    const extra = manifestFiles.filter((filename) => !expectedFiles.includes(filename));
    throw new Error(
      'Manifest file set does not match release contents. ' +
      `Missing: ${missing.join(', ') || 'none'}. ` +
      `Extra: ${extra.join(', ') || 'none'}.`
    );
  }

  for (const [filename, expected] of manifest) {
    const actual = await sha256(path.join(root, filename));
    if (actual !== expected) {
      throw new Error(`Checksum mismatch: ${filename}`);
    }
  }

  const packageJson = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8')
  );
  if (packageJson.engines?.node !== '24.x') {
    throw new Error('Production release must pin package.json engines.node to 24.x');
  }
  if (packageJson.engines?.npm !== '11.x') {
    throw new Error('Production release must pin package.json engines.npm to 11.x');
  }
  if (packageJson.packageManager !== 'npm@11.18.0') {
    throw new Error('Production release must pin npm@11.18.0');
  }
  if (
    packageJson.allowScripts?.esbuild !== true ||
    packageJson.allowScripts?.['@hugeicons/svelte'] !== true ||
    Object.keys(packageJson.allowScripts ?? {}).length !== 2
  ) {
    throw new Error('Install-script allowlist must contain only reviewed packages');
  }

  const lockfile = path.join(root, 'package-lock.json');
  run(process.execPath, [
    path.join(root, 'scripts/verify-lockfile-portability.mjs'),
    '--lockfile',
    lockfile
  ]);
  const inventory = JSON.parse(
    await readFile(path.join(root, 'DEPENDENCY-INVENTORY.json'), 'utf8')
  );
  if (inventory.schemaVersion !== 1) {
    throw new Error('Dependency inventory schemaVersion must equal 1');
  }
  if (inventory.packageManager !== packageJson.packageManager) {
    throw new Error('Dependency inventory package manager mismatch');
  }
  if (inventory.lockfileSha256 !== await sha256(lockfile)) {
    throw new Error('Dependency inventory lockfile hash mismatch');
  }
  if (
    !Number.isInteger(inventory.counts?.production) ||
    inventory.counts.production < 1 ||
    !Array.isArray(inventory.packages)
  ) {
    throw new Error('Dependency inventory is incomplete');
  }

  const security = JSON.parse(
    await readFile(path.join(root, 'SECURITY-AUDIT.json'), 'utf8')
  );
  if (
    security.schemaVersion !== 1 ||
    security.ok !== true ||
    security.production?.counts?.total !== 0 ||
    (security.complete?.counts?.high ?? 0) !== 0 ||
    (security.complete?.counts?.critical ?? 0) !== 0
  ) {
    throw new Error('Release security audit does not satisfy production policy');
  }

  const units = {
    public: await readFile(
      path.join(root, 'infra/systemd/smallverse-public-api.service'),
      'utf8'
    ),
    operator: await readFile(
      path.join(root, 'infra/systemd/smallverse-operator-api.service'),
      'utf8'
    ),
    worker: await readFile(
      path.join(root, 'infra/systemd/smallverse-worker.service'),
      'utf8'
    )
  };

  requirePattern(units.public, /^User=smallverse-public$/m,
    'Public API unit must run as smallverse-public');
  requirePattern(units.operator, /^User=smallverse-operator$/m,
    'Operator API unit must run as smallverse-operator');
  requirePattern(units.worker, /^User=smallverse-worker$/m,
    'Worker unit must run as smallverse-worker');
  requirePattern(units.worker, /^ReadOnlyPaths=-\/opt\/smallverse\/workspace$/m,
    'Worker must mount the authoritative workspace read-only');
  requirePattern(units.worker, /^ReadOnlyPaths=-\/opt\/smallverse\/automation-workspace$/m,
    'Worker must mount the authoritative automation workspace read-only');
  rejectPattern(units.worker, /^ReadWritePaths=.*\/opt\/smallverse/m,
    'Worker may not receive write access anywhere under /opt/smallverse');

  for (const [name, unit] of Object.entries(units)) {
    rejectPattern(unit, /^MemoryDenyWriteExecute=true$/m,
      `${name} unit may not enable MemoryDenyWriteExecute for Node/V8`);
    requirePattern(unit, /^ExecStart=\/usr\/bin\/node /m,
      `${name} unit must use /usr/bin/node`);
  }
  requirePattern(units.operator, /^NoNewPrivileges=false$/m,
    'Operator unit requires NoNewPrivileges=false for narrow sudo');
  requirePattern(units.public, /^NoNewPrivileges=true$/m,
    'Public API unit must enable NoNewPrivileges');
  requirePattern(units.worker, /^NoNewPrivileges=true$/m,
    'Worker unit must enable NoNewPrivileges');

  const workerEnv = await readFile(
    path.join(root, 'infra/env/worker.env.example'),
    'utf8'
  );
  requirePattern(workerEnv, /^SMALLVERSE_WORKER_ENABLED=false$/m,
    'Worker environment example must remain disabled');

  const sudoers = await readFile(
    path.join(root, 'infra/sudoers/smallverse-operator'),
    'utf8'
  );
  rejectPattern(sudoers, /ALL=\(ALL(?::ALL)?\)\s+NOPASSWD:\s+ALL/,
    'Operator sudoers file may not grant unrestricted sudo');
  requirePattern(sudoers, /^smallverse-operator ALL=\(root\) NOPASSWD:/m,
    'Operator sudoers boundary is missing');

  const publicNginx = await readFile(
    path.join(root, 'infra/nginx/smallverse-lab.conf.template'),
    'utf8'
  );
  const locationsNginx = await readFile(
    path.join(root, 'infra/nginx/smallverse-lab.locations.conf.template'),
    'utf8'
  );
  const shadowNginx = await readFile(
    path.join(root, 'infra/nginx/smallverse-lab.shadow.conf.template'),
    'utf8'
  );
  requirePattern(shadowNginx, /^\s*listen 127\.0\.0\.1:8088;/m,
    'Shadow Nginx must listen only on loopback');
  rejectPattern(shadowNginx, /^\s*listen (?:80|443|\[::\])/m,
    'Shadow Nginx may not claim public listeners');

  rejectPattern(locationsNginx, /^\s*(?:listen|server_name|ssl_certificate)\b/m,
    'TLS integration fragment may not own listeners, hostnames, or certificates');

  for (const [name, config] of [
    ['public', publicNginx],
    ['locations', locationsNginx],
    ['shadow', shadowNginx]
  ]) {
    requirePattern(config, /location \^~ \/ops\/ \{[\s\S]*?return 404;/,
      `${name} Nginx must reject operator paths`);
    rejectPattern(config, /proxy_pass[^;]*8781/,
      `${name} Nginx may not proxy to the operator API`);
  }

  return {
    ok: true,
    root,
    commit: release.commit,
    packageManager: release.packageManager,
    productionDependencies: inventory.counts.production,
    securityFindings: security.complete.counts.total,
    fileCount: files.length,
    verifiedChecksums: manifest.size
  };
}

async function main() {
  const input = process.argv[2];
  if (!input || input === '--help') {
    usage();
    process.exit(input ? 0 : 1);
  }

  const absolute = path.resolve(input);
  const info = await lstat(absolute);
  let temporary = null;
  let root = absolute;

  try {
    if (info.isFile()) {
      const listing = run('tar', ['-tzf', absolute])
        .split('\n')
        .filter(Boolean);

      for (const entry of listing) {
        if (!safeArchiveEntry(entry)) {
          throw new Error(`Unsafe archive entry: ${entry}`);
        }
      }

      temporary = await mkdtemp(path.join(os.tmpdir(), 'smallverse-release-'));
      run('tar', [
        '-xzf',
        absolute,
        '-C',
        temporary,
        '--no-same-owner',
        '--no-same-permissions'
      ]);

      const entries = await readdir(temporary, { withFileTypes: true });
      const directories = entries.filter((entry) => entry.isDirectory());
      if (entries.length !== 1 || directories.length !== 1) {
        throw new Error('Release archive must contain exactly one top-level directory');
      }
      root = path.join(temporary, directories[0].name);
    } else if (!info.isDirectory()) {
      throw new Error('Release input must be a directory or .tar.gz file');
    }

    console.log(JSON.stringify(await verifyDirectory(root), null, 2));
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
