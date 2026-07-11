#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readlink,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  inspectEnvironmentFile,
  parseEnvironmentText
} from './lib/production-config.mjs';
import {
  extractVerifiedRelease,
  readInstalledRelease,
  runCommand,
  sha256,
  verifyOuterChecksum,
  verifyRelease
} from './lib/production-release.mjs';

const PATHS = Object.freeze({
  deployRoot: '/srv/smallverse',
  releases: '/srv/smallverse/releases',
  shared: '/srv/smallverse/shared',
  current: '/srv/smallverse/current',
  env: '/etc/smallverse',
  systemd: '/etc/systemd/system',
  sudoers: '/etc/sudoers.d',
  nginxAvailable: '/etc/nginx/sites-available',
  nginxEnabled: '/etc/nginx/sites-enabled'
});
const SERVICES = [
  'smallverse-public-api.service',
  'smallverse-operator-api.service'
];
const UNIT_FILES = [
  ...SERVICES,
  'smallverse-worker.service'
];

function usage() {
  console.log(`Usage: node scripts/production-deploy.mjs <command> [options]\n\n` +
    `Commands:\n` +
    `  status                     Read-only deployment summary.\n` +
    `  foundation --audit <f>    Create service identities and safe directories.\n` +
    `  install --release <file>   Verify and install an immutable release.\n` +
    `  units --commit <sha>       Install units and the reviewed sudoers file.\n` +
    `  switch --commit <sha>      Atomically switch current and start shadow APIs.\n` +
    `  shadow --enable|--disable  Manage loopback-only Nginx shadow routing.\n` +
    `  activate                   Perform an explicitly approved public cutover.\n` +
    `  finalize                   Enable verified public/operator services at boot.\n` +
    `  rollback                   Restore the latest recorded reversible state.\n\n` +
    `Common options:\n` +
    `  --apply                    Execute the plan; otherwise this is a dry run.\n` +
    `  --confirm <value>          Required command-specific confirmation.\n` +
    `  --json                     Emit JSON.\n` +
    `  --help                     Show this help.\n\n` +
    `No command installs OS packages, modifies /opt/smallverse, runs database ` +
    `migrations, or starts the ingestion worker.`);
}

function parseArguments(argv) {
  const command = argv[0];
  if (!command || command === '--help') {
    usage();
    process.exit(command ? 0 : 1);
  }

  const options = {
    command,
    apply: false,
    confirm: null,
    json: false,
    release: null,
    checksum: null,
    commit: null,
    hostname: null,
    replaceSite: null,
    state: null,
    audit: null,
    shadowMode: null
  };

  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') {
      usage();
      process.exit(0);
    }
    if (argument === '--apply') {
      options.apply = true;
      continue;
    }
    if (argument === '--json') {
      options.json = true;
      continue;
    }
    if (argument === '--enable' || argument === '--disable') {
      if (options.shadowMode) throw new Error('Choose only one of --enable or --disable');
      options.shadowMode = argument.slice(2);
      continue;
    }
    if ([
      '--confirm', '--release', '--checksum', '--commit', '--hostname',
      '--replace-site', '--state', '--audit'
    ].includes(argument)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      const key = {
        '--confirm': 'confirm',
        '--release': 'release',
        '--checksum': 'checksum',
        '--commit': 'commit',
        '--hostname': 'hostname',
        '--replace-site': 'replaceSite',
        '--state': 'state',
        '--audit': 'audit'
      }[argument];
      options[key] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!['status', 'foundation', 'install', 'units', 'switch', 'shadow', 'activate', 'finalize', 'rollback'].includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }
  if (options.commit && !/^[a-f0-9]{7,40}$/.test(options.commit)) {
    throw new Error('--commit must be a lowercase 7-40 character Git SHA');
  }
  if (options.replaceSite && !/^[A-Za-z0-9._-]+$/.test(options.replaceSite)) {
    throw new Error('--replace-site must be a plain Nginx site filename');
  }

  return options;
}

function requireRoot() {
  if (typeof process.getuid !== 'function' || process.getuid() !== 0) {
    throw new Error('--apply requires root privileges');
  }
}

function requireConfirmation(options, expected) {
  if (!options.apply) return;
  if (options.confirm !== expected) {
    throw new Error(`Refusing to apply. Re-run with --confirm ${expected}`);
  }
}

function execute(command, args, options = {}) {
  return runCommand(command, args, {
    ...options,
    timeout: options.timeout ?? 300_000,
    env: options.env ?? process.env
  });
}

function verifyInstalledRelease(root) {
  execute('/usr/bin/node', [
    path.join(root, 'scripts/verify-installed-release.mjs'),
    root
  ], {
    cwd: root,
    env: { ...process.env, SMALLVERSE_NPM_BIN: '/usr/bin/npm' }
  });
}

async function exists(filename) {
  try {
    await lstat(filename);
    return true;
  } catch {
    return false;
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

async function atomicWrite(filename, contents, mode = 0o644) {
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, contents, { mode });
  await chmod(temporary, mode);
  await rename(temporary, filename);
}

async function atomicCopy(source, destination, mode = 0o644) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}-${randomUUID()}`;
  await copyFile(source, temporary);
  await chmod(temporary, mode);
  await rename(temporary, destination);
}

async function atomicCurrent(target) {
  await mkdir(PATHS.deployRoot, { recursive: true });
  const temporary = `${PATHS.current}.tmp-${process.pid}-${randomUUID()}`;
  await rm(temporary, { force: true });
  await symlink(target, temporary);
  await rename(temporary, PATHS.current);
}

async function currentTarget() {
  try {
    if (!(await lstat(PATHS.current)).isSymbolicLink()) return null;
    return await realpath(PATHS.current);
  } catch {
    return null;
  }
}

async function writeState(action, before, after, rollback) {
  const id = `${timestamp()}-${action}-${randomUUID().slice(0, 8)}`;
  const directory = path.join(PATHS.shared, 'deployments');
  const record = {
    schemaVersion: 1,
    id,
    action,
    generatedAt: new Date().toISOString(),
    before,
    after,
    rollback
  };
  await mkdir(directory, { recursive: true });
  const filename = path.join(directory, `${id}.json`);
  await atomicWrite(filename, `${JSON.stringify(record, null, 2)}\n`, 0o600);
  await atomicWrite(path.join(directory, 'latest.json'), `${JSON.stringify(record, null, 2)}\n`, 0o600);
  return filename;
}

async function environmentValues(service) {
  const filename = path.join(PATHS.env, {
    public: 'public-api.env',
    operator: 'operator-api.env',
    worker: 'worker.env'
  }[service]);
  return parseEnvironmentText(await readFile(filename, 'utf8')).values;
}

async function validateEnvironmentSet(commit) {
  const reports = [];
  for (const [service, filename] of [
    ['public', 'public-api.env'],
    ['operator', 'operator-api.env'],
    ['worker', 'worker.env']
  ]) {
    reports.push(await inspectEnvironmentFile(
      service,
      path.join(PATHS.env, filename),
      { expectedCommit: commit }
    ));
  }
  const blockers = reports.flatMap((report) => report.findings)
    .filter((item) => item.severity === 'blocker');
  if (blockers.length > 0) {
    throw new Error(
      `Production environment validation failed:\n` +
      blockers.map((item) => `${item.code}: ${item.message}`).join('\n')
    );
  }
}

async function httpCheck(url, headers = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}: ${body.slice(0, 500)}`);
    }
    return response.status;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForHttp(url, headers = {}, options = {}) {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const intervalMs = options.intervalMs ?? 500;
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    const remainingMs = Math.max(1, deadline - Date.now());
    try {
      return await httpCheck(url, headers, Math.min(2_000, remainingMs));
    } catch (error) {
      lastError = error;
    }

    const sleepMs = Math.min(intervalMs, Math.max(0, deadline - Date.now()));
    if (sleepMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Timed out waiting for ${url}: ${detail}`);
}

async function releaseDirectory(commit) {
  const direct = path.join(PATHS.releases, commit);
  if (await exists(direct)) return direct;
  const names = await readdir(PATHS.releases).catch(() => []);
  const matches = names.filter((name) => name.startsWith(commit));
  if (matches.length !== 1) {
    throw new Error(`Unable to resolve release ${commit} under ${PATHS.releases}`);
  }
  return path.join(PATHS.releases, matches[0]);
}

async function status() {
  const current = await currentTarget();
  const releases = (await readdir(PATHS.releases, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.incoming-'))
    .map((entry) => entry.name)
    .sort();
  const services = Object.fromEntries([
    ...SERVICES,
    'smallverse-worker.service'
  ].map((service) => {
    const active = execute('systemctl', ['is-active', service], { allowFailure: true });
    const enabled = execute('systemctl', ['is-enabled', service], { allowFailure: true });
    return [service, {
      active: active.stdout.trim() || 'unknown',
      enabled: enabled.stdout.trim() || 'unknown'
    }];
  }));
  return {
    mode: 'read-only',
    current,
    releases,
    services,
    shadowEnabled: await exists(path.join(PATHS.nginxEnabled, 'smallverse-lab-shadow.conf')),
    publicEnabled: await exists(path.join(PATHS.nginxEnabled, 'smallverse-lab.conf'))
  };
}


async function ensureServiceAccount(name, shell) {
  const lookup = execute('getent', ['passwd', name], { allowFailure: true });
  if (lookup.status === 0) return false;
  execute('useradd', [
    '--system',
    '--user-group',
    '--home-dir',
    '/nonexistent',
    '--shell',
    shell,
    name
  ]);
  return true;
}

async function foundation(options) {
  if (!options.audit) throw new Error('foundation requires --audit');
  const audit = path.resolve(options.audit);
  execute(process.execPath, [
    'scripts/evaluate-production-audit.mjs',
    audit,
    '--stage',
    'inventory'
  ]);
  const expected = 'FOUNDATION';
  const plan = {
    command: 'foundation',
    audit,
    confirmation: expected,
    steps: [
      'require a passing read-only inventory audit',
      'create three non-login service accounts only when missing',
      'create /srv/smallverse release and shared directories with fixed ownership',
      'create root-only /etc/smallverse for manually supplied environment files',
      'do not install packages, create credentials, modify /opt/smallverse, or start services'
    ]
  };
  if (!options.apply) return { applied: false, plan };
  requireRoot();
  requireConfirmation(options, expected);

  const shell = (await exists('/usr/sbin/nologin'))
    ? '/usr/sbin/nologin'
    : (await exists('/sbin/nologin'))
      ? '/sbin/nologin'
      : '/bin/false';
  const created = [];
  for (const account of ['smallverse-public', 'smallverse-operator', 'smallverse-worker']) {
    if (await ensureServiceAccount(account, shell)) created.push(account);
  }

  const directories = [
    [PATHS.deployRoot, 'root:root', '0755'],
    [PATHS.releases, 'root:root', '0755'],
    [PATHS.shared, 'root:root', '0755'],
    [path.join(PATHS.shared, 'operator'), 'smallverse-operator:smallverse-operator', '0700'],
    [path.join(PATHS.shared, 'worker'), 'smallverse-worker:smallverse-worker', '0700'],
    [path.join(PATHS.shared, 'deployments'), 'root:root', '0700'],
    [path.join(PATHS.shared, 'nginx-backups'), 'root:root', '0700'],
    [PATHS.env, 'root:root', '0700']
  ];

  for (const [directory, owner, mode] of directories) {
    await mkdir(directory, { recursive: true });
    execute('chown', [owner, directory]);
    execute('chmod', [mode, directory]);
  }

  return { applied: true, plan, createdAccounts: created, directories: directories.map(([name]) => name) };
}

async function install(options) {
  if (!options.release) throw new Error('install requires --release');
  const archive = path.resolve(options.release);
  const archiveDigest = await verifyOuterChecksum(
    archive,
    options.checksum ? path.resolve(options.checksum) : undefined
  );
  const extracted = await extractVerifiedRelease(
    archive,
    path.resolve('scripts/verify-production-release.mjs')
  );
  const commit = extracted.release.commit;
  await extracted.cleanup();
  const target = path.join(PATHS.releases, commit);
  const expected = `INSTALL:${archiveDigest.slice(0, 12)}`;
  const plan = {
    command: 'install',
    release: archive,
    commit,
    archiveSha256: archiveDigest,
    target,
    confirmation: expected,
    steps: [
      'verify archive and outer SHA-256',
      'extract into an incoming directory on the release filesystem',
      'install production dependencies with scripts, audit, and funding disabled',
      'verify the installed production dependency tree',
      'make the release root-owned and immutable by convention',
      'atomically rename it to the full commit directory',
      'do not switch current or start services'
    ]
  };

  if (!options.apply) return { applied: false, plan };
  requireRoot();
  requireConfirmation(options, expected);
  await mkdir(PATHS.releases, { recursive: true, mode: 0o755 });
  await mkdir(PATHS.shared, { recursive: true, mode: 0o755 });

  if (await exists(target)) {
    const installed = await readInstalledRelease(target);
    if (installed.commit !== commit) {
      throw new Error(`Existing target has a different release commit: ${target}`);
    }
    verifyInstalledRelease(target);
    return { applied: true, noOp: true, plan, message: 'identical release already installed' };
  }

  const incomingParent = path.join(
    PATHS.releases,
    `.incoming-${commit.slice(0, 12)}-${process.pid}-${randomUUID().slice(0, 8)}`
  );
  await mkdir(incomingParent, { recursive: false, mode: 0o700 });

  try {
    const stagedArchive = path.join(incomingParent, 'release.tar.gz');
    const payload = path.join(incomingParent, 'payload');
    await copyFile(archive, stagedArchive);
    await chmod(stagedArchive, 0o600);
    if (await sha256(stagedArchive) !== archiveDigest) {
      throw new Error('Root-private release copy failed SHA-256 verification');
    }
    await mkdir(payload, { mode: 0o700 });
    execute('tar', [
      '-xzf', stagedArchive,
      '-C', payload,
      '--no-same-owner',
      '--no-same-permissions'
    ]);
    const entries = await readdir(payload, { withFileTypes: true });
    const roots = entries.filter((entry) => entry.isDirectory());
    if (entries.length !== 1 || roots.length !== 1) {
      throw new Error('Release archive did not extract to one directory');
    }
    const root = path.join(payload, roots[0].name);
    await verifyRelease(root, path.join(root, 'scripts/verify-production-release.mjs'));

    const npmVersion = execute('/usr/bin/npm', ['--version']).stdout.trim();
    if (npmVersion !== '11.18.0') {
      throw new Error(`VPS npm must equal 11.18.0 before install; found ${npmVersion}`);
    }
    if (!execute('/usr/bin/node', ['--version']).stdout.trim().startsWith('v24.')) {
      throw new Error('VPS /usr/bin/node must be Node 24.x');
    }

    execute('/usr/bin/npm', [
      'ci',
      '--omit=dev',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund'
    ], {
      cwd: root,
      timeout: 10 * 60_000,
      env: { ...process.env, NODE_ENV: 'production' }
    });
    verifyInstalledRelease(root);
    execute('chown', ['-R', 'root:root', root]);
    execute('chmod', ['-R', 'u=rwX,go=rX', root]);
    await rename(root, target);
    await rm(incomingParent, { recursive: true, force: true });
  } catch (error) {
    await rm(incomingParent, { recursive: true, force: true });
    throw error;
  }

  return { applied: true, plan, installed: target };
}

async function units(options) {
  if (!options.commit) throw new Error('units requires --commit');
  const release = await releaseDirectory(options.commit);
  const metadata = await readInstalledRelease(release);
  const commit = metadata.commit;
  const expected = `UNITS:${commit.slice(0, 12)}`;
  const plan = {
    command: 'units',
    commit,
    release,
    confirmation: expected,
    steps: [
      'validate root-owned production environment files without printing values',
      'validate systemd units and the exact sudoers allowlist',
      'atomically install three units and one sudoers file',
      'run systemctl daemon-reload',
      'do not enable or start any service'
    ]
  };
  if (!options.apply) return { applied: false, plan };
  requireRoot();
  requireConfirmation(options, expected);
  await validateEnvironmentSet(commit);

  const unitSources = UNIT_FILES.map((filename) =>
    path.join(release, 'infra/systemd', filename)
  );
  execute('systemd-analyze', ['verify', ...unitSources], { allowFailure: false });
  const sudoersSource = path.join(release, 'infra/sudoers/smallverse-operator');
  execute('visudo', ['-cf', sudoersSource]);

  for (const filename of UNIT_FILES) {
    await atomicCopy(
      path.join(release, 'infra/systemd', filename),
      path.join(PATHS.systemd, filename),
      0o644
    );
  }
  await atomicCopy(
    sudoersSource,
    path.join(PATHS.sudoers, 'smallverse-operator'),
    0o440
  );
  execute('visudo', ['-cf', path.join(PATHS.sudoers, 'smallverse-operator')]);
  execute('systemctl', ['daemon-reload']);
  return { applied: true, plan };
}

async function switchRelease(options) {
  if (!options.commit) throw new Error('switch requires --commit');
  const release = await releaseDirectory(options.commit);
  const metadata = await readInstalledRelease(release);
  const commit = metadata.commit;
  const previous = await currentTarget();
  const expected = `SWITCH:${commit.slice(0, 12)}`;
  const plan = {
    command: 'switch',
    commit,
    release,
    previous,
    confirmation: expected,
    steps: [
      'verify release and production environment files',
      'atomically point /srv/smallverse/current at the release',
      'restart only public and operator APIs',
      'verify public loopback and private operator health',
      'automatically restore the previous symlink if health fails',
      'leave the worker stopped and disabled'
    ]
  };
  if (!options.apply) return { applied: false, plan };
  requireRoot();
  requireConfirmation(options, expected);
  verifyInstalledRelease(release);
  await validateEnvironmentSet(commit);

  try {
    await atomicCurrent(release);
    for (const service of SERVICES) execute('systemctl', ['restart', service]);
    await waitForHttp('http://127.0.0.1:8780/api/v1/health');
    const operator = await environmentValues('operator');
    const operatorHost = operator.SMALLVERSE_OPERATOR_HOST === 'localhost'
      ? '127.0.0.1'
      : operator.SMALLVERSE_OPERATOR_HOST;
    const operatorAuthority = operatorHost.includes(':')
      ? `[${operatorHost}]`
      : operatorHost;
    await waitForHttp(`http://${operatorAuthority}:8781/ops/v1/health`);
  } catch (error) {
    if (previous) {
      await atomicCurrent(previous);
      for (const service of SERVICES) {
        execute('systemctl', ['restart', service], { allowFailure: true });
      }
    } else {
      for (const service of SERVICES) {
        execute('systemctl', ['stop', service], { allowFailure: true });
      }
      await rm(PATHS.current, { force: true });
    }
    throw error;
  }

  const state = await writeState(
    'switch',
    { current: previous },
    { current: release },
    { current: previous, removeCurrent: previous === null }
  );
  return { applied: true, plan, state };
}

async function snapshotNginx(names) {
  const directory = path.join(
    PATHS.shared,
    'nginx-backups',
    `${timestamp()}-${randomUUID().slice(0, 8)}`
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const records = [];

  for (const name of [...new Set(names)]) {
    const available = path.join(PATHS.nginxAvailable, name);
    const enabled = path.join(PATHS.nginxEnabled, name);
    const record = { name, available: null, enabled: null };
    if (await exists(available)) {
      const backup = path.join(directory, `${name}.available`);
      await copyFile(available, backup);
      record.available = backup;
    }
    if (await exists(enabled)) {
      const info = await lstat(enabled);
      record.enabled = info.isSymbolicLink()
        ? { type: 'symlink', target: await readlink(enabled) }
        : { type: 'file', backup: path.join(directory, `${name}.enabled`) };
      if (record.enabled.type === 'file') await copyFile(enabled, record.enabled.backup);
    }
    records.push(record);
  }

  const metadata = path.join(directory, 'snapshot.json');
  await atomicWrite(metadata, `${JSON.stringify({ records }, null, 2)}\n`, 0o600);
  return metadata;
}

async function restoreNginx(snapshot) {
  const data = JSON.parse(await readFile(snapshot, 'utf8'));
  for (const record of data.records) {
    const available = path.join(PATHS.nginxAvailable, record.name);
    const enabled = path.join(PATHS.nginxEnabled, record.name);
    await rm(available, { force: true });
    await rm(enabled, { force: true, recursive: true });
    if (record.available) await atomicCopy(record.available, available, 0o644);
    if (record.enabled?.type === 'symlink') {
      await symlink(record.enabled.target, enabled);
    } else if (record.enabled?.type === 'file') {
      await atomicCopy(record.enabled.backup, enabled, 0o644);
    }
  }
}

async function shadow(options) {
  if (!options.shadowMode) throw new Error('shadow requires --enable or --disable');
  const current = await currentTarget();
  if (!current) throw new Error('No current release is selected');
  const metadata = await readInstalledRelease(current);
  const action = options.shadowMode.toUpperCase();
  const expected = `SHADOW:${action}`;
  const plan = {
    command: 'shadow',
    mode: options.shadowMode,
    current,
    confirmation: expected,
    steps: options.shadowMode === 'enable'
      ? [
          'install the loopback-only 127.0.0.1:8088 Nginx site',
          'validate and reload Nginx',
          'run the complete read-only production smoke suite',
          'restore the prior Nginx state automatically if validation fails'
        ]
      : [
          'remove only the tracked shadow enabled-site symlink',
          'validate and reload Nginx',
          'leave the public site untouched'
        ]
  };
  if (!options.apply) return { applied: false, plan };
  requireRoot();
  requireConfirmation(options, expected);
  await validateEnvironmentSet(metadata.commit);

  const name = 'smallverse-lab-shadow.conf';
  const snapshot = await snapshotNginx([name]);
  try {
    if (options.shadowMode === 'enable') {
      await atomicCopy(
        path.join(current, 'infra/nginx/smallverse-lab.shadow.conf.template'),
        path.join(PATHS.nginxAvailable, name),
        0o644
      );
      await rm(path.join(PATHS.nginxEnabled, name), { force: true });
      await symlink(
        path.join(PATHS.nginxAvailable, name),
        path.join(PATHS.nginxEnabled, name)
      );
    } else {
      await rm(path.join(PATHS.nginxEnabled, name), { force: true });
    }

    execute('nginx', ['-t']);
    execute('systemctl', ['reload', 'nginx.service']);
    if (options.shadowMode === 'enable') {
      execute('/usr/bin/node', [
        path.join(current, 'scripts/smoke-production.mjs'),
        '--public-base',
        'http://127.0.0.1:8088',
        '--with-static'
      ], { cwd: current });
    }
  } catch (error) {
    await restoreNginx(snapshot);
    execute('nginx', ['-t'], { allowFailure: true });
    execute('systemctl', ['reload', 'nginx.service'], { allowFailure: true });
    throw error;
  }

  const state = await writeState(
    `shadow-${options.shadowMode}`,
    { nginxSnapshot: snapshot },
    { shadowEnabled: options.shadowMode === 'enable' },
    { nginxSnapshot: snapshot }
  );
  return { applied: true, plan, state };
}

function validateHostname(hostname) {
  if (!hostname || hostname.length > 253) return false;
  if (hostname === 'localhost' || /[\s/:]/.test(hostname)) return false;
  return hostname.split('.').every((label) =>
    label.length >= 1 && label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  );
}

async function activate(options) {
  if (!validateHostname(options.hostname)) {
    throw new Error('activate requires a valid --hostname');
  }
  if (!options.replaceSite) {
    throw new Error('activate requires an explicit --replace-site filename');
  }
  const current = await currentTarget();
  if (!current) throw new Error('No current release is selected');
  const metadata = await readInstalledRelease(current);
  const expected = `ACTIVATE:${options.hostname}:${metadata.commit.slice(0, 12)}`;
  const plan = {
    command: 'activate',
    hostname: options.hostname,
    replaceSite: options.replaceSite,
    current,
    confirmation: expected,
    steps: [
      `back up and disable only ${options.replaceSite}`,
      'render the tracked public Nginx site for the exact hostname',
      'validate Nginx before reload',
      'smoke the new site through loopback with the public Host header',
      'restore the prior Nginx state automatically on failure',
      'leave boot enablement to the separately approved finalize command'
    ]
  };
  if (!options.apply) return { applied: false, plan };
  requireRoot();
  requireConfirmation(options, expected);
  await validateEnvironmentSet(metadata.commit);

  const newSite = 'smallverse-lab.conf';
  const replacementPath = path.join(PATHS.nginxAvailable, options.replaceSite);
  if (await exists(replacementPath)) {
    const replacementSource = await readFile(replacementPath, 'utf8');
    const ownsTls = /(?:listen\s+[^;]*\b443\b|ssl_certificate|http3|\bquic\b)/i
      .test(replacementSource);
    if (ownsTls) {
      throw new Error([
        `Refusing to replace TLS-managed Nginx site ${options.replaceSite}.`,
        'Use infra/nginx/smallverse-lab.locations.conf.template inside the reviewed TLS server block,',
        'then validate and reload Nginx manually after review.'
      ].join(' '));
    }
  }
  const snapshot = await snapshotNginx([newSite, options.replaceSite]);
  const template = await readFile(
    path.join(current, 'infra/nginx/smallverse-lab.conf.template'),
    'utf8'
  );
  if (!template.includes('__PUBLIC_HOSTNAME__')) {
    throw new Error('Public Nginx template is missing its hostname placeholder');
  }
  const rendered = template.replaceAll('__PUBLIC_HOSTNAME__', options.hostname);

  try {
    await atomicWrite(path.join(PATHS.nginxAvailable, newSite), rendered, 0o644);
    await rm(path.join(PATHS.nginxEnabled, options.replaceSite), { force: true });
    await rm(path.join(PATHS.nginxEnabled, newSite), { force: true });
    await symlink(
      path.join(PATHS.nginxAvailable, newSite),
      path.join(PATHS.nginxEnabled, newSite)
    );
    execute('nginx', ['-t']);
    execute('systemctl', ['reload', 'nginx.service']);
    execute('/usr/bin/node', [
      path.join(current, 'scripts/smoke-production.mjs'),
      '--public-base',
      'http://127.0.0.1',
      '--host-header',
      options.hostname,
      '--with-static'
    ], { cwd: current });
  } catch (error) {
    await restoreNginx(snapshot);
    execute('nginx', ['-t'], { allowFailure: true });
    execute('systemctl', ['reload', 'nginx.service'], { allowFailure: true });
    throw error;
  }

  const state = await writeState(
    'activate',
    { nginxSnapshot: snapshot, current },
    { hostname: options.hostname, site: newSite, current },
    { nginxSnapshot: snapshot, current }
  );
  return { applied: true, plan, state };
}

async function restoreServiceEnablement(states) {
  for (const [service, enabled] of Object.entries(states ?? {})) {
    execute('systemctl', [enabled ? 'enable' : 'disable', service]);
  }
}

async function finalize(options) {
  const current = await currentTarget();
  if (!current) throw new Error('No current release is selected');
  const metadata = await readInstalledRelease(current);
  const expected = `FINALIZE:${metadata.commit.slice(0, 12)}`;
  const plan = {
    command: 'finalize',
    current,
    commit: metadata.commit,
    confirmation: expected,
    steps: [
      'validate the selected release and private environment files',
      'require a valid Nginx configuration',
      'verify public loopback and private operator health',
      'require the ingestion worker to remain inactive and disabled',
      'enable only public and operator APIs at boot',
      'record prior enablement for rollback'
    ]
  };
  if (!options.apply) return { applied: false, plan };
  requireRoot();
  requireConfirmation(options, expected);
  verifyInstalledRelease(current);
  await validateEnvironmentSet(metadata.commit);
  execute('nginx', ['-t']);
  await waitForHttp('http://127.0.0.1:8780/api/v1/health');
  const operator = await environmentValues('operator');
  const operatorHost = operator.SMALLVERSE_OPERATOR_HOST === 'localhost'
    ? '127.0.0.1'
    : operator.SMALLVERSE_OPERATOR_HOST;
  const operatorAuthority = operatorHost.includes(':')
    ? `[${operatorHost}]`
    : operatorHost;
  await waitForHttp(`http://${operatorAuthority}:8781/ops/v1/health`);

  const workerActive = execute(
    'systemctl',
    ['is-active', 'smallverse-worker.service'],
    { allowFailure: true }
  ).stdout.trim();
  const workerEnabled = execute(
    'systemctl',
    ['is-enabled', 'smallverse-worker.service'],
    { allowFailure: true }
  ).stdout.trim();
  if (workerActive === 'active' || workerEnabled === 'enabled') {
    throw new Error(
      'Refusing to finalize while the ingestion worker is active or enabled'
    );
  }

  const before = Object.fromEntries(SERVICES.map((service) => [
    service,
    execute('systemctl', ['is-enabled', service], { allowFailure: true })
      .stdout.trim() === 'enabled'
  ]));
  try {
    for (const service of SERVICES) execute('systemctl', ['enable', service]);
  } catch (error) {
    await restoreServiceEnablement(before);
    throw error;
  }

  const after = Object.fromEntries(SERVICES.map((service) => [service, true]));
  const state = await writeState(
    'finalize',
    { serviceEnabled: before },
    { serviceEnabled: after },
    { serviceEnabled: before }
  );
  return { applied: true, plan, state };
}

async function rollback(options) {
  const stateFile = options.state
    ? path.resolve(options.state)
    : path.join(PATHS.shared, 'deployments/latest.json');
  const record = JSON.parse(await readFile(stateFile, 'utf8'));
  const expected = `ROLLBACK:${record.id}`;
  const plan = {
    command: 'rollback',
    state: stateFile,
    action: record.action,
    confirmation: expected,
    steps: [
      'restore only the release symlink, Nginx snapshot, and/or service enablement recorded by this state',
      'validate Nginx before reload when applicable',
      'restart only public and operator services when a release symlink changes',
      'leave preservation data and the worker untouched'
    ]
  };
  if (!options.apply) return { applied: false, plan };
  requireRoot();
  requireConfirmation(options, expected);

  if (Object.prototype.hasOwnProperty.call(record.rollback ?? {}, 'current')) {
    if (record.rollback.current) {
      await atomicCurrent(record.rollback.current);
      for (const service of SERVICES) execute('systemctl', ['restart', service]);
    } else if (record.rollback.removeCurrent) {
      await rm(PATHS.current, { force: true });
      for (const service of SERVICES) {
        execute('systemctl', ['stop', service], { allowFailure: true });
      }
    }
  }
  if (record.rollback?.nginxSnapshot) {
    await restoreNginx(record.rollback.nginxSnapshot);
    execute('nginx', ['-t']);
    execute('systemctl', ['reload', 'nginx.service']);
  }
  if (record.rollback?.serviceEnabled) {
    await restoreServiceEnablement(record.rollback.serviceEnabled);
  }
  const state = await writeState(
    'rollback',
    { sourceState: record.id },
    { restored: record.rollback },
    { manualReviewRequired: true }
  );
  return { applied: true, plan, state };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  let result;
  if (options.command === 'status') result = await status();
  else if (options.command === 'foundation') result = await foundation(options);
  else if (options.command === 'install') result = await install(options);
  else if (options.command === 'units') result = await units(options);
  else if (options.command === 'switch') result = await switchRelease(options);
  else if (options.command === 'shadow') result = await shadow(options);
  else if (options.command === 'activate') result = await activate(options);
  else if (options.command === 'finalize') result = await finalize(options);
  else result = await rollback(options);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.plan && !result.applied) {
    console.log(`DRY RUN: ${result.plan.command}`);
    for (const step of result.plan.steps) console.log(`- ${step}`);
    console.log(`Confirmation required for apply: ${result.plan.confirmation}`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
